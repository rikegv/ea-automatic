import "reflect-metadata";
import type { Response } from "express";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PandapeSyncService } from "./pandape-sync.service";
import { PandapeQueueService } from "./pandape-queue.service";
import { PandapeWebhookController } from "./pandape-webhook.controller";
import { JOB_SYNC_CANDIDATE } from "./pandape.queue";
import type { PandapeApiService, PandaperPrecollaborator } from "./pandape-api.service";
import type { AdmissoesService } from "../admissoes/admissoes.service";
import type { AuditoriaService } from "../auditoria/auditoria.service";

/**
 * ─ O ADIAMENTO É RE-TENTADO, E SÓ VIRA `FALHOU` NO FIM (veto V1 a V4 da auditoria) ─────────────
 *
 * O caso que originou a frente inteira NÃO é uma exceção: é um ADIAMENTO. O Pandapé devolve o CPF
 * zerado porque o evento sai na pasta "Convite de admissão enviado", ANTES de a pessoa preencher, e
 * o dado só fica válido em DIAS. Enquanto esse caminho saía por `return` (e não por `throw`), o job
 * terminava em `completed` e o BullMQ NUNCA re-tentava: a política de 6 tentativas ao longo de 31h
 * não alcançava justamente o caminho para o qual ela foi escrita, e a linha era carimbada "perdido"
 * em dez segundos. Isso é pior que o silêncio anterior, porque MENTE.
 *
 * §A.6: nenhum dado pessoal aqui. O CPF de fixture é de FICÇÃO.
 */

const CPF_ZERADO = "00000000000";

function pc(over: Partial<PandaperPrecollaborator> = {}): PandaperPrecollaborator {
  return {
    idPreCollaborator: "PC-1",
    idMatch: "M-1",
    idVacancy: "V-1",
    etapa: "DOCUMENTACAO",
    nome: "Fulano De Tal",
    cpf: CPF_ZERADO,
    documents: [],
    ...over,
  } as PandaperPrecollaborator;
}

function makeDb() {
  return {
    query: {
      integracaoPandape: { findFirst: vi.fn().mockResolvedValue(undefined) },
      clientes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      cargos: { findFirst: vi.fn().mockResolvedValue(undefined) },
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(undefined) },
      usuarios: { findFirst: vi.fn().mockResolvedValue(undefined) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      candidatos: { findFirst: vi.fn().mockResolvedValue(undefined) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
    insert: vi.fn(() => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) })),
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
  };
}

function makeEntradas() {
  return {
    registrarRecebimento: vi.fn().mockResolvedValue(undefined),
    registrarDesfecho: vi.fn().mockResolvedValue(undefined),
    registrarTentativa: vi.fn().mockResolvedValue(undefined),
    registrarDescarteDuplicado: vi.fn().mockResolvedValue(undefined),
    registrarNaoEnfileirado: vi.fn().mockResolvedValue(undefined),
  };
}

type Entradas = ReturnType<typeof makeEntradas>;

/** Sync com o pré-colaborador SEM a ponte do Match: é o adiamento por falta de CPF na origem. */
function syncQueAdia(entradas: Entradas, admissoesOver: Record<string, unknown> = {}) {
  const api = {
    estaAtivo: vi.fn(() => true),
    listarMudancas: vi.fn().mockResolvedValue([]),
    getPrecollaborator: vi.fn().mockResolvedValue(pc({ cpf: undefined, idMatch: undefined })),
    getVacancy: vi.fn().mockResolvedValue(undefined),
    getMatch: vi.fn().mockResolvedValue(undefined),
    getFormulariosDocumentos: vi.fn().mockResolvedValue([]),
  } as unknown as PandapeApiService;
  const admissoes = {
    create: vi.fn().mockResolvedValue({ admissaoId: "adm-1" }),
    criarPreAdmissao: vi.fn().mockResolvedValue({ admissaoId: "pre-1" }),
    vivasPorCpf: vi.fn().mockResolvedValue([]),
    adotarEventoPandape: vi.fn().mockResolvedValue(undefined),
    ...admissoesOver,
  } as unknown as AdmissoesService;
  const Ctor = PandapeSyncService as unknown as new (...args: unknown[]) => PandapeSyncService;
  return new Ctor(
    makeDb(),
    { get: () => undefined } as unknown as ConfigService,
    api,
    { enfileirarCandidato: vi.fn().mockResolvedValue(true) },
    admissoes,
    { auditarConjunto: vi.fn() } as unknown as AuditoriaService,
    { estaLigado: vi.fn().mockResolvedValue(true) },
    entradas,
    undefined,
  );
}

/** O job como o BullMQ o entrega: quantas tentativas JÁ terminaram e qual é o teto. */
function job(attemptsMade: number, attempts = 6) {
  return { name: JOB_SYNC_CANDIDATE, data: { idPrecollaborator: "PC-1" }, attemptsMade, opts: { attempts } };
}

function ultimoDesfecho(entradas: Entradas): Record<string, unknown> | undefined {
  const calls = entradas.registrarDesfecho.mock.calls;
  return calls[calls.length - 1]?.[0] as Record<string, unknown> | undefined;
}

afterEach(() => vi.restoreAllMocks());

describe("adiamento no worker: ADIADO e RE-TENTA, FALHOU só no fim", () => {
  /**
   * A METADE QUE FALTAVA: não basta registrar, tem de LANÇAR. Sem a exceção o job termina em
   * `completed` e as outras cinco tentativas nunca acontecem, que é como o caso real morreu em dez
   * segundos para um dado que ficaria pronto em dias.
   */
  it("primeira passada: grava ADIADO e LANÇA (é o throw que faz o BullMQ re-agendar)", async () => {
    const entradas = makeEntradas();
    const svc = syncQueAdia(entradas) as unknown as { processarJob(j: unknown): Promise<unknown> };

    await expect(svc.processarJob(job(0))).rejects.toThrow();

    expect(ultimoDesfecho(entradas)).toMatchObject({ desfecho: "ADIADO" });
  });

  /** A mensagem lançada é lida pelo `failed` do worker, que a LOGA: só código pode sair (§A.6). */
  it("a exceção do adiamento não carrega CPF nem nome", async () => {
    const entradas = makeEntradas();
    const svc = syncQueAdia(entradas) as unknown as { processarJob(j: unknown): Promise<unknown> };

    await expect(svc.processarJob(job(0))).rejects.toThrow(/motivo=[A-Z_]+/);
    await svc.processarJob(job(0)).catch((err: Error) => {
      expect(err.message).not.toContain(CPF_ZERADO);
      expect(err.message.toUpperCase()).not.toContain("FULANO");
    });
  });

  /**
   * A PENÚLTIMA (quinta de seis) é a FRONTEIRA, e é onde um off-by-one futuro apareceria primeiro:
   * ainda há UMA tentativa pela frente, então ainda é ADIADO. Trocar `<` por `<=` na conta do
   * esgotamento não muda nem o caso 0 nem o caso 5, e mudaria este.
   */
  it("penúltima tentativa: ainda é ADIADO (ainda há uma pela frente)", async () => {
    const entradas = makeEntradas();
    const svc = syncQueAdia(entradas) as unknown as { processarJob(j: unknown): Promise<unknown> };

    await expect(svc.processarJob(job(4))).rejects.toThrow();

    expect(ultimoDesfecho(entradas)).toMatchObject({ desfecho: "ADIADO" });
  });

  /** Esgotou (sexta de seis): AÍ é FALHOU, e não lança mais, porque não há o que re-agendar. */
  it("última tentativa: grava FALHOU e NÃO lança", async () => {
    const entradas = makeEntradas();
    const svc = syncQueAdia(entradas) as unknown as { processarJob(j: unknown): Promise<unknown> };

    await expect(svc.processarJob(job(5))).resolves.toBeUndefined();

    expect(ultimoDesfecho(entradas)).toMatchObject({ desfecho: "FALHOU" });
  });

  /**
   * EXCEÇÃO no meio do caminho segue a MESMA régua: intermediária é ADIADO (a linha continua
   * pendente, mas não mente dizendo "perdido"), e o erro sobe do mesmo jeito.
   */
  it("exceção em tentativa intermediária: ADIADO, e relança", async () => {
    const entradas = makeEntradas();
    const svc = syncQueAdia(entradas, {
      criarPreAdmissao: vi.fn().mockRejectedValue(new Error("CPF inválido")),
    }) as unknown as { processarJob(j: unknown): Promise<unknown> };

    await expect(svc.processarJob(job(0))).rejects.toThrow();
    expect(ultimoDesfecho(entradas)).toMatchObject({ desfecho: "ADIADO" });
  });

  /**
   * CHAMADA SEM JOB é a última por definição: ninguém vai re-executar nada sozinho, e deixar a
   * linha em ADIADO seria esperar por uma tentativa que nunca vem.
   */
  it("chamada direta (sem job): FALHOU, porque não existe re-tentativa programada", async () => {
    const entradas = makeEntradas();
    const svc = syncQueAdia(entradas);

    await expect(svc.processarCandidato("PC-1")).resolves.toMatchObject({ desfecho: "FALHOU" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Os dois valores que o código NÃO escrevia (veto V3) e o descarte que apagava motivo (veto V4)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

function fakeRes(): Response & { statusCode: number } {
  const res = {
    statusCode: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number };
}

describe("NAO_ENFILEIRADO: a linha diz que nenhum job chegou a existir", () => {
  it("fila fora: 503 e desfecho NAO_ENFILEIRADO gravado", async () => {
    const entradas = makeEntradas();
    const Ctor = PandapeWebhookController as unknown as new (
      ...args: unknown[]
    ) => PandapeWebhookController;
    const ctrl = new Ctor({ enfileirarCandidato: vi.fn().mockResolvedValue(false) }, entradas);
    const res = fakeRes();

    await ctrl.receber({ IdPreCollaborator: "423673" }, res);

    expect(res.statusCode).toBe(503);
    // CAMINHO GUARDADO (RES-1): o desfecho fraco não pode atravessar o `registrarDesfecho`, que
    // apagaria o motivo de uma linha pendente e incrementaria `tentativas` sem tentativa nenhuma.
    expect(entradas.registrarNaoEnfileirado).toHaveBeenCalledWith("423673");
    expect(entradas.registrarDesfecho).not.toHaveBeenCalled();
  });
});

describe("descarte por jobId ocupado: registra sem apagar o que a linha já sabia", () => {
  function servicoComQueueFake(add: ReturnType<typeof vi.fn>, entradas: Entradas) {
    const Ctor = PandapeQueueService as unknown as new (...args: unknown[]) => PandapeQueueService;
    const svc = new Ctor({ get: () => undefined }, entradas);
    (svc as unknown as { queue: { add: typeof add } }).queue = { add };
    return svc;
  }

  /**
   * O jobId fica ocupado por HORAS agora (a re-tentativa é espaçada), então este caminho passa a
   * acontecer MUITO. Se ele usasse o `registrarDesfecho`, uma linha pendente com
   * `SEM_CPF_NA_ORIGEM` viraria "Duplicado" e a coluna Motivo pararia de dizer o que resolver.
   */
  it("usa o caminho que NÃO sobrescreve motivo nem incrementa tentativas", async () => {
    const entradas = makeEntradas();
    const add = vi.fn().mockResolvedValue({ id: "cand-1", timestamp: Date.now() - 3 * 60 * 60_000 });

    await servicoComQueueFake(add, entradas).enfileirarCandidato("423673");

    expect(entradas.registrarDescarteDuplicado).toHaveBeenCalledWith("423673");
    expect(entradas.registrarDesfecho).not.toHaveBeenCalled();
  });

  it("job recém-criado NÃO é tratado como descarte", async () => {
    const entradas = makeEntradas();
    const add = vi.fn().mockResolvedValue({ id: "cand-1", timestamp: Date.now() });

    await servicoComQueueFake(add, entradas).enfileirarCandidato("423673");

    expect(entradas.registrarDescarteDuplicado).not.toHaveBeenCalled();
  });
});
