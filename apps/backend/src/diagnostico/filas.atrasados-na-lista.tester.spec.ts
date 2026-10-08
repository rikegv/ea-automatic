import { describe, expect, it, vi } from "vitest";
import { FilasDiagnosticoService } from "./filas.service";

/**
 * COBERTURA INDEPENDENTE (§A.38): escrita a partir do REQUISITO, por quem NÃO escreveu o código.
 *
 * ┌─ O REQUISITO ─────────────────────────────────────────────────────────────────────────────────┐
 * │ O card "Fila (BullMQ)" listava SÓ os jobs `failed`. Agora inclui também os `delayed`, para que   │
 * │ um job em RE-TENTATIVA (ex.: "CPF inválido" que vai tentar de novo) apareça na lista, seja        │
 * │ pesquisável pela busca por nome e possa ser reprocessado. Um job atrasado é um problema vivo que  │
 * │ a tela escondia: ele não está "falhado" neste instante, mas está preso num ciclo de falha.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CONTRATO ASSUMIDO (a partir do BullMQ e do serviço existente, reconciliar com o backend):
 *   · a lista de atrasados vem de `Queue.getDelayed(start, end)`, com a MESMA faixa do `getFailed`;
 *   · o job atrasado vira uma linha `JobFalhado` com `motivo` = `failedReason` e `tentativas` =
 *     `attemptsMade`, igual ao falhado (o requisito diz isso explicitamente);
 *   · `reprocessarJob` decide pelo ESTADO do job (`job.getState()`): atrasado usa `promote()`,
 *     falhado usa `retry()`. O acompanhamento do desfecho é o MESMO laço para os dois.
 *
 * §A.6: fixtures usam ids de SISTEMA (idPrecollaborator do Pandapé, 6 dígitos) e UUID de admissão.
 * Nenhum CPF (11 dígitos) entra em fixture nem em assert.
 */

interface JobFake {
  id: string;
  name: string;
  data: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
  finishedOn?: number;
}

/**
 * Fila falsa que separa `getFailed` de `getDelayed`, como o BullMQ faz. O card agora soma os dois,
 * então o fake precisa entregar os dois.
 */
function filaFake(
  contagem: Partial<Record<string, number>>,
  opts: { falhados?: JobFake[]; atrasados?: JobFake[] } = {},
) {
  const falhados = opts.falhados ?? [];
  const atrasados = opts.atrasados ?? [];
  return {
    getJobCounts: vi.fn(async () => ({
      active: contagem.active ?? 0,
      waiting: contagem.waiting ?? 0,
      failed: contagem.failed ?? falhados.length,
      delayed: contagem.delayed ?? atrasados.length,
    })),
    getFailed: vi.fn(async () => falhados),
    getDelayed: vi.fn(async () => atrasados),
  };
}

/**
 * Fila para o reprocesso: devolve o MESMO job em cada checagem, com o estado percorrendo um roteiro.
 * O PRIMEIRO estado é o do momento da decisão (atrasado ou falhado); os seguintes são o que o laço
 * observa depois de `promote()`/`retry()`. `promote` e `retry` são espiões para provar qual foi
 * chamado.
 */
function filaReprocesso(inicial: string, depois: string[], motivoNaFalhaNova?: string) {
  const sequencia = [inicial, ...depois];
  let i = 0;
  const job = {
    id: "job-1",
    name: "sync-candidate",
    data: { idPrecollaborator: "421114" },
    failedReason: "",
    promote: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    getState: vi.fn(async () => {
      const estado = sequencia[Math.min(i, sequencia.length - 1)];
      i += 1;
      // O laço só lê "failed" como falha NOVA quando há failedReason; é assim que o retry/promote
      // real limpa o motivo antigo e só a falha seguinte o reescreve.
      if (estado === "failed" && motivoNaFalhaNova) job.failedReason = motivoNaFalhaNova;
      return estado;
    }),
  };
  return {
    ...filaFake({}),
    getJob: vi.fn(async () => job),
    jobEspiao: job,
  };
}

/** Teto e cadência curtos: a suite prova a REGRA, não a paciência de 25 segundos. */
const RAPIDO = { tetoMs: 120, intervaloMs: 10 };

function servico(opts: {
  pandape?: ReturnType<typeof filaFake> | ReturnType<typeof filaReprocesso> | undefined;
  clicksign?: ReturnType<typeof filaFake> | ReturnType<typeof filaReprocesso> | undefined;
  vt?: ReturnType<typeof filaFake> | ReturnType<typeof filaReprocesso> | undefined;
}) {
  return new FilasDiagnosticoService(
    { filaBull: () => opts.pandape } as never,
    { filaBull: () => opts.clicksign } as never,
    { filaBull: () => opts.vt } as never,
  );
}

const AGORA = Date.now();

describe("FilasDiagnosticoService: os atrasados entram na lista (re-tentativa)", () => {
  it("`estado()` lista o job DELAYED junto do FAILED, com motivo e tentativas do próprio job", async () => {
    const r = await servico({
      pandape: filaFake(
        {},
        {
          falhados: [
            {
              id: "falhado-1",
              name: "sync-candidate",
              data: { idPrecollaborator: "406998" },
              failedReason: "CPF ausente no Pandapé",
              attemptsMade: 5,
              finishedOn: AGORA - 3_600_000,
            },
          ],
          atrasados: [
            {
              id: "atrasado-1",
              name: "sync-candidate",
              data: { idPrecollaborator: "421114" },
              failedReason: "CPF inválido",
              attemptsMade: 2,
              finishedOn: AGORA - 600_000,
            },
          ],
        },
      ),
      clicksign: filaFake({ failed: 0 }),
      vt: filaFake({ failed: 0 }),
    }).estado();

    // Os DOIS aparecem na mesma lista acionável.
    expect(r.jobs).toHaveLength(2);
    const atrasado = r.jobs.find((j) => j.jobId === "atrasado-1");
    expect(atrasado, "o job DELAYED tem de aparecer na lista, não só o FAILED").toBeDefined();
    // O requisito: motivo vem do failedReason do atrasado, tentativas do attemptsMade.
    expect(atrasado?.motivo).toBe("CPF inválido");
    expect(atrasado?.tentativas).toBe(2);
    expect(atrasado?.alvo).toBe("Candidato do Pandapé 421114");
    // O failed continua lá, comportamento preservado.
    expect(r.jobs.find((j) => j.jobId === "falhado-1")?.motivo).toBe("CPF ausente no Pandapé");
    // Nenhum CPF vaza no payload da tela (§A.6).
    expect(JSON.stringify(r)).not.toMatch(/\d{11}/);
  });

  it("a CONTAGEM soma falhados e atrasados das três filas (o card precisa ver o atrasado)", async () => {
    const r = await servico({
      pandape: filaFake({ failed: 3, delayed: 4 }),
      clicksign: filaFake({ failed: 1, delayed: 2 }),
      vt: filaFake({ failed: 0, delayed: 1 }),
    }).estado(0); // snapshot: só contagem

    expect(r.contagem.falhados).toBe(4);
    expect(r.contagem.atrasados).toBe(7);
  });

  it("`estado(0)` NÃO lista NADA (nem failed nem delayed) e NÃO toca os hashes, mas conta tudo", async () => {
    const fila = filaFake({ failed: 132, delayed: 40 });
    const r = await servico({ pandape: fila }).estado(0);

    // O snapshot do card não pode passar a ler centenas de hashes do Redis a cada abertura.
    expect(fila.getFailed, "teto 0 não chama getFailed").not.toHaveBeenCalled();
    expect(fila.getDelayed, "teto 0 não chama getDelayed").not.toHaveBeenCalled();
    expect(r.jobs).toEqual([]);
    // A contagem continua verdadeira, inclusive os atrasados.
    expect(r.contagem.falhados).toBe(132);
    expect(r.contagem.atrasados).toBe(40);
    expect(r.disponivel).toBe(true);
  });

  it("o atrasado SÓ na fila da assinatura também acende (o card olhava só o Pandapé no bug antigo)", async () => {
    const r = await servico({
      pandape: filaFake({ failed: 0, delayed: 0 }),
      clicksign: filaFake(
        {},
        {
          atrasados: [
            {
              id: "env-77",
              name: "criar-envelope",
              data: { admissaoId: "640f7bc6-9f3f-49e8-bcaa-883fdcec331f" },
              failedReason: "Clicksign respondeu HTTP 429",
              attemptsMade: 1,
              finishedOn: AGORA - 120_000,
            },
          ],
        },
      ),
      vt: filaFake({ failed: 0, delayed: 0 }),
    }).estado();

    expect(r.contagem.atrasados).toBe(1);
    const linha = r.jobs.find((j) => j.jobId === "env-77");
    expect(linha?.fila).toBe("clicksign-sync");
    expect(linha?.alvo).toBe("Admissão 640f7bc6");
    expect(linha?.motivo).toBe("Clicksign respondeu HTTP 429");
  });
});

describe("FilasDiagnosticoService.alvosPandapeFalhados: o atrasado também é pesquisável por nome", () => {
  it("inclui o idPrecollaborator de um job DELAYED, não só dos FAILED", async () => {
    const alvos = await servico({
      pandape: filaFake(
        {},
        {
          falhados: [
            {
              id: "f-1",
              name: "sync-candidate",
              data: { idPrecollaborator: "406998" },
              failedReason: "x",
              attemptsMade: 5,
            },
          ],
          atrasados: [
            {
              id: "d-1",
              name: "sync-candidate",
              data: { idPrecollaborator: "421114" },
              failedReason: "CPF inválido",
              attemptsMade: 2,
            },
          ],
        },
      ),
    }).alvosPandapeFalhados();

    // O atrasado precisa estar entre os alvos, senão a busca por nome não o acha.
    expect(alvos).toContainEqual({ jobId: "d-1", idPrecollaborator: "421114" });
    // E o falhado continua lá.
    expect(alvos).toContainEqual({ jobId: "f-1", idPrecollaborator: "406998" });
  });

  it("atrasado SEM id externo (ciclo de varredura) não entra, como no falhado", async () => {
    const alvos = await servico({
      pandape: filaFake(
        {},
        {
          atrasados: [
            { id: "tick-1", name: "scheduler-tick", data: {}, failedReason: "y", attemptsMade: 1 },
          ],
        },
      ),
    }).alvosPandapeFalhados();

    expect(alvos).toEqual([]);
  });
});

describe("FilasDiagnosticoService.reprocessarJob: atrasado PROMOVE, falhado RE-TENTA", () => {
  it("job DELAYED chama promote() e NÃO retry(), e o desfecho é acompanhado pelo mesmo laço", async () => {
    const fila = filaReprocesso("delayed", ["active", "completed"]);
    const r = await servico({ pandape: fila as never }).reprocessarJob(
      "pandape-sync",
      "job-1",
      RAPIDO,
    );

    expect(fila.jobEspiao.promote, "atrasado tem de ser PROMOVIDO").toHaveBeenCalledTimes(1);
    expect(fila.jobEspiao.retry, "atrasado NÃO pode ser re-tentado como falhado").not.toHaveBeenCalled();
    // Acompanhou pelo mesmo laço até o desfecho real.
    expect(r.desfecho).toBe("CONCLUIDO");
    expect(r.motivo).toBeUndefined();
  });

  it("job FAILED chama retry() e NÃO promote() (comportamento atual preservado)", async () => {
    const fila = filaReprocesso("failed", ["active", "completed"]);
    const r = await servico({ pandape: fila as never }).reprocessarJob(
      "pandape-sync",
      "job-1",
      RAPIDO,
    );

    expect(fila.jobEspiao.retry, "falhado continua sendo RE-TENTADO").toHaveBeenCalledTimes(1);
    expect(fila.jobEspiao.promote, "falhado NÃO é promovido").not.toHaveBeenCalled();
    expect(r.desfecho).toBe("CONCLUIDO");
  });

  it("o atrasado PROMOVIDO que falha de novo devolve o motivo REAL pelo mesmo laço", async () => {
    const fila = filaReprocesso("delayed", ["active", "failed"], "CPF inválido");
    const r = await servico({ pandape: fila as never }).reprocessarJob(
      "pandape-sync",
      "job-1",
      RAPIDO,
    );

    expect(fila.jobEspiao.promote).toHaveBeenCalledTimes(1);
    expect(r.desfecho).toBe("FALHOU");
    expect(r.motivo).toBe("CPF inválido");
  });
});
