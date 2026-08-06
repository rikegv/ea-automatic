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
