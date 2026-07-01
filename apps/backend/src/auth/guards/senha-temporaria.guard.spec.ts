import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SENHA_TEMPORARIA_CODE } from "@ea/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IS_PUBLIC_KEY, PERMITE_SENHA_TEMPORARIA_KEY } from "../decorators";
import { SenhaTemporariaGuard } from "./senha-temporaria.guard";

/**
 * Troca obrigatória de senha no primeiro acesso (OST-EA-GESTAO-USUARIOS). O guard só barra quando
 * há usuário COM senha temporária E a rota não tem bypass (@PermiteSenhaTemporaria/@Public).
 */
describe("SenhaTemporariaGuard (OST)", () => {
  let guard: SenhaTemporariaGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new SenhaTemporariaGuard(reflector);
  });

  function contexto(user: { senhaTemporaria: boolean } | undefined): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  /** Simula a metadata reflectida para IS_PUBLIC / PERMITE_SENHA_TEMPORARIA. */
  function metadata(opts: { publico?: boolean; permite?: boolean }): void {
    vi.spyOn(reflector, "getAllAndOverride").mockImplementation((key: unknown) => {
      if (key === IS_PUBLIC_KEY) return opts.publico ?? false;
      if (key === PERMITE_SENHA_TEMPORARIA_KEY) return opts.permite ?? false;
      return undefined;
    });
  }

  it("bloqueia quando senhaTemporaria=true e rota sem bypass (403 com código estável)", () => {
    metadata({});
    try {
      guard.canActivate(contexto({ senhaTemporaria: true }));
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const resp = (e as ForbiddenException).getResponse() as { code?: string };
      expect(resp.code).toBe(SENHA_TEMPORARIA_CODE);
    }
  });

  it("libera rota @PermiteSenhaTemporaria mesmo com senha temporária", () => {
    metadata({ permite: true });
    expect(guard.canActivate(contexto({ senhaTemporaria: true }))).toBe(true);
  });

  it("libera rota @Public", () => {
    metadata({ publico: true });
    expect(guard.canActivate(contexto({ senhaTemporaria: true }))).toBe(true);
  });

  it("libera quando a flag é false", () => {
    metadata({});
    expect(guard.canActivate(contexto({ senhaTemporaria: false }))).toBe(true);
  });

  it("libera quando não há usuário (deixa os demais guards decidirem)", () => {
    metadata({});
    expect(guard.canActivate(contexto(undefined))).toBe(true);
  });
});
