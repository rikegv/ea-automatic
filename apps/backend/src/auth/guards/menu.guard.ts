import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators";
import type { AuthUser } from "../auth.types";
import { menuDaOperacao } from "../../domain/menus";
import { MenusService } from "../menus.service";

/**
 * GUARD DE PERMISSÃO DE MENU (OST permissão de menu por usuário) — Bloco 3.
 *
 * PONTO ÚNICO de autorização por menu, global, depois do RolesGuard. Esconder o item da barra lateral
 * NÃO basta: quem digita a URL na mão bate aqui e é barrado. A checagem é POR OPERAÇÃO
 * (`Controller.handler`), derivada do menu que o usuário tem (`domain/menus`), nunca por controller
 * nem por tela espalhada.
 *
 * REGRA, na ordem:
 *   1. rota `@Public()` → não é assunto de menu (auth, health, webhooks, VT). Passa.
 *   2. sem usuário no request → deixa o JwtAuthGuard (que roda antes) tratar. Passa aqui.
 *   3. MASTER / SUPER_ADMIN → BYPASS TOTAL. Veem e fazem tudo, sem depender de marcação (evita alguém
 *      se trancar fora). É a mesma regra do `hasMenu` que o diretor já roda no outro sistema.
 *   4. operação NÃO reivindicada por menu nenhum → ABERTA (leitura de catálogo, leitura compartilhada,
 *      operação de trabalho). Passa. É a régua "ler é trabalho", preservada.
 *   5. operação reivindicada por um menu → exige que o usuário TENHA esse menu. Senão, 403.
 *
 * Só consulta o banco no caso 5 (operação gated + usuário não-admin), então rota aberta e requisição
 * de admin não pagam query.
 */
@Injectable()
export class MenuGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly menus: MenusService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthUser | undefined;
    if (!user) return true; // sem sessão: o JwtAuthGuard já barrou antes daqui.

    // Bypass de administrador: não depende de dado de tabela.
    if (user.papel === "MASTER" || user.papel === "SUPER_ADMIN") return true;

    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const menuExigido = menuDaOperacao(controller, handler);
    if (!menuExigido) return true; // operação aberta (não reivindicada por menu).

    const doUsuario = await this.menus.codigosDoUsuario(user.id);
    if (doUsuario.has(menuExigido)) return true;

    // §A.6: só o código do menu e do controller/handler; nada de PII.
    throw new ForbiddenException(
      `Acesso negado: esta operação exige o menu "${menuExigido}", que não está liberado para o seu usuário.`,
    );
  }
}
