import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";

/**
 * RBAC (§A.3 / §A.6): consultor COMUM nunca acessa rotas de administração.
 * Testa o RolesGuard isolado, com Reflector real e ExecutionContext mockado.
 * O metadado de @Roles é simulado por spy em reflector.getAllAndOverride.
 */
describe("RolesGuard (RBAC §A.3)", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  /** Monta um ExecutionContext cujo request carrega o usuário informado. */
  function contextComUsuario(user: { papel: Papel } | undefined): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  /** Simula @Roles(...) lido pelo Reflector na rota. */
  function exigirPapeis(required: Papel[] | undefined): void {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(required);
  }

  it("barra papel COMUM em rota que exige MASTER/SUPER_ADMIN (consultor fora da administração)", () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    expect(() => guard.canActivate(contextComUsuario({ papel: "COMUM" }))).toThrow(
      ForbiddenException,
    );
  });

  it("permite papel MASTER na rota de administração", () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    expect(guard.canActivate(contextComUsuario({ papel: "MASTER" }))).toBe(true);
  });

  it("permite papel SUPER_ADMIN na rota de administração", () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    expect(guard.canActivate(contextComUsuario({ papel: "SUPER_ADMIN" }))).toBe(true);
  });

  it("permite qualquer autenticado em rota sem @Roles (required vazio)", () => {
    exigirPapeis([]);
    expect(guard.canActivate(contextComUsuario({ papel: "COMUM" }))).toBe(true);
  });

  it("permite qualquer autenticado em rota sem @Roles (required undefined)", () => {
    exigirPapeis(undefined);
    expect(guard.canActivate(contextComUsuario({ papel: "COMUM" }))).toBe(true);
  });

  it("barra usuário ausente em rota com @Roles", () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    expect(() => guard.canActivate(contextComUsuario(undefined))).toThrow(ForbiddenException);
  });
});
