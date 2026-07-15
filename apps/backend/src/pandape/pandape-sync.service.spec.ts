import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { PandapeSyncService } from "./pandape-sync.service";
import type { PandapeApiService, PandaperPrecollaborator } from "./pandape-api.service";
import type { PandapeQueueService } from "./pandape-queue.service";
import type { AdmissoesService } from "../admissoes/admissoes.service";
import type { AuditoriaService } from "../auditoria/auditoria.service";

/**
 * QA da sincronização Pandapé (Fase 5 / INT-1) — COMPLEMENTA os specs já existentes
 * (pandape-api.service / internal-token.guard / resolver-tipo-documento), sem duplicá-los.
 *
 * Foco da DoD: idempotência ancorada no unique `idPrecollaborator` (regra 1 nascimento paralelo via
 * AdmissoesService.create; regra 5 não-bloqueio via bypassAceite), inércia total sem token, e pull
 * de docs reusando F2 (auditarBuffer) — com a garantia §A.6 de que a URL pública NUNCA é persistida
 * nem logada. Toda a API do Pandapé é MOCKADA (o token real não existe; nada de rede real).
 */

// Um pré-colaborador-modelo (payload documentado: ids + dados pessoais + documents[{label,url}]).
function pc(over: Partial<PandaperPrecollaborator> = {}): PandaperPrecollaborator {
  return {
    idPreCollaborator: "PC-1",
    idMatch: "M-1",
    idVacancy: "V-1",
    etapa: "DOCUMENTACAO",
    nome: "Fulano de Tal",
    cpf: "52998224725",
    telefone: "11999999999",
    email: "fulano@example.com",
    dataNascimento: "1990-01-01",
    documents: [],
    ...over,
  };
}

/** db mock: só os acessos que o sync usa. `query.X.findFirst` e `update().set().where()`. */
function makeDb() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const db = {
    query: {
      integracaoPandape: { findFirst: vi.fn() },
      clientes: { findFirst: vi.fn() },
      cargos: { findFirst: vi.fn() },
      tiposDocumento: { findFirst: vi.fn() },
      usuarios: { findFirst: vi.fn() },
    },
    update,
  };
  return { db, update, updateSet, updateWhere };
}

function makeApi(over: Partial<Record<keyof PandapeApiService, unknown>> = {}) {
  return {
    estaAtivo: vi.fn(() => true),
    listarMudancas: vi.fn().mockResolvedValue([]),
    getPrecollaborator: vi.fn(),
    getVacancy: vi.fn(),
    ...over,
  } as unknown as PandapeApiService;
}

function makeService(parts: {
  db: ReturnType<typeof makeDb>["db"];
  api: PandapeApiService;
  queue?: Partial<PandapeQueueService>;
  admissoes?: Partial<AdmissoesService>;
  auditoria?: Partial<AuditoriaService>;
}) {
  const queue = {
    enfileirarTick: vi.fn().mockResolvedValue(undefined),
    enfileirarCandidato: vi.fn().mockResolvedValue(undefined),
    ...parts.queue,
  } as unknown as PandapeQueueService;
  const admissoes = {
    create: vi.fn().mockResolvedValue({ admissaoId: "adm-1" }),
    ...parts.admissoes,
  } as unknown as AdmissoesService;
  const auditoria = {
    auditarBuffer: vi.fn().mockResolvedValue({ documento: {}, progresso: { completa: false } }),
    ...parts.auditoria,
  } as unknown as AuditoriaService;
  const config = { get: () => undefined } as unknown as ConfigService;
  const svc = new PandapeSyncService(
    parts.db as never,
    config,
    parts.api,
    queue,
    admissoes,
    auditoria,
  );
  return { svc, queue, admissoes, auditoria };
}

afterEach(() => vi.restoreAllMocks());

describe("PandapeSyncService — idempotência da sync (DoD §1 / regra 1 / unique idPrecollaborator)", () => {
  beforeEach(() => {
    // fetch é só de pull de docs; nestes cenários os documents são vazios → não deve ser chamado.
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("(a) idPreCollaborator NOVO → cria 1 admissão (1 create) com origem PANDAPE + bypassAceite + IDs", async () => {
    const { db } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue(undefined); // novo
    db.query.clientes.findFirst.mockResolvedValue({ codCliente: "C-10" });
    db.query.cargos.findFirst.mockResolvedValue({ id: "cargo-1" });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc()),
      getVacancy: vi.fn().mockResolvedValue({
        idVacancy: "V-1",
        clienteCnpj: "12345678000190",
        cargoNome: "Operador",
      }),
    });
    const { svc, admissoes } = makeService({ db, api });

    await svc.processarCandidato("PC-1");

    expect(admissoes.create).toHaveBeenCalledTimes(1);
    const [dto, user, opts] = (admissoes.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(user).toBeUndefined();
    expect(opts).toMatchObject({
      origem: "PANDAPE",
      bypassAceite: true,
      pandape: {
        idPrecollaborator: "PC-1",
        idMatch: "M-1",
        idVacancy: "V-1",
        etapa: "DOCUMENTACAO",
      },
    });
    expect(dto).toMatchObject({ codCliente: "C-10", cargoId: "cargo-1" });
    // nenhuma atualização de etapa: é criação, não conhecido.
    expect(db.update).not.toHaveBeenCalled();
  });

  it("(b) CONHECIDO com etapa DIFERENTE → atualiza só a etapa, sem nova admissão", async () => {
    const { db, update, updateSet } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue({
      id: "int-1",
      etapa: "DOCUMENTACAO",
    });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc({ etapa: "EXAME" })),
    });
    const { svc, admissoes } = makeService({ db, api });

    await svc.processarCandidato("PC-1");

    expect(admissoes.create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ etapa: "EXAME" }));
    // não foi consultada vaga/cliente/cargo (não é criação).
    expect(api.getVacancy).not.toHaveBeenCalled();
  });

  it("(c) CONHECIDO com MESMA etapa → no-op (nem create nem update)", async () => {
    const { db, update } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue({ id: "int-1", etapa: "EXAME" });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc({ etapa: "EXAME" })),
    });
    const { svc, admissoes } = makeService({ db, api });

    await svc.processarCandidato("PC-1");

    expect(admissoes.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("(d.1) DUAS execuções sequenciais sobre o MESMO payload → 1 admissão só (2ª vê o existente)", async () => {
    const { db } = makeDb();
    // 1ª chamada: novo; 2ª chamada: já existe (criado pela 1ª).
    db.query.integracaoPandape.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "int-1", etapa: "DOCUMENTACAO" });
    db.query.clientes.findFirst.mockResolvedValue({ codCliente: "C-10" });
    db.query.cargos.findFirst.mockResolvedValue({ id: "cargo-1" });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc()),
      getVacancy: vi.fn().mockResolvedValue({
        idVacancy: "V-1",
        clienteCnpj: "12345678000190",
        cargoNome: "Operador",
      }),
    });
    const { svc, admissoes } = makeService({ db, api });

    await svc.processarCandidato("PC-1");
    await svc.processarCandidato("PC-1");

    expect(admissoes.create).toHaveBeenCalledTimes(1); // idempotente
  });

  it("(d.2) CORRIDA: create estoura unique 23505 → tratado como 'já existe' (no-op, não relança)", async () => {
    const { db } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue(undefined); // ambos os ticks viram 'novo'
    db.query.clientes.findFirst.mockResolvedValue({ codCliente: "C-10" });
    db.query.cargos.findFirst.mockResolvedValue({ id: "cargo-1" });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc()),
      getVacancy: vi.fn().mockResolvedValue({
        idVacancy: "V-1",
        clienteCnpj: "12345678000190",
        cargoNome: "Operador",
      }),
    });
    const erro23505 = Object.assign(new Error("duplicate key"), { code: "23505" });
    const { svc, admissoes } = makeService({
      db,
      api,
      admissoes: { create: vi.fn().mockRejectedValue(erro23505) },
    });

    await expect(svc.processarCandidato("PC-1")).resolves.toBeUndefined(); // não relança
    expect(admissoes.create).toHaveBeenCalledTimes(1);
  });

  it("erro NÃO-unique no create sobe para o backoff do BullMQ (não engole)", async () => {
    const { db } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue(undefined);
    db.query.clientes.findFirst.mockResolvedValue({ codCliente: "C-10" });
    db.query.cargos.findFirst.mockResolvedValue({ id: "cargo-1" });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc()),
      getVacancy: vi.fn().mockResolvedValue({
        idVacancy: "V-1",
        clienteCnpj: "12345678000190",
        cargoNome: "Operador",
      }),
    });
    const { svc } = makeService({
      db,
      api,
      admissoes: { create: vi.fn().mockRejectedValue(new Error("db down")) },
    });

    await expect(svc.processarCandidato("PC-1")).rejects.toThrow("db down");
  });

  it("vaga NÃO mapeável (sem cliente/cargo) → adia: NÃO cria admissão (não inventa FK)", async () => {
    const { db } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue(undefined);
    db.query.clientes.findFirst.mockResolvedValue(undefined); // CNPJ não bate
    db.query.cargos.findFirst.mockResolvedValue(undefined);
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc()),
      getVacancy: vi.fn().mockResolvedValue({ idVacancy: "V-1" }),
    });
    const { svc, admissoes } = makeService({ db, api });

    await svc.processarCandidato("PC-1");
    expect(admissoes.create).not.toHaveBeenCalled();
  });

  it("pré-colaborador sem CPF → adia (não-bloqueio): NÃO cria admissão", async () => {
    const { db } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue(undefined);
    db.query.clientes.findFirst.mockResolvedValue({ codCliente: "C-10" });
    db.query.cargos.findFirst.mockResolvedValue({ id: "cargo-1" });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc({ cpf: undefined })),
      getVacancy: vi.fn().mockResolvedValue({
        idVacancy: "V-1",
        clienteCnpj: "12345678000190",
        cargoNome: "Operador",
      }),
    });
    const { svc, admissoes } = makeService({ db, api });

    await svc.processarCandidato("PC-1");
    expect(admissoes.create).not.toHaveBeenCalled();
  });

  it("etapa pode chegar como `stage` (locale alternativo) e ainda atualiza", async () => {
    const { db, update, updateSet } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue({ id: "int-1", etapa: "DOCUMENTACAO" });
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc({ etapa: undefined, stage: "ENTREVISTA" })),
    });
    const { svc } = makeService({ db, api });

    await svc.processarCandidato("PC-1");
    expect(update).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ etapa: "ENTREVISTA" }));
  });
});

describe("PandapeSyncService — inércia sem token (DoD §4)", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("processarTick é no-op quando estaAtivo()=false: não lista mudanças nem enfileira, fetch nunca chamado", async () => {
    const { db } = makeDb();
    const api = makeApi({ estaAtivo: vi.fn(() => false), listarMudancas: vi.fn() });
    const { svc, queue } = makeService({ db, api });

    await svc.processarTick();

    expect(api.listarMudancas).not.toHaveBeenCalled();
    expect(queue.enfileirarCandidato).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("processarCandidato é no-op quando estaAtivo()=false: não toca o banco, não cria, fetch nunca chamado", async () => {
    const { db } = makeDb();
    const api = makeApi({ estaAtivo: vi.fn(() => false), getPrecollaborator: vi.fn() });
    const { svc, admissoes } = makeService({ db, api });

    await svc.processarCandidato("PC-1");

    expect(db.query.integracaoPandape.findFirst).not.toHaveBeenCalled();
    expect(api.getPrecollaborator).not.toHaveBeenCalled();
    expect(admissoes.create).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("processarTick ATIVO enfileira 1 sync por id retornado", async () => {
    const { db } = makeDb();
    const api = makeApi({
      estaAtivo: vi.fn(() => true),
      listarMudancas: vi.fn().mockResolvedValue(["PC-1", "PC-2"]),
    });
    const { svc, queue } = makeService({ db, api });

    await svc.processarTick();

    expect(queue.enfileirarCandidato).toHaveBeenCalledTimes(2);
    expect(queue.enfileirarCandidato).toHaveBeenCalledWith("PC-1");
    expect(queue.enfileirarCandidato).toHaveBeenCalledWith("PC-2");
  });
});

describe("PandapeSyncService — pull de docs reusa F2 (DoD §5 / §A.6 URL nunca persistida ou logada)", () => {
  const URL_SECRETA = "https://pandape.example.com/docs/secreto-abc?token=naoexpira";

  function fetchOk() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
  }

  function novoComDocs(documents: PandaperPrecollaborator["documents"]) {
    const { db, update } = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue(undefined);
    db.query.clientes.findFirst.mockResolvedValue({ codCliente: "C-10" });
    db.query.cargos.findFirst.mockResolvedValue({ id: "cargo-1" });
    db.query.usuarios.findFirst.mockResolvedValue({
      id: "user-sys",
      email: "sys@soulan.com.br",
      papel: "SUPER_ADMIN",
    });
    // tiposDocumento.findFirst resolve por código (RG existe; o que não for mapeável nem chega aqui).
    db.query.tiposDocumento.findFirst.mockImplementation(async () => ({
      id: "tipo-rg",
      codigo: "RG",
    }));
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc({ documents })),
      getVacancy: vi.fn().mockResolvedValue({
        idVacancy: "V-1",
        clienteCnpj: "12345678000190",
        cargoNome: "Operador",
      }),
    });
    return { db, update, api };
  }

  it("doc com tipo mapeável → auditarBuffer 1x; tipo NÃO mapeável → PULADO (não quebra)", async () => {
    const { db, api } = novoComDocs([
      { label: "RG", url: URL_SECRETA },
      { label: "Documento Estranho XYZ", url: "https://pandape.example.com/x?t=2" },
    ]);
    vi.stubGlobal("fetch", fetchOk());
    const { svc, auditoria } = makeService({ db, api });

    await svc.processarCandidato("PC-1");

    // só o mapeável foi auditado.
    expect(auditoria.auditarBuffer).toHaveBeenCalledTimes(1);
    const [admissaoId, tipoId, arquivo, user] = (
      auditoria.auditarBuffer as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(admissaoId).toBe("adm-1");
    expect(tipoId).toBe("tipo-rg");
    expect(arquivo.buffer).toBeInstanceOf(Buffer);
    // o originalname é o CÓDIGO do tipo, NUNCA a URL (§A.6).
    expect(arquivo.originalname).toBe("RG");
    expect(arquivo.originalname).not.toContain("http");
    expect(user).toMatchObject({ id: "user-sys" });

    vi.unstubAllGlobals();
  });

  it("a URL pública NUNCA aparece em chamada que persista (create/update/auditarBuffer) nem em log (§A.6)", async () => {
    const { db, update, api } = novoComDocs([{ label: "RG", url: URL_SECRETA }]);
    vi.stubGlobal("fetch", fetchOk());
    const { svc, admissoes, auditoria } = makeService({ db, api });

    // captura tudo que poderia vazar a URL: logger, create, update, auditarBuffer, e o fetch real.
    const logSpy = vi
      .spyOn((svc as unknown as { logger: { log: (m: string) => void } }).logger, "log")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
      .mockImplementation(() => undefined);

    await svc.processarCandidato("PC-1");

    const contemUrl = (calls: unknown[][]) => JSON.stringify(calls).includes("naoexpira");

    // fetch RECEBE a url (é o download legítimo, em memória) — isso é esperado.
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(URL_SECRETA);
    // mas nada que persista/loga pode conter a url.
    expect(contemUrl((admissoes.create as ReturnType<typeof vi.fn>).mock.calls)).toBe(false);
    expect(contemUrl((update as ReturnType<typeof vi.fn>).mock.calls)).toBe(false);
    expect(contemUrl((auditoria.auditarBuffer as ReturnType<typeof vi.fn>).mock.calls)).toBe(false);
    expect(contemUrl(logSpy.mock.calls)).toBe(false);
    expect(contemUrl(warnSpy.mock.calls)).toBe(false);

    vi.unstubAllGlobals();
  });

  it("doc sem URL → ignorado; download HTTP falho (não-ok) → pulado sem quebrar", async () => {
    const { db, api } = novoComDocs([
      { label: "RG" }, // sem url
      { label: "CPF", url: "https://pandape.example.com/cpf?t=3" },
    ]);
    db.query.tiposDocumento.findFirst.mockResolvedValue({ id: "tipo-cpf", codigo: "CPF" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    );
    const { svc, auditoria } = makeService({ db, api });

    await expect(svc.processarCandidato("PC-1")).resolves.toBeUndefined();
    // sem url → não baixa; com url mas 404 → pulado. Nenhuma auditoria.
    expect(auditoria.auditarBuffer).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
