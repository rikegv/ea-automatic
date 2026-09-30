import { describe, expect, it, vi } from "vitest";
import { FilasDiagnosticoService } from "./filas.service";

/**
 * O BUG QUE ESTE TESTE SEGURA (encontrado no incidente de 06/08/2026).
 *
 * O card "Fila (BullMQ)" do Diagnóstico consultava SÓ `pandape-sync`. Job falhado em `clicksign-sync`
 * ou em `vt-coleta-scan` deixava a tela VERDE: um envelope de assinatura falhando em loop não acendia
 * nada. Cada teste abaixo derruba uma parte dessa cegueira, e o mais importante é o segundo: falha
 * SÓ nas outras duas filas tem de aparecer.
 */

interface JobFake {
  id: string;
  name: string;
  data: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
  finishedOn?: number;
}

function filaFake(contagem: Partial<Record<string, number>>, falhados: JobFake[] = []) {
  return {
    getJobCounts: vi.fn(async () => ({
      active: contagem.active ?? 0,
      waiting: contagem.waiting ?? 0,
      failed: contagem.failed ?? falhados.length,
      delayed: contagem.delayed ?? 0,
    })),
    getFailed: vi.fn(async () => falhados),
  };
}

/**
 * Fila que devolve o MESMO job em cada checagem, com o estado percorrendo um roteiro. É assim que o
 * worker se comporta de verdade: waiting, active, e então o desfecho.
 */
function filaComRoteiro(roteiro: (string | null)[], motivo?: string) {
  let passo = 0;
  const job = {
    id: "job-1",
    name: "sync-candidate",
    data: { idPrecollaborator: "421114" },
    failedReason: "",
    retry: vi.fn(async () => {
      job.failedReason = "";
    }),
    getState: vi.fn(async () => roteiro[Math.min(passo, roteiro.length - 1)] ?? "waiting"),
  };
  return {
    ...filaFake({}),
    getJob: vi.fn(async () => {
      const estado = roteiro[Math.min(passo, roteiro.length - 1)];
      passo += 1;
      if (estado === null) return undefined;
      if (estado === "failed" && motivo) job.failedReason = motivo;
      return job;
    }),
  };
}

/** Teto e cadência curtos: a suite prova a REGRA, não a paciência de 25 segundos. */
const RAPIDO = { tetoMs: 120, intervaloMs: 10 };

function servico(opts: {
  pandape?: ReturnType<typeof filaFake> | undefined;
  clicksign?: ReturnType<typeof filaFake> | undefined;
  vt?: ReturnType<typeof filaFake> | undefined;
}) {
  return new FilasDiagnosticoService(
    { filaBull: () => opts.pandape } as never,
    { filaBull: () => opts.clicksign } as never,
    { filaBull: () => opts.vt } as never,
  );
}

const AGORA = Date.now();

describe("FilasDiagnosticoService", () => {
  it("SOMA a contagem das TRÊS filas, não só a do Pandapé", async () => {
    const r = await servico({
      pandape: filaFake({ active: 1, waiting: 2, failed: 0, delayed: 0 }),
      clicksign: filaFake({ active: 0, waiting: 1, failed: 0, delayed: 3 }),
      vt: filaFake({ active: 2, waiting: 0, failed: 0, delayed: 0 }),
    }).estado();

    expect(r.contagem).toEqual({ ativos: 3, aguardando: 3, falhados: 0, atrasados: 3 });
    expect(r.disponivel).toBe(true);
  });

  it("ENXERGA job falhado que está SÓ na fila da assinatura (o bug)", async () => {
    const r = await servico({
      pandape: filaFake({ failed: 0 }),
      clicksign: filaFake({}, [
        {
          id: "42",
          name: "criar-envelope",
          data: { admissaoId: "640f7bc6-9f3f-49e8-bcaa-883fdcec331f" },
          failedReason: "Clicksign respondeu HTTP 422",
          attemptsMade: 3,
          finishedOn: AGORA - 2 * 3_600_000,
        },
      ]),
      vt: filaFake({ failed: 0 }),
    }).estado();

    expect(r.contagem.falhados).toBe(1);
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0]).toMatchObject({
      fila: "clicksign-sync",
      jobId: "42",
      motivo: "Clicksign respondeu HTTP 422",
      tentativas: 3,
      horas: 2,
    });
    // O alvo tem de ser legível, não o JSON cru do job.
    expect(r.jobs[0].alvo).toBe("Admissão 640f7bc6");
  });

  it("ENXERGA job falhado que está SÓ na fila da coleta de VT", async () => {
    const r = await servico({
      pandape: filaFake({ failed: 0 }),
      clicksign: filaFake({ failed: 0 }),
      vt: filaFake({}, [
        {
          id: "scan-tick-1",
          name: "scan-tick",
          data: {},
          failedReason: "bucket inacessível",
          attemptsMade: 5,
          finishedOn: AGORA - 3_600_000,
        },
      ]),
    }).estado();

    expect(r.contagem.falhados).toBe(1);
    expect(r.jobs[0].fila).toBe("vt-coleta-scan");
    expect(r.jobs[0].alvo).toBe("Ciclo de varredura da coleta de VT");
  });

  it("descreve o alvo do Pandapé pelo id do pré-colaborador, sem PII", async () => {
    const r = await servico({
      pandape: filaFake({}, [
        {
          id: "cand-406998",
          name: "sync-candidate",
          data: { idPrecollaborator: "406998" },
          failedReason: "CPF inválido",
          attemptsMade: 5,
          finishedOn: AGORA - 16 * 3_600_000,
        },
      ]),
      clicksign: filaFake({ failed: 0 }),
      vt: filaFake({ failed: 0 }),
    }).estado();

    expect(r.jobs[0].alvo).toBe("Candidato do Pandapé 406998");
    expect(r.jobs[0].motivo).toBe("CPF inválido");
    expect(r.jobs[0].horas).toBe(16);
    expect(JSON.stringify(r)).not.toMatch(/\d{11}/); // nenhum CPF vaza no payload da tela
  });

  it("ordena do mais recente para o mais antigo, para o problema de agora vir primeiro", async () => {
    const r = await servico({
      pandape: filaFake({}, [
        { id: "velho", name: "sync-candidate", data: {}, failedReason: "x", attemptsMade: 1, finishedOn: AGORA - 90_000_000 },
      ]),
      clicksign: filaFake({}, [
        { id: "novo", name: "criar-envelope", data: {}, failedReason: "y", attemptsMade: 1, finishedOn: AGORA - 1_000 },
      ]),
      vt: filaFake({ failed: 0 }),
    }).estado();

    expect(r.jobs.map((j) => j.jobId)).toEqual(["novo", "velho"]);
  });

  it("fila que não subiu vira RESSALVA, não silêncio", async () => {
    const r = await servico({
      pandape: filaFake({ failed: 0 }),
      clicksign: undefined, // não subiu (Redis fora quando o módulo iniciou)
      vt: filaFake({ failed: 0 }),
    }).estado();

    expect(r.disponivel).toBe(true);
    expect(r.indisponiveis).toEqual(["clicksign-sync"]);
  });

  it("nenhuma fila no ar: indisponível de verdade", async () => {
    const r = await servico({}).estado();
    expect(r.disponivel).toBe(false);
    expect(r.indisponiveis).toHaveLength(3);
  });
});

/**
 * O TETO DA LISTA (OST 30/09/2026). Era 50, e com 132 falhados medidos na produção 82 deles nunca
 * chegavam à tela: busca por nome que varre meia fila responde "não encontrado" para quem está ali.
 * O que estes testes seguram é o ALCANCE da mudança: `estado()` tem DOIS consumidores, e o snapshot
 * do card (que só usa a contagem) não pode passar a ler centenas de hashes do Redis para descartar.
 */
describe("FilasDiagnosticoService: o teto da lista de falhados", () => {
  it("o DRAWER pede a fila inteira: 500 por fila, folga sobre as 132 medidas", async () => {
    const pandape = filaFake({ failed: 132 });
    await servico({ pandape }).estado(FilasDiagnosticoService.LIMITE_LISTA);
    expect(pandape.getFailed).toHaveBeenCalledWith(0, 499);
    expect(FilasDiagnosticoService.LIMITE_LISTA).toBe(500);
  });

  it("o PADRÃO continua 50: nenhum chamador existente muda de comportamento por omissão (§A.26)", async () => {
    const pandape = filaFake({ failed: 132 });
    await servico({ pandape }).estado();
    expect(pandape.getFailed).toHaveBeenCalledWith(0, 49);
  });

  it("o SNAPSHOT pede ZERO e NEM CHAMA o getFailed, mas continua contando", async () => {
    const pandape = filaFake({ active: 1, failed: 132 });
    const r = await servico({ pandape }).estado(FilasDiagnosticoService.LIMITE_SNAPSHOT);

    expect(pandape.getFailed).not.toHaveBeenCalled();
    expect(r.contagem.falhados).toBe(132);
    expect(r.contagem.ativos).toBe(1);
    expect(r.jobs).toEqual([]);
    expect(r.disponivel).toBe(true);
  });

  /**
   * O OFF-BY-ONE QUE LERIA A FILA INTEIRA EM SILÊNCIO: no BullMQ, `getFailed(0, -1)` significa ATÉ O
   * FIM, e o `removeOnFail: 5000` retém até 5.000 falhados. Zero (ou negativo) NÃO pode virar -1.
   */
  it("limite 0 ou negativo NÃO vira getFailed(0, -1): não lista NADA", async () => {
    for (const limite of [0, -1, -999, Number.NaN]) {
      const pandape = filaFake({ failed: 5_000 });
      const r = await servico({ pandape }).estado(limite);
      expect(pandape.getFailed, `limite ${limite}`).not.toHaveBeenCalled();
      expect(r.jobs).toEqual([]);
    }
  });

  it("o 500 é ABSOLUTO: chamador pedindo mais não arranca a fila inteira do Redis", async () => {
    const pandape = filaFake({ failed: 5_000 });
    await servico({ pandape }).estado(5_000);
    expect(pandape.getFailed).toHaveBeenCalledWith(0, 499);
  });
});

/**
 * Os ALVOS do Pandapé (jobId + idPrecollaborator) que alimentam a busca por nome. O par sai daqui e
 * para no resolvedor: o id externo NUNCA entra no `JobFalhado` nem na resposta HTTP (§A.6).
 */
describe("FilasDiagnosticoService.alvosPandapeFalhados", () => {
  it("devolve o par (jobId, idPrecollaborator) só de quem tem id externo", async () => {
    const alvos = await servico({
      pandape: filaFake({}, [
        { id: "1", name: "sync-candidate", data: { idPrecollaborator: "421114" }, failedReason: "CPF inválido", attemptsMade: 6 },
        { id: "2", name: "pull-docs", data: { admissaoId: "640f7bc6-9f3f-49e8-bcaa-883fdcec331f", idPrecollaborator: "421115" }, failedReason: "x", attemptsMade: 1 },
        { id: "3", name: "scheduler-tick", data: {}, failedReason: "y", attemptsMade: 1 },
      ]),
    }).alvosPandapeFalhados();

    expect(alvos).toEqual([
      { jobId: "1", idPrecollaborator: "421114" },
      { jobId: "2", idPrecollaborator: "421115" },
    ]);
  });

  it("fila fora do ar não derruba a busca: lista vazia", async () => {
    expect(await servico({}).alvosPandapeFalhados()).toEqual([]);
  });
});

describe("FilasDiagnosticoService.reprocessarJob", () => {
  /**
   * O DEFEITO QUE ESTES TESTES SEGURAM (caso Zelda, 05/09/2026). O método devolvia
   * `{reenfileirado: true}` no instante do clique. Como a tela lista SÓ falhados, e o `retry()` acabara
   * de tirar o job de "falhado", a lista recarregada ficava vazia e PARECIA sucesso. Onze segundos
   * depois o job falhava de novo e ninguém via. Voltar para a fila NÃO é sucesso.
   */
  it("PUXOU: o job completou, e o desfecho diz CONCLUIDO", async () => {
    const r = await servico({
      pandape: filaComRoteiro(["waiting", "active", "completed"]) as never,
    }).reprocessarJob("pandape-sync", "job-1", RAPIDO);
    expect(r.desfecho).toBe("CONCLUIDO");
    expect(r.motivo).toBeUndefined();
  });

  it("PUXOU: job removido pelo removeOnComplete também é CONCLUIDO, não erro", async () => {
    const r = await servico({
      pandape: filaComRoteiro(["waiting", null]) as never,
    }).reprocessarJob("pandape-sync", "job-1", RAPIDO);
    expect(r.desfecho).toBe("CONCLUIDO");
  });

  it("NÃO PUXOU: falhou de novo, e o motivo REAL volta para a tela", async () => {
    const r = await servico({
      pandape: filaComRoteiro(["waiting", "active", "failed"], "CPF inválido") as never,
    }).reprocessarJob("pandape-sync", "job-1", RAPIDO);
    expect(r.desfecho).toBe("FALHOU");
    expect(r.motivo).toBe("CPF inválido");
  });

  it("EM PROCESSAMENTO: estourou o teto ainda rodando, e NÃO finge sucesso", async () => {
    const r = await servico({
      pandape: filaComRoteiro(["active"]) as never,
    }).reprocessarJob("pandape-sync", "job-1", RAPIDO);
    expect(r.desfecho).toBe("EM_PROCESSAMENTO");
    expect(r.motivo).toBeUndefined();
  });

  it("NÃO lê como falha nova o eco da falha antiga (failed sem motivo segue esperando)", async () => {
    const r = await servico({
      pandape: filaComRoteiro(["failed", "active", "completed"]) as never,
    }).reprocessarJob("pandape-sync", "job-1", RAPIDO);
    expect(r.desfecho).toBe("CONCLUIDO");
  });

  /** §A.26: o método é UM só para as três filas. Quebrar uma quebraria as três. */
  it("vale para as TRÊS filas, porque o método é compartilhado", async () => {
    const clicksign = await servico({
      clicksign: filaComRoteiro(["active", "failed"], "429 Too Many Requests") as never,
    }).reprocessarJob("clicksign-sync", "job-1", RAPIDO);
    expect(clicksign.desfecho).toBe("FALHOU");

    const vt = await servico({
      vt: filaComRoteiro(["active", "completed"]) as never,
    }).reprocessarJob("vt-coleta-scan", "job-1", RAPIDO);
    expect(vt.desfecho).toBe("CONCLUIDO");
  });
});
