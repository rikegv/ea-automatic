import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Papel } from "@ea/shared-types";
import type { AuthUser } from "./auth.types";

/** Marca uma rota como pública (ignora o JwtAuthGuard global). */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige um dos papéis informados (RBAC). Sem @Roles, qualquer usuário autenticado passa. */
export const ROLES_KEY = "roles";
export const Roles = (...roles: Papel[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Libera a rota mesmo quando o usuário ainda está com senha temporária (OST-EA-GESTAO-USUARIOS).
 * Marca as poucas rotas necessárias para o primeiro acesso: trocar a senha, ler o próprio estado
 * (/auth/me) e sair (/auth/logout). Todas as demais são bloqueadas pelo SenhaTemporariaGuard.
 */
export const PERMITE_SENHA_TEMPORARIA_KEY = "permiteSenhaTemporaria";
export const PermiteSenhaTemporaria = () => SetMetadata(PERMITE_SENHA_TEMPORARIA_KEY, true);

/** Injeta o usuário autenticado no handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
