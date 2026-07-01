import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SENHA_TEMPORARIA_CODE } from "@ea/shared-types";
import type { Request } from "express";
import { IS_PUBLIC_KEY, PERMITE_SENHA_TEMPORARIA_KEY } from "../decorators";

/**
 * Troca obrigatória de senha no primeiro acesso (OST-EA-GESTAO-USUARIOS). Registrado como APP_GUARD
 * logo APÓS o JwtAuthGuard (que popula req.user) e ANTES do RolesGuard. Enquanto o usuário estiver
 * com senha temporária, só as rotas marcadas com @PermiteSenhaTemporaria() (trocar-senha, me,
 * logout) e as @Public() ficam liberadas; qualquer outra retorna 403 com um código estável no corpo
 * para o frontend redirecionar à tela de troca.
 */
@Injectable()
export class SenhaTemporariaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const permite = this.reflector.getAllAndOverride<boolean>(PERMITE_SENHA_TEMPORARIA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permite) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    // Sem usuário (rota não autenticada / JwtAuthGuard decidirá) — não é papel deste guard barrar.
    if (!user) return true;

    if (user.senhaTemporaria) {
      throw new ForbiddenException({
        code: SENHA_TEMPORARIA_CODE,
        message: "SENHA_TEMPORARIA: troque a senha antes de continuar",
      });
    }
    return true;
  }
}
