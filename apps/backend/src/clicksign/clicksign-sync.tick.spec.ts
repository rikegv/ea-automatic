import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClicksignSyncService } from "./clicksign-sync.service";

// recomputeFarolGlobal toca o banco — fora do escopo deste ciclo; isola para o caminho ASSINADO.
vi.mock("../admissoes/farol", () => ({
  recomputeFarolGlobal: vi.fn().mockResolvedValue(undefined),
}));

const S3_URL = "https://s3.sa-east-1.amazonaws.com/clicksign/contrato.pdf?X-Amz-Expires=300";
const DRIVE_URL = "https://drive.google.com/drive/folders/PASTA_PRONTUARIO";

/** Builder thenable que ignora a query e resolve um resultado fixo (db.select sem Postgres real). */
function selectChain<T>(result: T) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "groupBy"]) {
    b[m] = () => b;
  }
  b.then = (res: (v: T) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return b;
}

interface AdmRow {
  id: string;
  codCliente: string;
  tipoContrato: string | null;
  clicksignEnvelopeId: string;
  candidatoNome: string;
  candidatoCpf: string;
  candidatoEmail: string;
  clienteOperacao: string;
}

function montar(opts: { selectResults: unknown[]; status?: string; url?: string }) {
  const consultarStatus = vi
    .fn()
    .mockResolvedValue(opts.status ? { status: opts.status } : undefined);
  const obterUrlAssinado = vi.fn().mockResolvedValue(opts.url);
  const api = { estaAtivo: () => true, consultarStatus, obterUrlAssinado };

  const setCalls: Record<string, unknown>[] = [];
  const update = vi.fn().mockImplementation(() => ({
    set: (v: Record<string, unknown>) => {
      setCalls.push(v);
      return { where: () => Promise.resolve(undefined) };
    },
  }));

  let selI = 0;
  const select = vi.fn().mockImplementation(() => selectChain(opts.selectResults[selI++] ?? []));

  const db = { select, update, query: {} };
  const staging = {
    salvar: vi.fn().mockResolvedValue("/staging/contrato_assinado.pdf"),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    dentroDaRaiz: vi.fn(),
  };
  const ai = { arquivarDrive: vi.fn().mockResolvedValue({ pastaUrl: DRIVE_URL }) };
  const queue = { enfileirarTick: vi.fn(), enfileirarCriarEnvelope: vi.fn() };
  const kit = { gerar: vi.fn() };

  const svc = new ClicksignSyncService(
    db as never,
    {} as ConfigService,
    api as never,
    queue as never,
    staging as never,
    ai as never,
    kit as never,
  );
  const log = vi
    .spyOn((svc as unknown as { logger: { log: (m: string) => void } }).logger, "log")
    .mockImplementation(() => undefined);
  const warn = vi
    .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
    .mockImplementation(() => undefined);
  return { svc, api, consultarStatus, obterUrlAssinado, setCalls, staging, ai, log, warn };
}

function admRow(over: Partial<AdmRow> = {}): AdmRow {
  return {
    id: "adm-1",
    codCliente: "16",
    tipoContrato: "Temporário",
    clicksignEnvelopeId: "env-1",
    candidatoNome: "Maria Silva",
    candidatoCpf: "11144477735",
    candidatoEmail: "maria@e.com",
    clienteOperacao: "Loja Centro",
    ...over,
  };
}

/** Junta TODAS as strings passadas a um spy de logger, para varrer por vazamento de URL/PII. */
function logsConcat(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((c) => String(c[0])).join(" | ");
}

describe("ClicksignSyncService.processarTick — ciclo de verificação (INT-4 / §A.6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("envelope 'closed' → baixa síncrono, arquiva no Drive, marca ASSINADO + URL da PASTA do Drive", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);

    const { svc, obterUrlAssinado, setCalls, ai, log, warn } = montar({
      selectResults: [[{ id: "adm-1", envelopeId: "env-1" }], [admRow()]],
      status: "closed",
      url: S3_URL,
    });

    await svc.processarTick();

    // Download síncrono da URL S3 (expira ~5min) aconteceu...
    expect(fetchSpy).toHaveBeenCalledWith(S3_URL);
    expect(obterUrlAssinado).toHaveBeenCalledWith("env-1");
    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);

    // ...e persistiu ASSINADO com a URL da PASTA do Drive (referência), nunca o binário/URL S3.
    const persistido = setCalls.find((s) => s.clicksignStatus === "ASSINADO");
    expect(persistido).toBeDefined();
    expect(persistido?.contratoAssinadoDriveUrl).toBe(DRIVE_URL);

    // §A.6: a URL S3 de download NUNCA aparece na persistência nem em log.
    expect(JSON.stringify(setCalls)).not.toContain("X-Amz");
    expect(JSON.stringify(setCalls)).not.toContain("amazonaws");
    expect(logsConcat(log)).not.toContain("amazonaws");
    expect(logsConcat(warn)).not.toContain("amazonaws");
  });

  it("envelope 'canceled' → marca CANCELADO; NÃO baixa nem arquiva", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { svc, obterUrlAssinado, setCalls, ai } = montar({
      selectResults: [[{ id: "adm-1", envelopeId: "env-1" }]],
      status: "canceled",
    });

    await svc.processarTick();

    expect(setCalls).toEqual([expect.objectContaining({ clicksignStatus: "CANCELADO" })]);
    expect(obterUrlAssinado).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envelope 'running' → no-op (não persiste, não baixa)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { svc, obterUrlAssinado, setCalls, ai } = montar({
      selectResults: [[{ id: "adm-1", envelopeId: "env-1" }]],
      status: "running",
    });

    await svc.processarTick();

    expect(setCalls).toEqual([]);
    expect(obterUrlAssinado).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem pasta-pai do Drive (resolvePastaPaiId null) → NÃO arquiva e NÃO marca ASSINADO (próximo ciclo)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // tipoContrato "42" não tem mapeamento → resolvePastaPaiId = null.
    const { svc, obterUrlAssinado, setCalls, ai, warn } = montar({
      selectResults: [[{ id: "adm-1", envelopeId: "env-1" }], [admRow({ tipoContrato: "42" })]],
      status: "closed",
      url: S3_URL,
    });

    await svc.processarTick();

    // Sem pasta-pai: nem busca a URL, nem baixa, nem arquiva, nem persiste ASSINADO.
    expect(obterUrlAssinado).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(setCalls.find((s) => s.clicksignStatus === "ASSINADO")).toBeUndefined();
    // Logado sem PII (CPF) nem URL.
    const w = logsConcat(warn);
    expect(w).not.toContain("11144477735");
    expect(w).not.toContain("amazonaws");
  });
});
