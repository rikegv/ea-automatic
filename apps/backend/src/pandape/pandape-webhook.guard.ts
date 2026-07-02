import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/**
 * Guard de origem do webhook RECEPTOR do Pandapé (INT-1 / §A.5). Fica junto de `@Public()`: a rota
 * sai do JWT global, mas é protegida aqui por DOIS mecanismos config-driven, autorizando se passar em
 * PELO MENOS UM que esteja configurado:
 *
 *  1) Token compartilhado — env `PANDAPE_WEBHOOK_TOKEN`. Aceita quando o header
 *     `x-pandape-webhook-token` bate (comparação em tempo constante).
 *  2) Allowlist de IP — env `PANDAPE_WEBHOOK_IPS` (CSV). Extrai o IP de origem de `X-Forwarded-For`
 *     (o app está atrás do proxy do Fernando e NÃO tem `trust proxy` no Express, então NÃO confiamos
 *     em `req.ip`; parseamos o XFF — primeiro IP da lista — com fallback para `socket.remoteAddress`).
 *     Normaliza IPv6-mapped (`::ffff:`).
 *
 * Fail-closed: se NENHUM dos dois estiver configurado, a rota fica FECHADA (401) — aguardando o
 * token/IPs de Fernando/André. Se algum estiver configurado e a request não satisfaz nenhum → 401.
 *
 * §A.6: nunca loga token, IP bruto nem payload. Mensagens genéricas.
 *
 * PONTO DE EXTENSÃO (HMAC): caso o suporte confirme que o Pandapé ASSINA o payload, adicionar aqui a
 * verificação de assinatura (ex.: header `x-pandape-signature` = HMAC-SHA256 do corpo cru com um
 * segredo compartilhado) como um terceiro mecanismo. Hoje implementamos apenas token + IP.
 */
@Injectable()
export class PandapeWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const tokenEsperado = (this.config.get<string>("PANDAPE_WEBHOOK_TOKEN") ?? "").trim();
    const ipsRaw = (this.config.get<string>("PANDAPE_WEBHOOK_IPS") ?? "").trim();
    const ipsPermitidos = ipsRaw
      .split(",")
      .map((ip) => this.normalizarIp(ip.trim()))
      .filter((ip) => ip.length > 0);

    const tokenConfigurado = tokenEsperado.length > 0;
    const ipConfigurado = ipsPermitidos.length > 0;

    // Fail-closed: sem nenhum mecanismo configurado, a rota fica fechada.
    if (!tokenConfigurado && !ipConfigurado) {
      throw new UnauthorizedException("Webhook Pandapé indisponível");
    }

    const req = context.switchToHttp().getRequest<Request>();

    // (1) Token compartilhado.
    if (tokenConfigurado && this.tokenBate(req, tokenEsperado)) {
      return true;
    }

    // (2) Allowlist de IP (via XFF, sem confiar no req.ip).
    if (ipConfigurado && ipsPermitidos.includes(this.ipDeOrigem(req))) {
      return true;
    }

    // Configurado mas não satisfeito por nenhum mecanismo.
    throw new UnauthorizedException("Origem do webhook não autorizada");
  }

  private tokenBate(req: Request, esperado: string): boolean {
    const header = req.headers["x-pandape-webhook-token"];
    const recebido = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!recebido) return false;
    return this.igualdadeConstante(recebido, esperado);
  }

  /** Comparação em tempo constante; cai para `===` se os tamanhos diferirem (evita throw do crypto). */
  private igualdadeConstante(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * IP de origem SEM confiar no `req.ip` (sem `trust proxy`): usa o PRIMEIRO IP do `X-Forwarded-For`
   * (o cliente real, injetado pelo proxy do Fernando); fallback para `socket.remoteAddress`.
   */
  private ipDeOrigem(req: Request): string {
    const xff = req.headers["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    const primeiro = raw?.split(",")[0]?.trim();
    if (primeiro) return this.normalizarIp(primeiro);
    return this.normalizarIp(req.socket?.remoteAddress ?? "");
  }

  /** Normaliza IPv6-mapped IPv4 (`::ffff:1.2.3.4` → `1.2.3.4`). */
  private normalizarIp(ip: string): string {
    return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  }
}
