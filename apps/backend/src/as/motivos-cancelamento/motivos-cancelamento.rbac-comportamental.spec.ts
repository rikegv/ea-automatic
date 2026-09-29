import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { MenuGuard } from "../../auth/guards/menu.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import { MotivosCancelamentoVagaAdminController } from "./motivos-cancelamento-admin.controller";
import { MotivosCancelamentoVagaController } from "./motivos-cancelamento.controller";

/**
 * ─ QUEM EDITA OS MOTIVOS DE CANCELAMENTO É QUEM O DIRETOR MARCAR: MEDIDO PELO GUARD DE VERDADE ───
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE AO LADO DO `motivos-cancelamento.rbac.spec.ts` ────────────────┐
 * │ AQUELE AFIRMA O DESENHO (o metadado e a reivindicação); este afirma a PROPRIEDADE ("o MASTER │
 * │ sem marcação não entra"). A distinção não é acadêmica, e o próprio módulo já pagou por ela:  │
 * │ existia um teste VERDE dizendo que a rota de fechar vaga não tinha `@Roles` enquanto o        │
 * │ sistema era contornável pela rota irmã (ver o cabeçalho de `vagas.fechamento-apos-reducao`).  │
 * │ Aqui o `MenuGuard` de verdade é instanciado e chamado, com a controller de verdade, e a       │
 * │ asserção é sobre QUEM ELE DEIXA ENTRAR. O guard TROCOU junto com a autoridade: o              │
 * │ `@Roles("SUPER_ADMIN")` saiu da classe (regra do diretor, 27/09/2026) e quem decide agora é o │
 * │ menu.                                                                                         │
 * │                                                                                             │
 * │ E ELE É DO `tester`, não de quem construiu (§A.38): teste do autor pega regressão bem e pega │
 * │ mal-entendido de requisito mal, porque codifica a mesma suposição que gerou o código.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O CASO QUE O MENU SOZINHO NÃO PEGA: o `MenuGuard` deixa o MASTER passar por PERTENCER À ÁREA
 * (`auth/guards/menu.guard.ts`), e há MASTER na área AS em produção. Quem fecha esse atalho é a
 * entrada nominal do código em `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`; sem ela, qualquer Master de A&S
 * renomearia e INATIVARIA motivo do catálogo, que é o vocabulário em que os cancelamentos de vaga
 * ficam escritos, e não sobraria decisão individual nenhuma para o diretor tomar.
 *
 * E O SEGUNDO FURO, QUE NASCEU COM A TROCA: o `MenuGuard` é FAIL-OPEN para operação que ninguém
 * reivindica. Tirar o `@Roles` sem a reivindicação teria ABERTO a rota a qualquer autenticado, e é o
 * caso "SEM o menu é barrado" abaixo que prova que não foi o que aconteceu.
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

/**
 * O guard de verdade, descrito pelos menus que o usuário TEM. A área é AS nos dois lados: o teto de
 * área é conferido ANTES da marcação, então um usuário fora da área seria recusado por OUTRO motivo e
 * o teste não falaria da concessão, que é o que está em jogo aqui.
 */
function guardReal(codigos: string[] = []): MenuGuard {
  const menus = {
    permissaoDoUsuario: async () => ({ codigos: new Set(codigos), areas: new Set(["AS"]) }),
  } as unknown as MenusService;
  const areas = { visivel: async () => true } as unknown as MenuAreasService;
  return new MenuGuard(new Reflector(), menus, areas);
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

const MENU = "as-motivos-cancelamento";

describe("o guard de verdade: a escrita do catálogo de motivos é de quem o diretor marcar", () => {
  it("a controller de escrita tem handlers (o laço abaixo não pode ser vazio)", () => {
    expect(ESCRITA.length).toBeGreaterThan(0);
  });

  /**
   * O CASO QUE PROVA QUE A ROTA NÃO FICOU ABERTA: o usuário tem um menu de A&S na mão (`as-vagas`),
   * só não tem ESTE. Faltando a reivindicação, o `MenuGuard` devolveria `true` aqui.
   */
  it.each(ESCRITA)("o COMUM SEM o menu é barrado em %s", async (handler) => {
    await expect(
      guardReal(["as-vagas"]).canActivate(
        contexto(MotivosCancelamentoVagaAdminController as never, handler, "COMUM"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(ESCRITA)("o COMUM COM o menu concedido escreve em %s", async (handler) => {
    await expect(
      guardReal([MENU]).canActivate(
        contexto(MotivosCancelamentoVagaAdminController as never, handler, "COMUM"),
      ),
    ).resolves.toBe(true);
  });

  it.each(ESCRITA)("o MASTER SEM marcação é barrado em %s (o atalho de área não vale)", async (handler) => {
    await expect(
      guardReal().canActivate(
        contexto(MotivosCancelamentoVagaAdminController as never, handler, "MASTER"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(ESCRITA)("o MASTER COM marcação escreve em %s", async (handler) => {
    await expect(
      guardReal([MENU]).canActivate(
        contexto(MotivosCancelamentoVagaAdminController as never, handler, "MASTER"),
      ),
    ).resolves.toBe(true);
  });

  /** O contraste, sem o qual os casos acima seriam satisfeitos por uma rota que barra todo mundo. */
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
  it.each(LEITURA)("o COMUM passa em %s, sem menu nem @Roles no caminho", async (handler) => {
    await expect(
      guardReal().canActivate(contexto(MotivosCancelamentoVagaController as never, handler, "COMUM")),
    ).resolves.toBe(true);
  });
});
