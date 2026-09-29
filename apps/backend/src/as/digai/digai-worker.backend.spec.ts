import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

/**
 * ─ O QUE ESTE ARQUIVO EXISTE PARA FECHAR, E POR QUE ELE NASCEU SEPARADO ────────────────────────
 *
 * ┌─ O FURO: O TESTE ASSERIA A CONSTANTE, E NAO O QUE FOI CONSTRUIDO COM ELA (auditoria 29/09) ──┐
 * │ `digai-polling.backend.spec.ts` prova que `DIGAI_WORKER_OPTIONS` vale `{max:90,duration:60s}` │
 * │ com concorrencia 1. So que quem segura a vazao nao e a constante, e o WORKER QUE NASCE COM    │
 * │ ELA. Medido pelo auditor: trocar o spread de `onModuleInit` por `concurrency: 10` deixava os  │
 * │ 53 testes VERDES, porque nenhum spec asseria a construcao. O comentario prometia uma mutacao  │
 * │ que nao existia, que e o mesmo defeito que este modulo ja vetou duas vezes no texto.          │
 * │                                                                                               │
 * │ ARQUIVO SEPARADO PORQUE `vi.mock` E DE ARQUIVO INTEIRO: mockar `bullmq` e `ioredis` dentro do │
 * │ spec do polling contaminaria 53 testes que hoje injetam dubles na mao. Aqui o mock e o ponto. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de pessoa entra aqui. O que se observa e opcao de fila e contagem.
 */

/** O que o `new Worker(...)` e o `new Queue(...)` receberam, capturado pelo mock do bullmq. */
const construidos: { worker: unknown[]; queue: unknown[] } = { worker: [], queue: [] };

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(nome: string, opcoes: unknown) {
      construidos.queue.push({ nome, opcoes });
    }
    close = async () => undefined;
  },
  Worker: class {
    constructor(nome: string, _processar: unknown, opcoes: unknown) {
      construidos.worker.push({ nome, opcoes });
    }
    on = () => undefined;
    close = async () => undefined;
  },
}));

vi.mock("ioredis", () => ({
  default: class {
    on = () => undefined;
    quit = async () => undefined;
  },
}));

import { DigaiFilaService } from "./digai-fila.service";
import { DigaiImportacaoService } from "./digai-importacao.service";
import { DigaiVarreduraService } from "./digai-varredura.service";
import { DIGAI_QUEUE, DIGAI_WORKER_OPTIONS } from "./digai.queue";

function filaDePe() {
  construidos.worker = [];
  construidos.queue = [];
  const config = { get: () => undefined } as unknown as ConfigService;
  const fila = new DigaiFilaService(
    config,
    { ativa: false } as unknown as DigaiImportacaoService,
    {} as unknown as DigaiVarreduraService,
  );
  const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  fila.onModuleInit();
  log.mockRestore();
  return fila;
}

describe("o WORKER CONSTRUIDO carrega o limiter, e nao so a constante", () => {
  it("o worker nasce com limiter 90/min e concorrencia 1, na fila do Digai", () => {
    filaDePe();

    const w = construidos.worker[0] as { nome: string; opcoes: Record<string, unknown> };
    expect(w, "o worker tem de ter sido construido no boot.").toBeTruthy();
    expect(w.nome).toBe(DIGAI_QUEUE);
    expect(
      w.opcoes.limiter,
      "quem segura a vazao contra o fornecedor e o worker DE PE, e nao a constante no arquivo. Trocar o spread por um valor solto aqui tem de ficar vermelho.",
    ).toEqual({ max: 90, duration: 60_000 });
    expect(
      w.opcoes.concurrency,
      "um job e UMA requisicao: com concorrencia > 1 a conta do limiter deixa de ser a vazao real.",
    ).toBe(1);
  });

  it("o que o worker recebe e EXATAMENTE `DIGAI_WORKER_OPTIONS`, e nao uma copia que pode divergir", () => {
    filaDePe();
    const w = construidos.worker[0] as { opcoes: Record<string, unknown> };
    for (const [chave, valor] of Object.entries(DIGAI_WORKER_OPTIONS)) {
      expect(w.opcoes[chave], `a opcao ${chave} do worker construido tem de vir da constante.`).toEqual(
        valor,
      );
    }
  });
});

// ── A TRAVA DE EMPILHAMENTO, NA IMPLEMENTACAO REAL E NAO NO DUBLE ──────────

/**
 * ─ O SEGUNDO FURO DA MESMA AUDITORIA ───────────────────────────────────────────────────────────
 *
 * `temCicloEmAndamento` nao tinha UM teste da implementacao: os dois testes que a exercitam a
 * DUBLAM com `vi.fn`, entao fazer o corpo real devolver `false` deixava tudo verde. O duble prova
 * que o SCHEDULER respeita a resposta; estes provam que a RESPOSTA e verdadeira.
 */
describe("`temCicloEmAndamento` de verdade: a trava mede a fila, e erra para o lado seguro", () => {
  function comFilaFingida(contagens: Partial<Record<"esperando" | "ativos" | "atrasados", number>> | "explode") {
    const fila = new DigaiFilaService(
      { get: () => undefined } as unknown as ConfigService,
      { ativa: false } as unknown as DigaiImportacaoService,
      {} as unknown as DigaiVarreduraService,
    );
    const contar = (n: number) => async () => {
      if (contagens === "explode") throw new Error("ECONNREFUSED 127.0.0.1:6380");
      return n;
    };
    (fila as unknown as { queue: unknown }).queue = {
      getWaitingCount: contar(contagens === "explode" ? 0 : (contagens.esperando ?? 0)),
      getActiveCount: contar(contagens === "explode" ? 0 : (contagens.ativos ?? 0)),
      getDelayedCount: contar(contagens === "explode" ? 0 : (contagens.atrasados ?? 0)),
    };
    return fila;
  }

  it("fila VAZIA: nao ha ciclo em andamento, e o proximo tick PODE sair", async () => {
    await expect(comFilaFingida({}).temCicloEmAndamento()).resolves.toBe(false);
  });

  for (const estado of ["esperando", "ativos", "atrasados"] as const) {
    it(`UM job em '${estado}' ja e ciclo em andamento`, async () => {
      await expect(comFilaFingida({ [estado]: 1 }).temCicloEmAndamento()).resolves.toBe(true);
    });
  }

  it("as TRES contagens somam: nenhuma delas pode ser esquecida", async () => {
    // `delayed` e o estado do backoff. Deixa-lo de fora faria o retry virar ciclo novo por cima.
    await expect(
      comFilaFingida({ esperando: 0, ativos: 0, atrasados: 3 }).temCicloEmAndamento(),
    ).resolves.toBe(true);
  });

  it("REDIS FORA: `true`, que e o lado seguro, e com linha de log", async () => {
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const r = await comFilaFingida("explode").temCicloEmAndamento();
    aviso.mockRestore();
    expect(
      r,
      "nao enfileirar as cegas custa um ciclo de 15 min; enfileirar as cegas custa uma fila que ninguem esta drenando.",
    ).toBe(true);
    expect(avisos.join("\n")).toContain("medir a fila do Digai");
  });

  it("FILA NUNCA SUBIU: `true` tambem, pelo mesmo lado seguro", async () => {
    const fila = new DigaiFilaService(
      { get: () => undefined } as unknown as ConfigService,
      { ativa: false } as unknown as DigaiImportacaoService,
      {} as unknown as DigaiVarreduraService,
    );
    await expect(fila.temCicloEmAndamento()).resolves.toBe(true);
  });
});
