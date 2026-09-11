import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import { MotivosCancelamentoVagaAdminController } from "./motivos-cancelamento-admin.controller";
import { MotivosCancelamentoVagaController } from "./motivos-cancelamento.controller";

/**
 * ─ QUEM EDITA OS MOTIVOS DE CANCELAMENTO É O SUPER_ADMIN: MEDIDO PELO GUARD, NÃO PELO DECORADOR ──
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE AO LADO DO `motivos-cancelamento.rbac.spec.ts` ────────────────┐
 * │ AQUELE AFIRMA O DESENHO ("o metadado `@Roles` está na classe"); este afirma a PROPRIEDADE    │
 * │ ("o MASTER não entra"). A distinção não é acadêmica, e o próprio módulo já pagou por ela:    │
 * │ existia um teste VERDE dizendo que a rota de fechar vaga não tinha `@Roles` enquanto o        │
 * │ sistema era contornável pela rota irmã (ver o cabeçalho de `vagas.fechamento-apos-reducao`).  │
 * │ Aqui o `RolesGuard` de verdade é instanciado e chamado, com o `Reflector` de verdade lendo a  │
 * │ controller de verdade, e a asserção é sobre QUEM ELE DEIXA ENTRAR.                            │
 * │                                                                                             │
 * │ E ELE É DO `tester`, não de quem construiu (§A.38): teste do autor pega regressão bem e pega │
 * │ mal-entendido de requisito mal, porque codifica a mesma suposição que gerou o código.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O CASO QUE O MENU NÃO PEGA, e é a razão de o `@Roles` existir aqui: o `MenuGuard` deixa o MASTER
 * passar por PERTENCER À ÁREA (`auth/guards/menu.guard.ts`), e há MASTER na área AS em produção. Com
 * o menu como única trava, qualquer Master de A&S renomearia e INATIVARIA motivo do catálogo, que é
 * o vocabulário em que os cancelamentos de vaga ficam escritos.
 *
 * O LAÇO É SOBRE TODOS OS HANDLERS, descobertos pelo protótipo em vez de digitados: a rota de
 * escrita acrescentada amanhã já nasce dentro do teste, sem ninguém lembrar de voltar aqui.
 */

function handlersDe(controller: new (...args: never[]) => object): string[] {
  const proto = controller.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

const ESCRITA = handlersDe(MotivosCancelamentoVagaAdminController as never);
const LEITURA = handlersDe(MotivosCancelamentoVagaController as never);

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

describe("o guard de verdade: a escrita do catálogo de motivos é do SUPER_ADMIN", () => {
  it("a controller de escrita tem handlers (o laço abaixo não pode ser vazio)", () => {
    expect(ESCRITA.length).toBeGreaterThan(0);
  });

  it.each(ESCRITA)("o COMUM é barrado em %s", async (handler) => {
    await expect(
      guardReal().canActivate(
        contexto(MotivosCancelamentoVagaAdminController as never, handler, "COMUM"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(ESCRITA)("o MASTER é barrado em %s (o menu sozinho deixaria passar)", async (handler) => {
    await expect(
      guardReal().canActivate(
        contexto(MotivosCancelamentoVagaAdminController as never, handler, "MASTER"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** O contraste, sem o qual os dois acima seriam satisfeitos por uma rota que barra todo mundo. */
  it.each(ESCRITA)("o SUPER_ADMIN passa em %s", async (handler) => {
    await expect(
      guardReal().canActivate(
        contexto(MotivosCancelamentoVagaAdminController as never, handler, "SUPER_ADMIN"),
      ),
    ).resolves.toBe(true);
  });
});

describe("o guard de verdade: a LEITURA é do consultor, senão o modal de cancelar nasce vazio", () => {
  it("a controller de leitura tem handlers", () => {
    expect(LEITURA.length).toBeGreaterThan(0);
  });

  /**
   * QUEM CANCELA A VAGA É O CONSULTOR (o `forcar` é que é de Master), e ele precisa da lista para
   * escolher o motivo. Fechar a leitura junto daria 403 no seletor do modal para o perfil COMUM,
   * que é o incidente que a régua da casa já pagou uma vez.
   */
  it.each(LEITURA)("o COMUM passa em %s, sem @Roles no caminho", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(MotivosCancelamentoVagaController as never, handler, "COMUM")),
    ).resolves.toBe(true);
  });
});
