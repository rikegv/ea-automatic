import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import type { Request } from "express";
import { ROLES_KEY } from "../decorators";

/**
 * RBAC (§A.3). Separa CONSULTOR de ADMINISTRAÇÃO — nunca consultor de consultor.
 * Não há segmentação de visão por frente: a esteira é coletiva. As rotas que exigem papel
 * usam @Roles(); o resto, autenticado, é visível a todos.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Papel[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user || !required.includes(user.papel)) {
      throw new ForbiddenException("Acesso restrito à administração");
    }
    return true;
  }
}
