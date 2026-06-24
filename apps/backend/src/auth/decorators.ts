import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Papel } from "@ea/shared-types";
import type { AuthUser } from "./auth.types";

/** Marca uma rota como pública (ignora o JwtAuthGuard global). */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige um dos papéis informados (RBAC). Sem @Roles, qualquer usuário autenticado passa. */
export const ROLES_KEY = "roles";
export const Roles = (...roles: Papel[]) => SetMetadata(ROLES_KEY, roles);

/** Injeta o usuário autenticado no handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
