import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { ClicksignController } from "./clicksign.controller";

const USER: AuthUser = { id: "u-1", email: "c@e.com", papel: "COMUM", senhaTemporaria: false };

function montar(over: { ligado?: boolean } = {}) {
  const reenviarCorrecao = vi
    .fn()
    .mockResolvedValue({ downloadToken: "tok", nomeArquivo: "kit.pdf" });
  const sync = { reenviarCorrecao };
  // O tick passou a atravessar o SCHEDULER (e não a fila direto), para respeitar o liga/desliga.
  const ligado = over.ligado ?? true;
  const dispararCiclo = vi.fn().mockResolvedValue({ enfileirado: ligado, ligado });
  const scheduler = { dispararCiclo };
  const listar = vi.fn().mockResolvedValue({ itens: [] });
  const cancelar = vi.fn().mockResolvedValue({ ok: true, status: "CANCELADO" });
  const dispararLote = vi.fn().mockResolvedValue({ total: 2, disparados: 2, itens: [] });
  const gestao = { listar, cancelar, dispararLote };
  const ctrl = new ClicksignController(sync as never, gestao as never, scheduler as never);
  return { ctrl, dispararCiclo, reenviarCorrecao, listar, cancelar, dispararLote };
}

describe("ClicksignController — tick (INT-4 / §A.5)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declara HTTP 202 no /internal/clicksign/tick (responde 202 mesmo inerte — só enfileira)", () => {
    // @HttpCode(202) grava a metadata; o trabalho roda no worker (no-op se inerte) — o endpoint
    // sempre aceita e devolve 202.
    const code = Reflect.getMetadata("__httpCode__", ClicksignController.prototype.tick);
    expect(code).toBe(202);
  });

  it("tick dispara o ciclo pelo scheduler (respeita o liga/desliga) e devolve o resultado", async () => {
    const { ctrl, dispararCiclo } = montar();
    await expect(ctrl.tick()).resolves.toEqual({ enfileirado: true, ligado: true });
    expect(dispararCiclo).toHaveBeenCalledTimes(1);
  });

  it("scheduler DESLIGADO: o disparo externo NÃO enfileira (o freio vale para todos os caminhos)", async () => {
    const { ctrl } = montar({ ligado: false });
    await expect(ctrl.tick()).resolves.toEqual({ enfileirado: false, ligado: false });
  });
});

describe("ClicksignController — gestão (menu de assinaturas)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aba inválida ou ausente cai em 'abertos' (a aba de trabalho)", async () => {
    const { ctrl, listar } = montar();
    await ctrl.listar(undefined);
    await ctrl.listar("inexistente");
    expect(listar).toHaveBeenNthCalledWith(1, "abertos");
    expect(listar).toHaveBeenNthCalledWith(2, "abertos");
  });

  it("aba válida é repassada como veio", async () => {
    const { ctrl, listar } = montar();
    await ctrl.listar("aptos");
    expect(listar).toHaveBeenCalledWith("aptos");
  });

  it("disparar-lote repassa a seleção e o autor (o modal de upload deixou de existir)", async () => {
    const { ctrl, dispararLote } = montar();
    await ctrl.dispararLote({ admissaoIds: ["a", "b"] }, USER);
    expect(dispararLote).toHaveBeenCalledWith(["a", "b"], USER);
  });

  it("disparar-lote sem corpo vira lista vazia (o service é quem recusa)", async () => {
    const { ctrl, dispararLote } = montar();
    await ctrl.dispararLote({}, USER);
    expect(dispararLote).toHaveBeenCalledWith([], USER);
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
