import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { MenuGuard } from "./menu.guard";
import type { MenusService } from "../menus.service";

/**
 * Comportamento do guard central de menu (Bloco 3). O que estes testes travam:
 *  - MASTER/SUPER_ADMIN passam SEMPRE (bypass), sem tocar o banco;
 *  - operação ABERTA (não reivindicada) passa para qualquer autenticado;
 *  - operação GATED exige o menu; sem ele, 403 pelo BACKEND (não só esconder no front).
 */

function ctx(controllerName: string, handlerName: string, user: unknown) {
  return {
    getClass: () => ({ name: controllerName }),
    getHandler: () => ({ name: handlerName }),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

const reflector = { getAllAndOverride: () => false } as unknown as Reflector;

function makeGuard(codigos: string[]) {
  const menus = {
    codigosDoUsuario: vi.fn().mockResolvedValue(new Set(codigos)),
  } as unknown as MenusService;
  return { guard: new MenuGuard(reflector, menus), menus };
}

const COMUM = { id: "u1", email: "c@x", papel: "COMUM", senhaTemporaria: false };
const ADMIN = { id: "u2", email: "a@x", papel: "SUPER_ADMIN", senhaTemporaria: false };

describe("MenuGuard", () => {
  it("admin passa em operação gated SEM consultar o banco (bypass)", async () => {
    const { guard, menus } = makeGuard([]);
    await expect(guard.canActivate(ctx("RegrasController", "create", ADMIN))).resolves.toBe(true);
    expect(menus.codigosDoUsuario).not.toHaveBeenCalled();
  });

  it("operação ABERTA passa para COMUM sem consultar o banco", async () => {
    const { guard, menus } = makeGuard([]);
    // ClientesController.list não é reivindicada por menu.
    await expect(guard.canActivate(ctx("ClientesController", "list", COMUM))).resolves.toBe(true);
    expect(menus.codigosDoUsuario).not.toHaveBeenCalled();
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
});
