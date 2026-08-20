import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import type { Request } from "express";
import { ROLES_KEY } from "../decorators";
import { MenuAreasService } from "../menu-areas.service";
import { MenusService } from "../menus.service";

/**
 * RBAC (§A.3). Separa CONSULTOR de ADMINISTRAÇÃO, nunca consultor de consultor.
 * As rotas que exigem papel usam @Roles(); o resto, autenticado, é visível a todos.
 *
 * A SEGUNDA DIMENSÃO, adicionada na segmentação de área: além do PAPEL, o guard passou a checar a
 * ÁREA. Papel diz QUANTO o usuário manda; área diz ONDE.
 *
 * POR QUE A ÁREA PRECISOU ENTRAR AQUI, e não só no `MenuGuard`: o sistema tem DUAS autorizações
 * independentes, e só uma passa pelo menu. O levantamento achou 12 superfícies gatadas por `@Roles`
 * que NENHUM menu reivindica, as controllers inteiras de Usuários e Diagnóstico entre elas. Com o
 * filtro só no `MenuGuard`, um Master de A&S continuaria alcançando a tela de Usuários pela API, e é
 * exatamente lá que as ÁREAS são cadastradas: ele se concederia a área ADM e a segmentação inteira
 * viraria decorativa. A porta dos fundos fecha aqui.
 *
 * ORDEM DAS CHECAGENS, e ela importa: PAPEL primeiro, ÁREA depois. Quem não tem o papel é barrado
 * pela mensagem de sempre, sem que a área precise sequer ser consultada; assim o comportamento do
 * COMUM não mudou em nada, e o banco só é tocado por quem passou no papel.
 *
 * O SUPER_ADMIN NÃO É FILTRADO POR ÁREA (está acima da segmentação), e é isso que garante que nenhum
 * erro de cadastro de área seja irrecuperável: o diretor sempre entra e conserta.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly menus: MenusService,
    private readonly menuAreas: MenuAreasService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Papel[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user || !required.includes(user.papel)) {
      throw new ForbiddenException("Acesso restrito à administração");
    }

    // Acima da segmentação: nunca filtrado por área.
    if (user.papel === "SUPER_ADMIN") return true;

    // Área da operação: sai do menu que a reivindica (com a área VIGENTE da tabela) quando existe, e
    // do mapa por controller quando não existe (as superfícies só de `@Roles`, que a tela do diretor
    // não governa, limitação aceita). O default é ADM, a direção fail-closed. Ver `areasDaOperacao`.
    const daOperacao = await this.menuAreas.areasDaOperacao(
      context.getClass().name,
      context.getHandler().name,
    );
    const doUsuario = await this.menus.areasDoUsuario(user.id);
    if (daOperacao.some((a) => doUsuario.has(a))) return true;

    // §A.6: nenhuma PII, nenhuma área alheia. Só o fato de a operação ser de outra área.
    throw new ForbiddenException("Acesso restrito: esta operação é de outra área de atuação.");
  }
}
