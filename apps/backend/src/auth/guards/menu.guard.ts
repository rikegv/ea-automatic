import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators";
import type { AuthUser } from "../auth.types";
import { menuDaOperacao } from "../../domain/menus";
import { MenuAreasService } from "../menu-areas.service";
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
 *   3. SUPER_ADMIN → BYPASS TOTAL. Vê e faz tudo, acima da segmentação de área e sem depender de
 *      marcação (evita alguém se trancar fora do próprio sistema).
 *   4. operação NÃO reivindicada por menu nenhum → ABERTA (leitura de catálogo, leitura compartilhada,
 *      operação de trabalho). Passa. É a régua "ler é trabalho", preservada.
 *   5. MASTER → passa se o menu da operação estiver em alguma ÁREA dele. Não depende de marcação
 *      (continua mandando na área inteira), mas deixou de mandar fora dela.
 *   6. COMUM → exige TER o menu **e** que o menu esteja em alguma área dele. Senão, 403.
 *
 * O QUE MUDOU NA SEGMENTAÇÃO DE ÁREA (fundação do módulo de A&S): o bypass do MASTER deixou de ser
 * total e virou "bypass DENTRO da minha área". O papel deixou de significar "vê tudo" e passou a
 * significar "manda na minha área". O SUPER_ADMIN não mudou.
 *
 * A ÁREA NUNCA CONCEDE, SÓ LIMITA: ela é verificada DEPOIS da permissão de menu, nunca no lugar dela.
 * Um COMUM não ganha um menu por estar na área; ele só perde um menu por estar fora dela.
 *
 * CUSTO DE CONSULTA: o MASTER, que antes saía no caso 3 sem tocar o banco, agora consulta nas
 * operações reivindicadas, porque a área vem do BANCO e não do token (para a troca de área valer sem
 * relogar). É UMA consulta (`permissaoDoUsuario` traz menus e áreas juntos) e só nas operações que já
 * eram gatadas: rota aberta e SUPER_ADMIN continuam sem pagar query.
 */
@Injectable()
export class MenuGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly menus: MenusService,
    private readonly menuAreas: MenuAreasService,
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

    // Bypass do SUPER_ADMIN: acima da segmentação, não depende de dado de tabela.
    if (user.papel === "SUPER_ADMIN") return true;

    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const menuExigido = menuDaOperacao(controller, handler);
    if (!menuExigido) return true; // operação aberta (não reivindicada por menu).

    const { codigos, areas } = await this.menus.permissaoDoUsuario(user.id);

    // TETO DE ÁREA, aplicado antes da marcação porque vale para MASTER e COMUM igualmente. Fora da
    // área, o menu não existe para este usuário, tenha ele a marcação ou não.
    // A ÁREA DO MENU vem da TABELA (via cache do `MenuAreasService`), não mais do código: é o que
    // permite ao diretor mudar a marcação e ela valer na requisição seguinte, sem restart.
    if (!(await this.menuAreas.visivel(menuExigido, areas))) {
      // §A.6: código do menu, nunca a área alheia nem PII. A mensagem diz o que fazer sem revelar a
      // topologia de permissão de outras pessoas.
      throw new ForbiddenException(
        `Acesso negado: o menu "${menuExigido}" não pertence à sua área de atuação.`,
      );
    }

    // MASTER manda na área inteira: dentro dela, segue sem depender de marcação.
    if (user.papel === "MASTER") return true;

    if (codigos.has(menuExigido)) return true;

    // §A.6: só o código do menu e do controller/handler; nada de PII.
    throw new ForbiddenException(
      `Acesso negado: esta operação exige o menu "${menuExigido}", que não está liberado para o seu usuário.`,
    );
  }
}
