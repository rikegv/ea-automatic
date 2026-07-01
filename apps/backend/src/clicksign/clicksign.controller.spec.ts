import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { ClicksignController } from "./clicksign.controller";

const USER: AuthUser = { id: "u-1", email: "c@e.com", papel: "COMUM", senhaTemporaria: false };

function montar() {
  const enfileirarTick = vi.fn().mockResolvedValue(undefined);
  const reenviarCorrecao = vi
    .fn()
    .mockResolvedValue({ downloadToken: "tok", nomeArquivo: "kit.pdf" });
  const sync = { enfileirarTick, reenviarCorrecao };
  const ctrl = new ClicksignController(sync as never);
  return { ctrl, enfileirarTick, reenviarCorrecao };
}

describe("ClicksignController — tick (INT-4 / §A.5)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declara HTTP 202 no /internal/clicksign/tick (responde 202 mesmo inerte — só enfileira)", () => {
    // @HttpCode(202) grava a metadata; o trabalho roda no worker (no-op se inerte) — o endpoint
    // sempre aceita e devolve 202.
    const code = Reflect.getMetadata("__httpCode__", ClicksignController.prototype.tick);
    expect(code).toBe(202);
  });

  it("tick enfileira o poll-tick e devolve { enfileirado: true }", async () => {
    const { ctrl, enfileirarTick } = montar();
    await expect(ctrl.tick()).resolves.toEqual({ enfileirado: true });
    expect(enfileirarTick).toHaveBeenCalledTimes(1);
  });
});

describe("ClicksignController — reenviar-correção: parsing do aceite multipart", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aceiteDuplaCorrecao 'true' (string multipart) → repassa boolean true", async () => {
    const { ctrl, reenviarCorrecao } = montar();
    await ctrl.reenviarCorrecao("adm-1", {} as never, { aceiteDuplaCorrecao: "true" }, USER);
    expect(reenviarCorrecao).toHaveBeenCalledWith("adm-1", expect.anything(), true, USER);
  });

  it("aceite ausente/qualquer-outro → false (não confirma por engano)", async () => {
    const { ctrl, reenviarCorrecao } = montar();
    await ctrl.reenviarCorrecao("adm-1", {} as never, {}, USER);
    await ctrl.reenviarCorrecao("adm-1", {} as never, { aceiteDuplaCorrecao: "1" }, USER);
    expect(reenviarCorrecao).toHaveBeenNthCalledWith(1, "adm-1", expect.anything(), false, USER);
    expect(reenviarCorrecao).toHaveBeenNthCalledWith(2, "adm-1", expect.anything(), false, USER);
  });
});
