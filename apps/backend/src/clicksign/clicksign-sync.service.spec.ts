import { ConflictException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { ClicksignSyncService, TERMO_DUPLA_CORRECAO } from "./clicksign-sync.service";

const USER: AuthUser = { id: "u-1", email: "c@e.com", papel: "COMUM", senhaTemporaria: false };

/** Monta o service com colaboradores mockados (sem subir Worker/Redis — onModuleInit não é chamado). */
function montar(over: {
  apiAtivo?: boolean;
  admissao?: Record<string, unknown> | undefined;
  gerar?: ReturnType<typeof vi.fn>;
  cancelar?: ReturnType<typeof vi.fn>;
  insert?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}) {
  const api = {
    estaAtivo: vi.fn().mockReturnValue(over.apiAtivo ?? false),
    cancelarEnvelope: over.cancelar ?? vi.fn().mockResolvedValue(undefined),
  };
  const gerar =
    over.gerar ?? vi.fn().mockResolvedValue({ downloadToken: "tok", nomeArquivo: "kit.pdf" });
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = over.insert ?? vi.fn().mockReturnValue({ values: insertValues });
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const update = over.update ?? vi.fn().mockReturnValue({ set: () => ({ where: updateWhere }) });
  const db = {
    query: { admissoes: { findFirst: vi.fn().mockResolvedValue(over.admissao) } },
    insert,
    update,
    select: vi.fn(),
  };
  const queue = { enfileirarTick: vi.fn(), enfileirarCriarEnvelope: vi.fn() };
  const staging = { dentroDaRaiz: vi.fn(), salvar: vi.fn(), removerArquivo: vi.fn() };
  const ai = { arquivarDrive: vi.fn() };
  const kit = { gerar };
  const svc = new ClicksignSyncService(
    db as never,
    {} as ConfigService,
    api as never,
    queue as never,
    staging as never,
    ai as never,
    kit as never,
  );
  return { svc, api, gerar, insert, insertValues, update, db };
}

describe("ClicksignSyncService — inércia sem token (§A.5/§A.6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("criarEnvelope é no-op sem token (não consulta o banco)", async () => {
    const { svc, db } = montar({ apiAtivo: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    expect(db.select).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("processarTick é no-op sem token (não consulta o banco)", async () => {
    const { svc, db } = montar({ apiAtivo: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await svc.processarTick();
    expect(db.select).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ClicksignSyncService — reenvio por correção / dupla correção (§A.5/§A.6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("PANDAPE sem aceite → 409 needsConfirmation, NÃO grava aceite nem regenera", async () => {
    const { svc, gerar, insert } = montar({
      admissao: { id: "adm-1", origem: "PANDAPE", clicksignEnvelopeId: "env-1" },
    });
    await expect(svc.reenviarCorrecao("adm-1", {} as never, false, USER)).rejects.toMatchObject({
      response: { needsConfirmation: true, reason: "duplaCorrecao" },
    });
    await expect(svc.reenviarCorrecao("adm-1", {} as never, false, USER)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(insert).not.toHaveBeenCalled();
    expect(gerar).not.toHaveBeenCalled();
  });

  it("PANDAPE com aceite → grava duplaCorrecaoAceites ANTES, cancela e regenera", async () => {
    const cancelar = vi.fn().mockResolvedValue(undefined);
    const { svc, gerar, insert, insertValues } = montar({
      admissao: { id: "adm-1", origem: "PANDAPE", clicksignEnvelopeId: "env-1" },
      cancelar,
    });
    const r = await svc.reenviarCorrecao("adm-1", {} as never, true, USER);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith({
      admissaoId: "adm-1",
      autorId: "u-1",
      termo: TERMO_DUPLA_CORRECAO,
    });
    expect(cancelar).toHaveBeenCalledWith("env-1");
    expect(gerar).toHaveBeenCalledWith("adm-1", expect.anything());
    expect(r).toEqual({ downloadToken: "tok", nomeArquivo: "kit.pdf" });
  });

  it("MANUAL sem aceite → não exige confirmação, regenera (sem gravar aceite)", async () => {
    const { svc, gerar, insert } = montar({
      admissao: { id: "adm-2", origem: "MANUAL", clicksignEnvelopeId: null },
    });
    await svc.reenviarCorrecao("adm-2", {} as never, false, USER);
    expect(insert).not.toHaveBeenCalled();
    expect(gerar).toHaveBeenCalledWith("adm-2", expect.anything());
  });
});
