import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * OriginGuard (padrão CentraAtend, §A.2): em métodos mutantes, se houver header Origin ele
 * precisa estar na allowlist (ALLOWED_ORIGINS). Origin ausente (chamada same-origin via proxy
 * do Next / server-to-server) é permitido. Mitiga CSRF no fluxo com cookie.
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

    const origin = req.headers.origin;
    if (!origin) return true;
    if (this.allowed.includes(origin)) return true;

    throw new ForbiddenException("Origin não permitida");
  }
}
