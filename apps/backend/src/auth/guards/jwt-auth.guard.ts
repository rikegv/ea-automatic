import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators";
import type { AccessTokenPayload } from "../auth.types";

/** Guard global: valida o access token (HS256). Rotas @Public() são liberadas. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException("Token de acesso ausente");

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.typ !== "access") throw new Error("tipo de token inválido");
      req.user = {
        id: payload.sub,
        email: payload.email,
        papel: payload.papel,
        senhaTemporaria: payload.senhaTemporaria ?? false,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Token de acesso inválido ou expirado");
    }
  }

  /**
   * O access token vem SEMPRE no header `Authorization: Bearer`.
   *
   * O fallback para um cookie `ea_access` foi REMOVIDO (OST do refresh de sessão, Bloco 5): o backend
   * nunca setou esse cookie em lugar nenhum, só o `ea_refresh` (httpOnly, path `/api/auth`), então o
   * caminho era código morto. Varredura feita no repositório antes de remover: nenhuma outra
   * referência a `ea_access`, nem no frontend, nem em teste, nem em infra.
   */
  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  }
}
