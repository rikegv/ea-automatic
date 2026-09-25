import { describe, expect, it } from "vitest";
import { MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER, MENUS_SOMENTE_SUPER_ADMIN } from "../domain/menus";
import { AuthController } from "./auth.controller";
import type { AuthUser } from "./auth.types";

/**
 * ══ A FIAÇÃO DO `/auth/me`, E POR QUE ELA PRECISA DE TESTE PRÓPRIO (ressalva S23) ═════════════
 *
 * A FUNÇÃO PURA JÁ ESTAVA TRAVADA; A CHAMADA NÃO. `baseDeMenusDoMaster` tem cobertura em
 * `domain/menus.spec.ts`, mas nada conferia que o `/auth/me` a CHAMA: o auditor trocou
 * `baseDeMenusDoMaster(codigos)` por `TODOS_CODIGOS_MENU` na controller e 125 testes seguiram
 * verdes. Função certa que ninguém chama não protege ninguém.
 *
 * O QUE UMA REGRESSÃO ALI CUSTA, e não é falha de autorização: o `MenuGuard` continua barrando, e
 * é justamente esse o ponto. O MASTER voltaria a VER o card de Dicas De Documento na barra e a
 * tomar 403 ao abrir, que é o "mostrar a porta e trancá-la" que este trecho existe para acabar. A
 * UX mentindo, não a porta aberta.
 *
 * FAKES E NÃO BANCO: o `me` só usa `MenusService.permissaoDoUsuario` e `MenuAreasService.filtrar`.
 * O `filtrar` do fake é PASSA-TUDO de propósito: o teto de área tem cobertura própria em
 * `menu-areas.service.spec.ts`, e se ele recortasse aqui, a ausência do menu poderia vir do teto de
 * área em vez do de marcação, e o teste passaria pelo motivo errado.
 *
 * §A.6: usuário sintético, sem CPF e sem dado de ninguém.
 */

const MENU_NOMINAL = "dicas-documento";

function makeController(marcados: string[]) {
  const menus = {
    permissaoDoUsuario: async () => ({
      codigos: new Set(marcados),
      areas: new Set(["ADM"] as const),
    }),
  };
  // PASSA-TUDO: ver o cabeçalho. Quem prova o teto de área é o spec do próprio serviço.
  const menuAreas = { filtrar: async (codigos: Iterable<string>) => [...codigos] };
  return new AuthController(
    null as never,
    null as never,
    null as never,
    menus as never,
    menuAreas as never,
  );
}

const MASTER: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "master@exemplo.local",
  papel: "MASTER",
  senhaTemporaria: false,
};

describe("/auth/me: o MASTER só enxerga o que o guard vai deixar abrir", () => {
  /** A guarda do próprio teste: ele só prova alguma coisa enquanto o menu for nominal. */
  it("o menu sob teste é mesmo nominal, e não é exclusivo do SUPER_ADMIN", () => {
    expect(MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER.has(MENU_NOMINAL)).toBe(true);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has(MENU_NOMINAL)).toBe(false);
  });

  it("MASTER SEM a marcação NÃO recebe o menu nominal no /auth/me", async () => {
    const resposta = await makeController([]).me(MASTER);
    expect(resposta.menus.todos).toBe(false);
    expect(resposta.menus.codigos).not.toContain(MENU_NOMINAL);
    // A lista não veio vazia por acidente: o resto dos menus continua chegando, e é só o nominal
    // que falta. Sem esta linha, um `codigos: []` por engano passaria como acerto.
    expect(resposta.menus.codigos.length).toBeGreaterThan(0);
  });

  it("MASTER COM a marcação recebe o menu nominal", async () => {
    const resposta = await makeController([MENU_NOMINAL]).me(MASTER);
    expect(resposta.menus.codigos).toContain(MENU_NOMINAL);
  });

  /** O teto de PAPEL também é aplicado na mesma linha, e sai junto do resultado do MASTER. */
  it("o MASTER não recebe menu exclusivo do SUPER_ADMIN, nem marcado", async () => {
    const resposta = await makeController(["usuarios"]).me(MASTER);
    expect(resposta.menus.codigos).not.toContain("usuarios");
  });
});
