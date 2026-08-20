import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Area } from "@ea/shared-types";
import { describe, expect, it, vi } from "vitest";
import { MenuGuard } from "./menu.guard";
import { temIntersecao } from "../../domain/menus";
import type { MenuAreasService } from "../menu-areas.service";
import type { MenusService } from "../menus.service";

/**
 * Comportamento do guard central de menu (Bloco 3). O que estes testes travam:
 *  - SUPER_ADMIN passa SEMPRE (bypass), sem tocar o banco;
 *  - operação ABERTA (não reivindicada) passa para qualquer autenticado;
 *  - operação GATED exige o menu; sem ele, 403 pelo BACKEND (não só esconder no front);
 *  - a ÁREA é um TETO por cima disso: fora dela o menu não existe, para MASTER e para COMUM.
 */

function ctx(controllerName: string, handlerName: string, user: unknown) {
  return {
    getClass: () => ({ name: controllerName }),
    getHandler: () => ({ name: handlerName }),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

const reflector = { getAllAndOverride: () => false } as unknown as Reflector;

/**
 * Área padrão dos casos de MENU: ADM, que é onde vivem todos os menus de hoje.
 *
 * `areasDoMenu` é a FONTE VIVA (a tabela `menus.areas`, via cache). O dublê responde com o carimbo do
 * menu, que por padrão é ADM; `areasDoMenuFixas` permite simular o dia em que o diretor remarcar um
 * menu pela tela dele, sem precisar de banco.
 */
function makeGuard(codigos: string[], areas: Area[] = ["ADM"], areasDoMenuFixas: Area[] = ["ADM"]) {
  const menus = {
    codigosDoUsuario: vi.fn().mockResolvedValue(new Set(codigos)),
    permissaoDoUsuario: vi
      .fn()
      .mockResolvedValue({ codigos: new Set(codigos), areas: new Set(areas) }),
  } as unknown as MenusService;
  const menuAreas = {
    visivel: async (_codigo: string, doUsuario: Iterable<Area>) =>
      temIntersecao(areasDoMenuFixas, doUsuario),
    areasDoMenu: async () => areasDoMenuFixas,
  } as unknown as MenuAreasService;
  return { guard: new MenuGuard(reflector, menus, menuAreas), menus };
}

const COMUM = { id: "u1", email: "c@x", papel: "COMUM", senhaTemporaria: false };
const MASTER = { id: "u3", email: "m@x", papel: "MASTER", senhaTemporaria: false };
const ADMIN = { id: "u2", email: "a@x", papel: "SUPER_ADMIN", senhaTemporaria: false };

describe("MenuGuard", () => {
  it("admin passa em operação gated SEM consultar o banco (bypass)", async () => {
    const { guard, menus } = makeGuard([]);
    await expect(guard.canActivate(ctx("RegrasController", "create", ADMIN))).resolves.toBe(true);
    expect(menus.permissaoDoUsuario).not.toHaveBeenCalled();
  });

  it("operação ABERTA passa para COMUM sem consultar o banco", async () => {
    const { guard, menus } = makeGuard([]);
    // ClientesController.list não é reivindicada por menu.
    await expect(guard.canActivate(ctx("ClientesController", "list", COMUM))).resolves.toBe(true);
    expect(menus.permissaoDoUsuario).not.toHaveBeenCalled();
  });

  it("COMUM COM o menu passa na operação gated", async () => {
    const { guard } = makeGuard(["regras"]);
    await expect(guard.canActivate(ctx("RegrasController", "create", COMUM))).resolves.toBe(true);
  });

  it("COMUM SEM o menu é barrado no backend (403), não só escondido no front", async () => {
    const { guard } = makeGuard(["regua"]); // tem régua, não tem clientes
    await expect(guard.canActivate(ctx("ClientesController", "create", COMUM))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("sem usuário no request, deixa passar (o JwtAuthGuard já barrou antes)", async () => {
    const { guard } = makeGuard([]);
    await expect(guard.canActivate(ctx("RegrasController", "create", undefined))).resolves.toBe(true);
  });

  // ── Segmentação de área (fundação do módulo de A&S) ──────────────────────

  it("MASTER manda na SUA área sem depender de marcação (bypass dentro da área)", async () => {
    const { guard } = makeGuard([], ["ADM"]);
    await expect(guard.canActivate(ctx("RegrasController", "create", MASTER))).resolves.toBe(true);
  });

  it("MASTER de A&S é barrado numa operação de ADM: o papel deixou de significar ver tudo", async () => {
    const { guard } = makeGuard([], ["AS"]);
    await expect(
      guard.canActivate(ctx("RegrasController", "create", MASTER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("MASTER híbrido (as duas áreas) passa na operação de ADM", async () => {
    const { guard } = makeGuard([], ["ADM", "AS"]);
    await expect(guard.canActivate(ctx("RegrasController", "create", MASTER))).resolves.toBe(true);
  });

  it("A ÁREA NUNCA CONCEDE: COMUM na área certa, mas SEM o menu, continua barrado", async () => {
    const { guard } = makeGuard([], ["ADM"]);
    await expect(
      guard.canActivate(ctx("RegrasController", "create", COMUM)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("A ÁREA LIMITA: COMUM COM o menu marcado, mas fora da área, é barrado", async () => {
    const { guard } = makeGuard(["regras"], ["AS"]);
    await expect(
      guard.canActivate(ctx("RegrasController", "create", COMUM)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("usuário SEM área nenhuma não passa em operação gated (fail-closed)", async () => {
    const { guard } = makeGuard(["regras"], []);
    await expect(
      guard.canActivate(ctx("RegrasController", "create", COMUM)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("SUPER_ADMIN passa mesmo SEM área nenhuma: está acima da segmentação", async () => {
    const { guard } = makeGuard([], []);
    await expect(guard.canActivate(ctx("RegrasController", "create", ADMIN))).resolves.toBe(true);
  });

  // ── A fonte da área do MENU passou a ser a TABELA ────────────────────────
  //
  // É o que a tela do diretor escreve. O guard não consulta mais o registro em código, então marcar um
  // menu como sendo TAMBÉM de A&S passa a valer sem subir versão.

  it("menu remarcado para as duas áreas passa a ser alcançável pelo time de A&S", async () => {
    const { guard } = makeGuard([], ["AS"], ["ADM", "AS"]);
    await expect(guard.canActivate(ctx("RegrasController", "create", MASTER))).resolves.toBe(true);
  });

  it("menu remarcado para SÓ A&S deixa de ser alcançável pela Admissão", async () => {
    const { guard } = makeGuard(["regras"], ["ADM"], ["AS"]);
    await expect(
      guard.canActivate(ctx("RegrasController", "create", COMUM)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
