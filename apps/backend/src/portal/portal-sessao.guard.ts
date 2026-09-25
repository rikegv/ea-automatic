import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import type { Request } from "express";

/**
 * Sessão do candidato no Portal. Molde do `VtSessaoGuard`, com três diferenças que importam.
 *
 * 1. CHAVE PRÓPRIA, `PORTAL_SESSION_PUBLIC_KEY`, separada do `JWT_ACCESS_SECRET` (decisão 10 do
 *    documento de regras). O VT reaproveita o segredo do sistema e se protege só pelo discriminador
 *    de tipo; aqui o portal fica exposto por uma barreira externa, e um segredo compartilhado com a
 *    autenticação interna é um ovo a mais na mesma cesta. Sem a variável, a rota nasce FECHADA.
 * 2. O `jti` DO LINK VIAJA NA SESSÃO. É por ele que a cota de 25 arquivos e 60 MB é contada, e ele
 *    precisa vir do TOKEN e nunca do corpo: se o cliente pudesse informar o link, trocaria de link
 *    a cada arquivo e a cota nunca se esgotaria.
 * 3. O BILHETE É ASSIMÉTRICO, Ed25519, E O ALGORITMO É FIXADO EXPLICITAMENTE (condição B5).
 *
 * POR QUE A MIGRAÇÃO ACONTECEU AGORA, e o motivo não é o algoritmo, é a JANELA. Não existe emissor
 * deste bilhete hoje: a frente de identidade, que vai emiti-lo, é outra entrega. Então não há nada
 * em circulação para manter compatível, não há convivência de dois algoritmos e não há janela de
 * migração. Feita depois que o emissor existir, ela viraria migração de credencial viva, que é o
 * modo de falha caro. Hoje custa um arquivo.
 *
 * E O QUE ERA INEGOCIÁVEL VEIO JUNTO: a verificação FIXA o algoritmo. Antes ela passava só o
 * segredo, sem allowlist de algoritmo, e enquanto a chave era simétrica isso era contido pela
 * própria biblioteca. Com chave pública, verificação sem algoritmo fixado é confusão de algoritmo
 * clássica: um bilhete forjado com HMAC sobre a chave PÚBLICA passaria. Aqui o cabeçalho é lido, o
 * `alg` é conferido contra `EdDSA` e a recusa vem ANTES da conta da assinatura. Não existe queda
 * para segredo simétrico, e não existe queda para o segredo do sistema.
 *
 * SEM `JwtService`, e isso é consequência e não escolha: a biblioteca que ele embrulha não faz
 * EdDSA. A verificação é o `crypto` nativo do Node, no mesmo molde já provado em produção pelo
 * `vt-coleta/vt-link-token.ts` e repetido em `portal-bilhete.ts`.
 *
 * §A.6, e é o veto V5: o token do portal NÃO carrega CPF nem nome, ao contrário do token do link do
 * VT. Só o vínculo com a admissão e o identificador do link. Isso não pode se perder na migração, e
 * não se perdeu.
 */
export interface PortalSessaoPayload {
  /** id da admissão. */
  sub: string;
  /** `jti` do link que originou a sessão. Chave da cota. */
  jti: string;
  /** Discriminador. O JwtAuthGuard global exige `typ === "access"`, então isto não abre rota interna. */
  typ: "portal";
  /** Expira em (epoch, segundos). */
  exp: number;
}

export interface RequestComPortal extends Request {
  portal?: { admissaoId: string; jtiLink: string };
}

/** O único algoritmo aceito. Fixado aqui, e conferido antes de qualquer conta. */
const ALG_ACEITO = "EdDSA";

@Injectable()
export class PortalSessaoGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  /**
   * A chave pública Ed25519, PEM SPKI em base64 (mesmo formato das demais chaves da casa).
   * Devolve `null` quando ausente ou ilegível: chave quebrada FECHA a rota, nunca a abre e nunca
   * derruba o serviço no boot.
   */
  private chavePublica(): KeyObject | null {
    const b64 = (this.config.get<string>("PORTAL_SESSION_PUBLIC_KEY") ?? "").trim();
    if (!b64) return null;
    try {
      const pem = Buffer.from(b64, "base64").toString("utf8");
      const chave = createPublicKey(pem);
      // Chave que não seja Ed25519 é configuração errada, e configuração errada FECHA.
      return chave.asymmetricKeyType === "ed25519" ? chave : null;
    } catch {
      return null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const chave = this.chavePublica();
    // Fail-closed, no molde do `PandapeWebhookGuard`: sem chave configurada a rota não abre, e não
    // há fallback para o segredo do sistema nem para segredo simétrico nenhum. Um fallback assim
    // ligaria o portal externo à autenticação interna no dia em que alguém esquecesse uma variável.
    if (!chave) throw new UnauthorizedException("Portal indisponível");

    const req = context.switchToHttp().getRequest<RequestComPortal>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Sessão ausente");

    try {
      const payload = this.verificar(token, chave);
      req.portal = { admissaoId: payload.sub, jtiLink: payload.jti };
      return true;
    } catch {
      // Mensagem única: não revela se o token expirou, foi forjado ou é de outro tipo.
      throw new UnauthorizedException("Sessão inválida ou expirada");
    }
  }

  /** Confere formato, ALGORITMO, assinatura, validade e claims. Lança em qualquer desvio. */
  private verificar(token: string, chave: KeyObject): PortalSessaoPayload {
    const partes = token.split(".");
    if (partes.length !== 3) throw new Error("token malformado");
    const [cabecalhoB64, payloadB64, sigB64] = partes;

    const cabecalho = JSON.parse(Buffer.from(cabecalhoB64, "base64url").toString("utf8")) as {
      alg?: string;
    };
    // A FIXAÇÃO DO ALGORITMO, e ela vem antes da conta da assinatura de propósito.
    if (cabecalho.alg !== ALG_ACEITO) throw new Error("alg inesperado");

    const entrada = `${cabecalhoB64}.${payloadB64}`;
    const ok = verify(null, Buffer.from(entrada, "utf8"), chave, Buffer.from(sigB64, "base64url"));
    if (!ok) throw new Error("assinatura invalida");

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as PortalSessaoPayload;
    if (payload.typ !== "portal") throw new Error("tipo de token invalido");
    if (!payload.sub || !payload.jti) throw new Error("claims incompletos");
    const agora = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= agora) throw new Error("token expirado");
    return payload;
  }
}
