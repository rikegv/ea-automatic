import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { MenuGuard } from "../../auth/guards/menu.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  masterPrecisaDeMarcacao,
  menuDaOperacao,
} from "../../domain/menus";
import { EtapasFunilAdminController } from "./etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas-funil.controller";

/**
 * ─ QUEM EDITA A LISTA DE ETAPAS É QUEM O DIRETOR MARCAR, E O MENU NÃO SEGURA O MASTER SOZINHO ───
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2). Auth/RBAC é gatilho de tema da §A.38, e este arquivo é
 * a metade do `tester`: a auditoria adversarial do `seguranca` é a outra, e nenhuma das duas
 * substitui a outra.
 *
 * ┌─ A REGRA MUDOU DE DONO, E O FURO QUE ESTE ARQUIVO IMPEDE CONTINUA O MESMO ──────────────────┐
 * │ REGRA DO DIRETOR, 27/09/2026: o Super Admin concede QUALQUER tela a QUALQUER usuário. O      │
 * │ `@Roles("SUPER_ADMIN")` SAIU da `EtapasFunilAdminController`, e a autoridade da rota passou a │
 * │ ser o `MenuGuard`, pela reivindicação `EtapasFunilAdminController.*`. Este arquivo mudou de   │
 * │ guard junto: era o `RolesGuard`, virou o `MenuGuard`, porque é ele que decide agora.          │
 * │                                                                                             │
 * │ O FURO QUE CONTINUA VALENDO: "a rota está gatada pelo menu" NÃO É "só quem foi marcado        │
 * │ escreve". O `MenuGuard` deixa o MASTER PASSAR por pertencer à ÁREA, sem marcação nenhuma      │
 * │ (`auth/guards/menu.guard.ts`: "MASTER manda na área inteira"), e há MASTER na área AS em      │
 * │ produção. Sem a entrada nominal do código em `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, todos     │
 * │ eles renomeariam, reordenariam e INATIVARIAM etapa do funil, que é o dado de que dependem     │
 * │ oito telas, e não sobraria decisão individual nenhuma para o diretor tomar.                   │
 * │                                                                                             │
 * │ O SEGUNDO FURO, QUE NASCEU COM A MUDANÇA: o `MenuGuard` é FAIL-OPEN para operação que         │
 * │ ninguém reivindica. Tirar o `@Roles` sem a reivindicação teria ABERTO a rota a qualquer       │
 * │ autenticado, e é o caso "sem o menu é RECUSADO" abaixo que prova que não foi o que aconteceu. │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMPORTAMENTAL, E NÃO "O DECORADOR ESTÁ LÁ". A lição está escrita no módulo: existia um teste
 * verde afirmando que a rota de fechar vaga NÃO tinha `@Roles`, enquanto o sistema era contornável
 * pela rota irmã, porque ele media o DESENHO e não a PROPRIEDADE. Aqui o `MenuGuard` é instanciado
 * e chamado, e a afirmação é sobre quem ele deixa entrar.
 *
 * E O LAÇO É SOBRE TODOS OS HANDLERS DA CONTROLLER, descobertos pelo protótipo em vez de digitados:
 * a rota de escrita que alguém acrescentar amanhã já nasce dentro do teste, sem ninguém lembrar de
 * voltar aqui. Foi assim que a §A.6 pediu ("toda rota sensível com guard"), e não "as rotas que o
 * teste conhece".
 */

/** Os handlers de uma controller, descobertos pelo protótipo. Rota nova entra sozinha no laço. */
function handlersDe(controller: new (...args: never[]) => object): string[] {
  const proto = controller.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

const HANDLERS_ESCRITA = handlersDe(EtapasFunilAdminController as never);
const HANDLERS_LEITURA = handlersDe(EtapasFunilController as never);

/**
 * O GUARD DE VERDADE, agora o `MenuGuard`, descrito pelos menus que o usuário TEM.
 *
 * A ÁREA É AS NOS DOIS LADOS de propósito: o teto de área é conferido ANTES da marcação, então um
 * usuário fora da área seria recusado por OUTRO motivo e o teste não falaria da concessão, que é o
 * que está em jogo depois da regra do diretor.
 */
function guardReal(codigos: string[] = []): MenuGuard {
  const menus = {
    permissaoDoUsuario: async () => ({ codigos: new Set(codigos), areas: new Set(["AS"]) }),
  } as unknown as MenusService;
  const areas = { visivel: async () => true } as unknown as MenuAreasService;
  return new MenuGuard(new Reflector(), menus, areas);
}

/**
 * Um contexto apontando para a controller e o handler REAIS. O `MenuGuard` resolve por NOME
 * (`Controller.handler`), então passar a classe de verdade é o que garante que a pergunta feita ao
 * guard seja a mesma que a requisição de produção faz.
 */
function contexto(
  controller: new (...args: never[]) => object,
  handler: string,
  papel: Papel,
): ExecutionContext {
  const proto = controller.prototype as unknown as Record<string, unknown>;
  return {
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: "u1", papel } }) }),
  } as unknown as ExecutionContext;
}

describe("a escrita do catálogo de etapas é de quem o diretor marcar, e de mais ninguém", () => {
  it("a controller de escrita tem handlers (o laço abaixo não pode ser vazio)", () => {
    expect(HANDLERS_ESCRITA.length).toBeGreaterThan(0);
  });

  /**
   * O CASO QUE PROVA QUE A ROTA NÃO FICOU ABERTA. O usuário tem um menu de A&S na mão (`as-vagas`),
   * só não tem ESTE: com a reivindicação faltando, o `MenuGuard` devolveria `true` aqui, e o teste
   * fica vermelho antes de a frente chegar em produção.
   */
  it.each(HANDLERS_ESCRITA)("o COMUM SEM o menu é barrado em %s", async (handler) => {
    await expect(
      guardReal(["as-vagas"]).canActivate(
        contexto(EtapasFunilAdminController as never, handler, "COMUM"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** E o COMUM MARCADO escreve: é essa metade que a regra do diretor acrescentou. */
  it.each(HANDLERS_ESCRITA)("o COMUM COM o menu concedido escreve em %s", async (handler) => {
    await expect(
      guardReal(["as-etapas"]).canActivate(
        contexto(EtapasFunilAdminController as never, handler, "COMUM"),
      ),
    ).resolves.toBe(true);
  });

  /**
   * O CASO QUE O MENU SOZINHO NÃO PEGA. O MASTER atravessa o `MenuGuard` por ser da ÁREA, e quem
   * fecha esse atalho é a entrada nominal do código em `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`. Sem
   * ela, este caso resolve `true` sozinho e o catálogo do funil vira dado editável por qualquer
   * administrador de A&S, sem o diretor decidir nada.
   */
  it.each(HANDLERS_ESCRITA)("o MASTER SEM marcação é barrado em %s (o atalho de área não vale)", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(EtapasFunilAdminController as never, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(HANDLERS_ESCRITA)("o MASTER COM marcação escreve em %s", async (handler) => {
    await expect(
      guardReal(["as-etapas"]).canActivate(
        contexto(EtapasFunilAdminController as never, handler, "MASTER"),
      ),
    ).resolves.toBe(true);
  });

  /**
   * O CONTRASTE, sem o qual os dois casos acima seriam satisfeitos por uma rota que barra TODO
   * MUNDO: o SUPER_ADMIN entra.
   */
  it.each(HANDLERS_ESCRITA)("o SUPER_ADMIN passa em %s", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(EtapasFunilAdminController as never, handler, "SUPER_ADMIN")),
    ).resolves.toBe(true);
  });
});

describe("a leitura do catálogo é ABERTA a qualquer autenticado", () => {
  it("a controller de leitura tem handlers", () => {
    expect(HANDLERS_LEITURA.length).toBeGreaterThan(0);
  });

  /**
   * O FUNIL É A TELA DE TRABALHO DO CONSULTOR. Gatar a leitura do catálogo daria 403 na Central de
   * Candidatos inteira para o perfil COMUM, que é o incidente que a régua da casa já pagou uma vez
   * ("LER catálogo é dado de TRABALHO e continua ABERTO", `domain/menus.ts`).
   */
  it.each(HANDLERS_LEITURA)("o COMUM passa em %s, sem menu nem @Roles no caminho", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(EtapasFunilController as never, handler, "COMUM")),
    ).resolves.toBe(true);
  });
});

describe("a reivindicação por menu: a escrita é do `as-etapas`, a leitura não é de menu nenhum", () => {
  it.each(HANDLERS_ESCRITA)("a operação de escrita %s é reivindicada pelo menu `as-etapas`", (handler) => {
    expect(menuDaOperacao("EtapasFunilAdminController", handler)).toBe("as-etapas");
  });

  /**
   * A AUSÊNCIA NÃO SE DEFENDE SOZINHA, e é por isso que ela vira asserção, no mesmo molde do
   * `lojas-escrita-aberta.spec.ts`: basta alguém acrescentar `EtapasFunilController.*` à lista de
   * operações do menu, achando que está organizando, para o funil fechar em silêncio para o COMUM.
   */
  it.each(HANDLERS_LEITURA)("a operação de leitura %s NÃO é reivindicada por menu nenhum", (handler) => {
    expect(menuDaOperacao("EtapasFunilController", handler)).toBeNull();
  });

  /** §A.23: menu novo nasce só para o SUPER_ADMIN, e quem libera quem enxerga é o diretor. */
  it("o menu `as-etapas` existe no catálogo, nasce só para o SUPER_ADMIN e é CONCEDÍVEL", () => {
    const menu = MENUS.find((m) => m.codigo === "as-etapas");
    expect(menu, "o menu novo precisa existir no registro para ser LIBERÁVEL pelo diretor").toBeDefined();
    /*
     * AS DUAS LISTAS DE BLOQUEIO FICARAM FORA (regra do diretor, 27/09/2026), e a troca é de CASA,
     * não de intensidade. `MENUS_SOMENTE_SUPER_ADMIN` REMOVE o menu do `/auth/me` de quem não é
     * SUPER_ADMIN, e `MENUS_BLOQUEADOS_COMUM` é filtrada ao SALVAR a config de um COMUM: juntas,
     * elas faziam a tela oferecer a caixa, o diretor marcar, e o acesso nunca chegar. Quem guarda a
     * restrição agora é `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, afirmada na linha seguinte.
     */
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-etapas")).toBe(false);
    expect(MENUS_BLOQUEADOS_COMUM.has("as-etapas")).toBe(false);
    expect(masterPrecisaDeMarcacao("as-etapas")).toBe(true);
    /*
     * ─ O GRUPO NÃO É AFIRMADO AQUI, E A AUSÊNCIA É DELIBERADA ───────────────────────────────────
     *
     * EM QUE GRUPO O CARD APARECE É DECISÃO DO DIRETOR, e ela está ABERTA. Enquanto estiver, uma
     * asserção sobre o grupo não guarda requisito nenhum: ela congela a escolha de quem implementou
     * dentro do teste que existe para JULGAR a implementação, e passa a ficar verde por concordar
     * consigo mesma. Este arquivo é sobre QUEM ESCREVE o catálogo, não sobre onde o menu mora.
     *
     * O que continua afirmado abaixo é regra de SEGURANÇA, e essa não está em disputa: o menu é da
     * área AS, e nasce só para o SUPER_ADMIN (§A.23).
     */
    expect(menu?.areas).toEqual(["AS"]);
  });
});
