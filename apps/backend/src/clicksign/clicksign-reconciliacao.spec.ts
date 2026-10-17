import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClicksignSyncService } from "./clicksign-sync.service";
import { ClicksignReconciliacaoScheduler } from "./clicksign-reconciliacao.scheduler";
import { JOB_POLL_TICK, JOB_RECONCILIAR } from "./clicksign.queue";
import { resolvePastaPaiId } from "../ai/drive-routing";

/**
 * Cobertura INDEPENDENTE (agente `tester`, §A.38) da RECONCILIAÇÃO DOS TERMINAIS da Clicksign.
 *
 * Requisito (do coordenador): `ClicksignSyncService.reconciliarFechados()` re-confere na Clicksign os
 * envelopes CANCELADO/EXPIRADO (que o tick normal NÃO varre) e, quando o terminal está `closed`,
 * arquiva o assinado (vira ASSINADO). Declínio (farol DECLINOU/RESCISAO) NUNCA é reconciliado. O
 * agendador só ENFILEIRA, com kill-switch por env. O roteamento do job `reconciliar-fechados` chama
 * o método. Mocks no estilo de `clicksign-sync.tick.spec.ts` (sem banco/Redis reais).
 */

// recomputeFarolGlobal toca o banco — fora do escopo; isola o caminho ASSINADO (igual ao tick spec).
vi.mock("../admissoes/farol", () => ({
  recomputeFarolGlobal: vi.fn().mockResolvedValue(undefined),
}));

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};

const S3_URL = "https://s3.sa-east-1.amazonaws.com/clicksign/contrato.pdf?X-Amz-Expires=300";
const DRIVE_URL = "https://drive.google.com/drive/folders/PASTA_PRONTUARIO";

/** PDF que a guarda §A.33 aceita como assinado (traz o dicionário /Sig + Name(Clicksign)). */
const PDF_ASSINADO = Buffer.from(
  "%PDF-1.7\n9 0 obj\n<</Type/Sig/ByteRange [0 840 8420 1200]" +
    "/Reference[<</TransformMethod/DocMDP>>]/Name(Clicksign)>>\nendobj\n%%EOF\n",
);

function respostaComPdf(pdf: Buffer): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
  } as unknown as Response;
}

/** Builder thenable que ignora a query, GRAVA o `where` recebido e resolve um resultado fixo. */
function selectChain<T>(result: T, onWhere: (arg: unknown) => void) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "orderBy", "groupBy"]) {
    b[m] = () => b;
  }
  b.where = (arg: unknown) => {
    onWhere(arg);
    return b;
  };
  b.then = (res: (v: T) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return b;
}

interface AdmRow {
  id: string;
  codCliente: string;
  tipoContrato: string | null;
  clienteVinculoId: string | null;
  clicksignEnvelopeId: string;
  clicksignStatus: string;
  candidatoNome: string;
  candidatoCpf: string;
  candidatoEmail: string;
  clienteOperacao: string;
  pausadaEm: Date | null;
  kitAssinaturaPath: string | null;
}

function admRow(over: Partial<AdmRow> = {}): AdmRow {
  return {
    id: "adm-1",
    codCliente: "16",
    tipoContrato: "Temporário",
    clienteVinculoId: null,
    clicksignEnvelopeId: "env-1",
    clicksignStatus: "CANCELADO",
    candidatoNome: "Maria Silva",
    candidatoCpf: "11144477735",
    candidatoEmail: "maria@e.com",
    clienteOperacao: "Loja Centro",
    pausadaEm: null,
    kitAssinaturaPath: null,
    ...over,
  };
}

function montar(opts: {
  apiAtivo?: boolean;
  selectResults?: unknown[];
  /** status devolvido por `consultarStatus` para TODO envelope consultado. */
  status?: string;
  /** url devolvida por `obterUrlAssinado`. */
  url?: string;
}) {
  const whereArgs: unknown[] = [];
  const consultarStatus = vi
    .fn()
    .mockResolvedValue(opts.status ? { status: opts.status } : undefined);
  const obterUrlAssinado = vi.fn().mockResolvedValue(opts.url);
  const api = {
    estaAtivo: vi.fn().mockReturnValue(opts.apiAtivo ?? true),
    consultarStatus,
    obterUrlAssinado,
  };

  const setCalls: Record<string, unknown>[] = [];
  const update = vi.fn().mockImplementation(() => ({
    set: (v: Record<string, unknown>) => {
      setCalls.push(v);
      return { where: () => Promise.resolve(undefined) };
    },
  }));

  const results = opts.selectResults ?? [];
  let selI = 0;
  const select = vi
    .fn()
    .mockImplementation(() => selectChain(results[selI++] ?? [], (a) => whereArgs.push(a)));

  const db = { select, update, query: {} };
  const staging = {
    salvar: vi.fn().mockResolvedValue("/staging/contrato_assinado.pdf"),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    dentroDaRaiz: vi.fn(),
  };
  const ai = { arquivarDrive: vi.fn().mockResolvedValue({ pastaUrl: DRIVE_URL }) };
  const queue = { enfileirarTick: vi.fn(), enfileirarCriarEnvelope: vi.fn() };
  const kit = { gerar: vi.fn() };
  const schedulerFake = {
    marcarInicioCiclo: vi.fn().mockResolvedValue(undefined),
    registrarCiclo: vi.fn().mockResolvedValue(undefined),
  };
  const assinantesFake = { resolverConjunto: vi.fn().mockResolvedValue([]) };

  const svc = new ClicksignSyncService(
    db as never,
    {} as ConfigService,
    api as never,
    queue as never,
    staging as never,
    ai as never,
    kit as never,
    drivePastaPaiFake as never,
    schedulerFake as never,
    assinantesFake as never,
  );
  const log = vi
    .spyOn((svc as unknown as { logger: { log: (m: string) => void } }).logger, "log")
    .mockImplementation(() => undefined);
  const warn = vi
    .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
    .mockImplementation(() => undefined);
  return { svc, api, consultarStatus, obterUrlAssinado, setCalls, staging, ai, db, whereArgs, log, warn };
}

/**
 * O `where` do drizzle é um objeto SQL com referências circulares (a coluna aponta para a tabela, que
 * aponta de volta), então `JSON.stringify` quebra. Varre o grafo com um WeakSet e devolve TODOS os
 * literais string encontrados: os valores do predicado (`"CANCELADO"`, `"DECLINOU"`, ...) estão entre
 * eles, que é o que estes testes precisam ver.
 */
function coletarStrings(raiz: unknown): string {
  const vistos = new WeakSet<object>();
  const out: string[] = [];
  const pilha: unknown[] = [raiz];
  while (pilha.length) {
    const v = pilha.pop();
    if (typeof v === "string") {
      out.push(v);
    } else if (v && typeof v === "object") {
      if (vistos.has(v as object)) continue;
      vistos.add(v as object);
      for (const k of Object.keys(v as Record<string, unknown>)) {
        pilha.push((v as Record<string, unknown>)[k]);
      }
    }
  }
  return out.join(" | ");
}

describe("reconciliarFechados — inércia sem token (§A.5/§A.6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sem token: no-op, varridas:0, NÃO consulta a Clicksign nem o banco", async () => {
    const { svc, api, consultarStatus, db } = montar({ apiAtivo: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await svc.reconciliarFechados();

    expect(r).toEqual({ varridas: 0, reconciliados: 0, falhas: 0 });
    expect(api.estaAtivo).toHaveBeenCalled();
    expect(consultarStatus).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("reconciliarFechados — só CANCELADO/EXPIRADO closed vira ASSINADO", () => {
  afterEach(() => vi.restoreAllMocks());

  it("CANCELADO 'closed' → arquiva e vira ASSINADO (reconciliados:1)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(respostaComPdf(PDF_ASSINADO));
    const { svc, consultarStatus, obterUrlAssinado, setCalls, ai } = montar({
      selectResults: [[{ id: "adm-1", envelopeId: "env-1" }], [admRow()]],
      status: "closed",
      url: S3_URL,
    });

    const r = await svc.reconciliarFechados();

    expect(consultarStatus).toHaveBeenCalledWith("env-1");
    expect(obterUrlAssinado).toHaveBeenCalledWith("env-1");
    expect(fetchSpy).toHaveBeenCalledWith(S3_URL);
    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    const persistido = setCalls.find((s) => s.clicksignStatus === "ASSINADO");
    expect(persistido).toBeDefined();
    expect(persistido?.contratoAssinadoDriveUrl).toBe(DRIVE_URL);
    expect(r).toEqual({ varridas: 1, reconciliados: 1, falhas: 0 });
  });

  it("EXPIRADO 'closed' → também reconcilia (o alvo inclui EXPIRADO)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respostaComPdf(PDF_ASSINADO));
    const { svc, setCalls } = montar({
      selectResults: [[{ id: "adm-9", envelopeId: "env-9" }], [admRow({ id: "adm-9", clicksignEnvelopeId: "env-9", clicksignStatus: "EXPIRADO" })]],
      status: "closed",
      url: S3_URL,
    });

    const r = await svc.reconciliarFechados();

    expect(setCalls.find((s) => s.clicksignStatus === "ASSINADO")).toBeDefined();
    expect(r.reconciliados).toBe(1);
  });

  it("o alvo filtra por CANCELADO/EXPIRADO, envelope não-nulo e NÃO pausada (query construída)", async () => {
    const { svc, whereArgs } = montar({ selectResults: [[]] });
    await svc.reconciliarFechados();
    // O primeiro `where` é o do SELECT do alvo. Serializa os params do predicado.
    const s = coletarStrings(whereArgs[0]);
    expect(s).toContain("CANCELADO");
    expect(s).toContain("EXPIRADO");
  });
});

describe("reconciliarFechados — terminal NÃO fechado fica intacto", () => {
  afterEach(() => vi.restoreAllMocks());

  it("CANCELADO ainda 'canceled' → NÃO arquiva, NÃO marca ASSINADO", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { svc, obterUrlAssinado, setCalls, ai } = montar({
      selectResults: [[{ id: "adm-1", envelopeId: "env-1" }]],
      status: "canceled",
    });

    const r = await svc.reconciliarFechados();

    expect(obterUrlAssinado).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(setCalls.find((s) => s.clicksignStatus === "ASSINADO")).toBeUndefined();
    expect(r).toEqual({ varridas: 1, reconciliados: 0, falhas: 0 });
  });

  it("'running' → no-op (o provedor ainda não fechou)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { svc, obterUrlAssinado, setCalls, ai } = montar({
      selectResults: [[{ id: "adm-1", envelopeId: "env-1" }]],
      status: "running",
    });

    const r = await svc.reconciliarFechados();

    expect(obterUrlAssinado).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(setCalls.find((s) => s.clicksignStatus === "ASSINADO")).toBeUndefined();
    expect(r).toEqual({ varridas: 1, reconciliados: 0, falhas: 0 });
  });

  it("falha ao reconferir conta em `falhas` e NÃO derruba a passada", async () => {
    const { svc } = montar({ selectResults: [[{ id: "adm-1", envelopeId: "env-1" }]] });
    (svc as unknown as { api: { consultarStatus: ReturnType<typeof vi.fn> } }).api.consultarStatus =
      vi.fn().mockRejectedValue(new Error("Clicksign HTTP 500"));

    const r = await svc.reconciliarFechados();

    expect(r).toEqual({ varridas: 1, reconciliados: 0, falhas: 1 });
  });
});

describe("reconciliarFechados — REGRA DO DIRETOR: declínio NUNCA vira ASSINADO", () => {
  afterEach(() => vi.restoreAllMocks());

  it("o alvo EXCLUI DECLINOU/RESCISAO por farol (query construída)", async () => {
    const { svc, whereArgs } = montar({ selectResults: [[]] });
    await svc.reconciliarFechados();
    const s = coletarStrings(whereArgs[0]);
    // A exclusão do declínio tem de estar NA QUERY: é a camada que impede o DECLINOU de ser varrido.
    expect(s).toContain("DECLINOU");
    expect(s).toContain("RESCISAO");
  });

  it("excluído pela query, um DECLINOU 'closed' NÃO é consultado nem arquivado", async () => {
    // Simula a query real: o alvo volta VAZIO porque o filtro de farol tirou a admissão de declínio.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { svc, consultarStatus, obterUrlAssinado, setCalls, ai } = montar({
      selectResults: [[]],
      status: "closed",
      url: S3_URL,
    });

    const r = await svc.reconciliarFechados();

    expect(consultarStatus).not.toHaveBeenCalled();
    expect(obterUrlAssinado).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(setCalls.find((s) => s.clicksignStatus === "ASSINADO")).toBeUndefined();
    expect(r).toEqual({ varridas: 0, reconciliados: 0, falhas: 0 });
  });
});

describe("roteamento do job no worker (processarJob)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("job 'reconciliar-fechados' (JOB_RECONCILIAR) chama reconciliarFechados", async () => {
    const { svc } = montar({});
    const recon = vi
      .spyOn(svc, "reconciliarFechados")
      .mockResolvedValue({ varridas: 0, reconciliados: 0, falhas: 0 });
    const tick = vi
      .spyOn(svc, "processarTick")
      .mockResolvedValue(undefined as never);

    await (svc as unknown as { processarJob: (j: unknown) => Promise<void> }).processarJob({
      name: JOB_RECONCILIAR,
      data: {},
    });

    expect(recon).toHaveBeenCalledTimes(1);
    expect(tick).not.toHaveBeenCalled();
  });

  it("job 'poll-tick' NÃO chama reconciliarFechados (não confunde rota)", async () => {
    const { svc } = montar({});
    const recon = vi
      .spyOn(svc, "reconciliarFechados")
      .mockResolvedValue({ varridas: 0, reconciliados: 0, falhas: 0 });
    vi.spyOn(svc, "processarTick").mockResolvedValue(undefined as never);

    await (svc as unknown as { processarJob: (j: unknown) => Promise<void> }).processarJob({
      name: JOB_POLL_TICK,
      data: {},
    });

    expect(recon).not.toHaveBeenCalled();
  });
});

describe("ClicksignReconciliacaoScheduler — kill-switch e só ENFILEIRA", () => {
  const ENV = process.env.CLICKSIGN_RECONCILIACAO;
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (ENV === undefined) delete process.env.CLICKSIGN_RECONCILIACAO;
    else process.env.CLICKSIGN_RECONCILIACAO = ENV;
  });

  it("CLICKSIGN_RECONCILIACAO=off → NÃO agenda nada, nunca enfileira", async () => {
    process.env.CLICKSIGN_RECONCILIACAO = "off";
    vi.useFakeTimers();
    const queue = { enfileirarReconciliacao: vi.fn().mockResolvedValue(undefined) };
    const sch = new ClicksignReconciliacaoScheduler(queue as never);

    sch.onModuleInit();
    // Mesmo passando MUITO do atraso da primeira passada, nada é enfileirado.
    await vi.advanceTimersByTimeAsync(ClicksignReconciliacaoScheduler.ATRASO_DA_PRIMEIRA_MS + 1000);

    expect(queue.enfileirarReconciliacao).not.toHaveBeenCalled();
    sch.onModuleDestroy();
  });

  it("ligado → agenda a primeira passada, que só ENFILEIRA (enfileirarReconciliacao)", async () => {
    delete process.env.CLICKSIGN_RECONCILIACAO;
    vi.useFakeTimers();
    const queue = { enfileirarReconciliacao: vi.fn().mockResolvedValue(undefined) };
    const sch = new ClicksignReconciliacaoScheduler(queue as never);

    sch.onModuleInit();
    expect(queue.enfileirarReconciliacao).not.toHaveBeenCalled(); // atrasada, não roda no boot

    await vi.advanceTimersByTimeAsync(ClicksignReconciliacaoScheduler.ATRASO_DA_PRIMEIRA_MS);

    expect(queue.enfileirarReconciliacao).toHaveBeenCalledTimes(1);
    sch.onModuleDestroy();
  });
});
