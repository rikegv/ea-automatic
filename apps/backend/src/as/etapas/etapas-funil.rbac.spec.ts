import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import {
  MENUS,
  MENUS_SOMENTE_SUPER_ADMIN,
  menuDaOperacao,
} from "../../domain/menus";
import { EtapasFunilAdminController } from "./etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas-funil.controller";

/**
 * ─ QUEM EDITA A LISTA DE ETAPAS É O SUPER_ADMIN, E O MENU NÃO SEGURA O MASTER ───────────────────
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2). Auth/RBAC é gatilho de tema da §A.38, e este arquivo é
 * a metade do `tester`: a auditoria adversarial do `seguranca` é a outra, e nenhuma das duas
 * substitui a outra.
 *
 * ┌─ O FURO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, e ele é sutil ────────────────────────────────┐
 * │ "A rota está gatada pelo menu `as-etapas`" NÃO É a mesma coisa que "só o SUPER_ADMIN         │
 * │ escreve". O `MenuGuard` deixa o MASTER PASSAR por pertencer à ÁREA, sem depender de marcação │
 * │ nenhuma (`auth/guards/menu.guard.ts`: "MASTER manda na área inteira"), e há MASTER na área   │
 * │ AS em produção. Com o menu como única trava, qualquer Master de A&S renomeia, reordena e     │
 * │ INATIVA etapa do funil, que é o dado de que dependem oito telas.                             │
 * │                                                                                             │
 * │ ENTÃO O TESTE NÃO PODE SER SOBRE O MENU. Ele é sobre a TRAVA DA ROTA, medida pelo guard      │
 * │ de verdade, lendo o metadado de verdade da controller de verdade.                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMPORTAMENTAL, E NÃO "O DECORADOR ESTÁ LÁ". A lição está escrita no módulo: existia um teste
 * verde afirmando que a rota de fechar vaga NÃO tinha `@Roles`, enquanto o sistema era contornável
 * pela rota irmã, porque ele media o DESENHO e não a PROPRIEDADE. Aqui o `RolesGuard` é instanciado
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

/** O guard de verdade, com o Reflector de verdade lendo o metadado de verdade da controller. */
function guardReal(): RolesGuard {
  const menus = { areasDoUsuario: async () => new Set(["AS", "ADM"]) } as unknown as MenusService;
  const areas = { areasDaOperacao: async () => ["AS"] } as unknown as MenuAreasService;
  return new RolesGuard(new Reflector(), menus, areas);
}

/** Um contexto apontando para o handler REAL da controller REAL: é daí que o metadado sai. */
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

describe("a escrita do catálogo de etapas é do SUPER_ADMIN, e de mais ninguém", () => {
  it("a controller de escrita tem handlers (o laço abaixo não pode ser vazio)", () => {
    expect(HANDLERS_ESCRITA.length).toBeGreaterThan(0);
  });

  it.each(HANDLERS_ESCRITA)("o COMUM é barrado em %s", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(EtapasFunilAdminController as never, handler, "COMUM")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * O CASO QUE O MENU NÃO PEGA. O MASTER atravessa o `MenuGuard` por ser da área; se o `@Roles` da
   * controller listar MASTER (ou não existir), ele escreve, e o catálogo do funil vira dado
   * editável por qualquer administrador de A&S.
   */
  it.each(HANDLERS_ESCRITA)("o MASTER é barrado em %s (o menu sozinho deixaria passar)", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(EtapasFunilAdminController as never, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
  it.each(HANDLERS_LEITURA)("o COMUM passa em %s, sem @Roles no caminho", async (handler) => {
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
  it("o menu `as-etapas` existe no catálogo e nasce só para o SUPER_ADMIN", () => {
    const menu = MENUS.find((m) => m.codigo === "as-etapas");
    expect(menu, "o menu novo precisa existir no registro para ser LIBERÁVEL pelo diretor").toBeDefined();
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-etapas")).toBe(true);
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
