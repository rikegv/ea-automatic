import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import { MENUS, menuDaOperacao } from "../../domain/menus";
import { CandidatosController } from "../candidatos/candidatos.controller";
import { ShortlistsController } from "./shortlists.controller";

/**
 * ─ AS SUPERFÍCIES NOVAS DA FRENTE E ESTÃO ATRÁS DE MENU, E NÃO ABERTAS ──────────────────────────
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR, E ELE É SILENCIOSO ───────────────────────────┐
 * │ O `MenuGuard` é FAIL-OPEN para operação que NINGUÉM reivindicou. Uma controller NOVA que      │
 * │ ninguém acrescentou a `domain/menus` não fica "restrita como a vizinha": ela fica ABERTA a    │
 * │ qualquer sessão válida, inclusive aos COMUM da Admissão, com um `curl`. Nada falha, nada      │
 * │ aparece em log, e a shortlist (quem foi apresentado a qual cliente) passa a ser legível por   │
 * │ quem não tem nada a ver com A&S.                                                              │
 * │                                                                                              │
 * │ É EXATAMENTE O RACIOCÍNIO ESCRITO NA `MotivosDescarteAdminController`, aplicado a uma classe  │
 * │ de OPERAÇÃO em vez de a uma de administração.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E O ERRO SIMÉTRICO SERIA TÃO CARO QUANTO: `@Roles` NA ROTA ─────────────────────────────────┐
 * │ Montar e mandar a shortlist é o trabalho NORMAL do consultor COMUM. Um `@Roles("MASTER")`     │
 * │ aqui barraria justamente quem opera, e é o mesmo erro que a Frente D desfez ao tirar o        │
 * │ `@Roles` da troca de vaga. As guardas desta frente dependem do ESTADO da linha (a vaga está   │
 * │ em processo? estes candidatos são desta vaga e estão vivos?), e estado é assunto do service.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: este arquivo não toca dado nenhum. Ele mede permissão.
 */

const HANDLERS_DA_SHORTLIST = ["listar", "enviar"] as const;
/** Os gestos novos da Frente E que moram na controller de candidatos. */
const HANDLERS_NOVOS_DE_CANDIDATOS = [
  "reprovarPeloCliente",
  "marcarEntrevista",
  "listarEntrevistas",
] as const;

describe("1. a shortlist é reivindicada por menu, e por EXATAMENTE um", () => {
  it.each(HANDLERS_DA_SHORTLIST)("o handler %s pertence ao menu `as-vagas`", (handler) => {
    expect(
      menuDaOperacao("ShortlistsController", handler),
      "operação não reivindicada é operação ABERTA: o MenuGuard é fail-open",
    ).toBe("as-vagas");
  });

  /**
   * DOIS MENUS REIVINDICANDO A MESMA CLASSE É DEFEITO, e não redundância: `menuDaOperacao` responde
   * UM, e qual dos dois passa a depender da ordem do registro. É o buraco que a nota do
   * `as-vagas-revisao` documenta (ele deixa `operacoes: []` de propósito, por compartilhar a
   * `VagasController` com o `as-vagas`).
   */
  it("exatamente UM menu reivindica a `ShortlistsController`", () => {
    const reivindicam = MENUS.filter((m) =>
      m.operacoes.some((op) => op.startsWith("ShortlistsController.")),
    ).map((m) => m.codigo);
    expect(reivindicam).toEqual(["as-vagas"]);
  });

  /**
   * O MENU DA SHORTLIST É O MESMO DA VAGA, e isso é a prova de que a classe separada NÃO afrouxou
   * permissão: a separação é de TAMANHO (a `VagasService` tem 4.400 linhas e treze specs a
   * instanciam, §A.26), e o alcance continua idêntico ao da Central de Vagas.
   */
  it("é o MESMO menu da Central de Vagas, então a classe separada não afrouxa nada", () => {
    expect(menuDaOperacao("ShortlistsController", "enviar")).toBe(
      menuDaOperacao("VagasController", "list"),
    );
  });
});

describe("2. os gestos novos de candidatos continuam no menu `as-candidatos`", () => {
  it.each(HANDLERS_NOVOS_DE_CANDIDATOS)("o handler %s pertence ao menu `as-candidatos`", (h) => {
    expect(menuDaOperacao("CandidatosController", h)).toBe("as-candidatos");
  });
});

describe("3. nenhum gesto novo exige papel: quem opera é o COMUM", () => {
  it("a `ShortlistsController` não tem @Roles de classe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, ShortlistsController)).toBeUndefined();
  });

  it.each(HANDLERS_DA_SHORTLIST)("o handler %s não tem @Roles de método", (handler) => {
    const proto = ShortlistsController.prototype as unknown as Record<string, object>;
    expect(typeof proto[handler], `o handler ${handler} precisa existir`).toBe("function");
    expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toBeUndefined();
  });

  it.each(HANDLERS_NOVOS_DE_CANDIDATOS)("o handler %s de candidatos não tem @Roles", (handler) => {
    const proto = CandidatosController.prototype as unknown as Record<string, object>;
    expect(typeof proto[handler], `o handler ${handler} precisa existir`).toBe("function");
    expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toBeUndefined();
  });

  /**
   * A PROPRIEDADE, E NÃO O DECORADOR: o guard de verdade, instanciado e chamado, deixa o COMUM
   * passar. Já houve teste VERDE afirmando decorador enquanto o sistema era contornável, e o
   * inverso (afirmar a ausência de um decorador) é ainda mais fácil de passar por engano.
   */
  it.each(HANDLERS_DA_SHORTLIST)("o COMUM passa no guard de verdade em %s", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(ShortlistsController as never, handler, "COMUM")),
    ).resolves.toBe(true);
  });
});

function guardReal(): RolesGuard {
  const menus = { areasDoUsuario: async () => new Set(["AS", "ADM"]) } as unknown as MenusService;
  const areas = { areasDaOperacao: async () => ["AS"] } as unknown as MenuAreasService;
  return new RolesGuard(new Reflector(), menus, areas);
}

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
