import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

/**
 * Guard de rota interna (cron → EA). Valida o header `x-internal-token` contra `INTERNAL_TOKEN`
 * (mesmo segredo do par com o ai-service, §A.2). Usado junto de `@Public()` para que a rota do tick
 * fique fora do JWT mas ainda protegida por segredo compartilhado. Rejeita (401) se o token diferir
 * OU se `INTERNAL_TOKEN` não estiver configurado (fail-closed — nunca abre sem segredo).
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperado = (this.config.get<string>("INTERNAL_TOKEN") ?? "").trim();
    if (!esperado) {
      // Fail-closed: sem segredo configurado, a rota interna fica fechada.
      throw new UnauthorizedException("Rota interna indisponível");
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers["x-internal-token"];
    const recebido = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!recebido || recebido !== esperado) {
      throw new UnauthorizedException("Token interno inválido");
    }
    return true;
  }
}
