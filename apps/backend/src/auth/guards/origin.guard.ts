import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * OriginGuard (padrão CentraAtend, §A.2): mitiga CSRF no fluxo COM COOKIE. Em métodos mutantes:
 *  - Requisições autenticadas por **Bearer token** são liberadas em qualquer origem: o token vive
 *    em memória do front e o browser NÃO o auto-envia, então um atacante cross-site não consegue
 *    anexá-lo — não há vetor de CSRF. É isso que permite o acesso por túnel/ZeroTier/servidor-ponte
 *    (Origin ≠ localhost) sem afrouxar a proteção.
 *  - Sem Bearer (fluxo cookie, ex.: /refresh): se houver Origin, precisa estar na allowlist
 *    (ALLOWED_ORIGINS). Origin ausente (same-origin / server-to-server) é permitido.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: string[];

  constructor(config: ConfigService) {
    this.allowed = (config.get<string>("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) return true;

    // Bearer não é auto-enviado pelo browser → imune a CSRF (a autenticação real é do JwtAuthGuard).
    const auth = req.headers.authorization;
    if (typeof auth === "string" && auth.startsWith("Bearer ")) return true;

    const origin = req.headers.origin;
    if (!origin) return true;
    if (this.allowed.includes(origin)) return true;

    throw new ForbiddenException("Origin não permitida");
  }
}
