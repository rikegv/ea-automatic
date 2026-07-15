import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

/** Conteúdo do token de sessão do candidato. Sem CPF: só o vínculo com a admissão (§A.6). */
export interface VtSessaoPayload {
  /** id da admissão que o formulário preenche. */
  sub: string;
  /** Discriminador de tipo. O JwtAuthGuard global exige `typ === "access"`, então um token de VT
   *  NÃO abre nenhuma rota interna do sistema, mesmo sendo assinado com o mesmo segredo. */
  typ: "vt";
}

/** Anexa a sessão do candidato ao request (uso interno do módulo de VT). */
export interface RequestComVt extends Request {
  vt?: { admissaoId: string };
}

/**
 * Protege as rotas do formulário de VT depois da identificação (§A.17 Parte A).
 *
 * As rotas do candidato são @Public() (não têm usuário do sistema), então a proteção real é este
 * guard local, no mesmo padrão do PandapeWebhookGuard (§A.5): @Public() só tira o JWT global do
 * caminho, quem autoriza é o guard da rota.
 *
 * O token é emitido pelo /vt/identificar e vale por poucos minutos. Por MINIMIZAÇÃO (§A.6) ele
 * carrega apenas o id da admissão: o CPF e a data de nascimento não são reenviados a cada chamada
 * nem viajam dentro do token.
 */
@Injectable()
export class VtSessaoGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestComVt>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Sessão do formulário ausente");

    try {
      const payload = await this.jwt.verifyAsync<VtSessaoPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.typ !== "vt") throw new Error("tipo de token inválido");
      req.vt = { admissaoId: payload.sub };
      return true;
    } catch {
      // Mensagem genérica: não revela se o token expirou, foi forjado ou é de outro tipo.
      throw new UnauthorizedException("Sessão do formulário inválida ou expirada");
    }
  }
}
