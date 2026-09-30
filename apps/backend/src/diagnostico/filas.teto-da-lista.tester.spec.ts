import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FilasDiagnosticoService } from "./filas.service";
import { DiagnosticoController } from "./diagnostico.controller";
import { DiagnosticoService } from "./diagnostico.service";

/**
 * ─ O TETO DA LISTA DE FALHADOS, E OS DOIS CONSUMIDORES DE `estado()` (OST 30/09/2026) ───────────
 *
 * Cobertura INDEPENDENTE (§A.38): escrita a partir do REQUISITO, por quem não escreveu o código.
 *
 * ┌─ O REQUISITO ────────────────────────────────────────────────────────────────────────────────┐
 * │ A busca por nome do drawer só serve se a lista TIVER a fila inteira. O teto era `getFailed(0,  │
 * │ 49)`, e em produção havia 132 falhados na `pandape-sync` no dia do pedido: 82 candidatos eram  │
 * │ invisíveis, e nenhuma busca os acharia, porque nunca chegaram ao navegador.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE TESTE MEDE PELOS CONSUMIDORES, E NÃO POR `estado()` DIRETO ─────────────────────┐
 * │ `estado()` tem DOIS consumidores com necessidades OPOSTAS, e o alcance é esse:                  │
 * │   · o DRAWER (`GET /diagnostico/filas`) quer a lista inteira, senão a busca mente;              │
 * │   · o SNAPSHOT da tela (`DiagnosticoService.dependencias()`) usa SÓ a contagem, e ler centenas  │
 * │     de hashes do Redis a cada abertura do Diagnóstico para descartar todos é gasto puro.        │
 * │ Medir `estado()` no vazio deixaria a otimização se desfazer em silêncio: bastaria alguém trocar │
 * │ o argumento no chamador, sem tocar no serviço, e nenhum teste falharia. Então o teste chama o   │
 * │ HANDLER real do drawer e o `dependencias()` real do snapshot, sobre a MESMA fila falsa, e mede  │
 * │ quantos hashes cada caminho pediu ao Redis.                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NADA AQUI DEPENDE DO NOME que o autor deu ao parâmetro, à constante ou ao método: a rota é achada
 * pelo metadado (caminho + verbo) e os campos são lidos da assinatura do construtor. O que está
 * travado é o COMPORTAMENTO combinado.
 */

const RAIZ = __dirname;
const GET = 0; // RequestMethod.GET

/** O nome do campo que guarda um tipo injetado, lido da assinatura do construtor. */
function campoDoTipo(arquivo: string, tipo: string): string {
  const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
  const m = new RegExp(`(?:private|public|protected)\\s+readonly\\s+(\\w+)\\s*:\\s*${tipo}\\b`).exec(
    fonte,
  );
  if (!m) throw new Error(`Não achei o campo de tipo ${tipo} em ${arquivo}.`);
  return m[1];
}

/** Handler achado pela ROTA declarada, não pelo nome do método (o nome é escolha do autor). */
function handlerDaRota(caminho: string, verbo: number): (...args: never[]) => unknown {
  const proto = DiagnosticoController.prototype as unknown as Record<string, unknown>;
  const nome = Object.getOwnPropertyNames(proto).find((k) => {
    const fn = proto[k];
    return (
      typeof fn === "function" &&
      Reflect.getMetadata("path", fn) === caminho &&
      Reflect.getMetadata("method", fn) === verbo
    );
  });
  if (!nome) throw new Error(`Rota ${verbo === GET ? "GET" : "POST"} ${caminho} não existe.`);
  return proto[nome] as (...args: never[]) => unknown;
}

interface JobFake {
  id: string;
  name: string;
  data: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
  finishedOn: number;
}

/**
 * Fila falsa que HONRA a faixa do `getFailed(start, end)`, como o BullMQ faz (o `end` é inclusivo).
 * Honrar a faixa é o ponto: é assim que o teste mede quantos hashes o caminho pediu de verdade, em
 * vez de acreditar no argumento.
 */
function filaFake(total: number) {
  const jobs: JobFake[] = Array.from({ length: total }, (_, i) => ({
    id: `job-${i}`,
    name: "sync-candidate",
    data: { idPrecollaborator: String(400000 + i) },
    failedReason: "CPF ausente no Pandapé",
    attemptsMade: 5,
    finishedOn: Date.now() - (i + 1) * 60_000,
  }));
  let lidos = 0;
  const getFailed = vi.fn(async (inicio = 0, fim = -1) => {
    const fatia = jobs.slice(inicio, fim < 0 ? undefined : fim + 1);
    lidos += fatia.length;
    return fatia;
  });
  return {
    getJobCounts: vi.fn(async () => ({ active: 0, waiting: 0, failed: total, delayed: 0 })),
    getFailed,
    /** Quantos hashes o Redis teria devolvido neste caminho. Zero = nem chamou. */
    lidos: () => lidos,
    chamadas: () => getFailed.mock.calls.length,
  };
}

function servicoDeFilas(pandape: ReturnType<typeof filaFake>) {
  const vazia = filaFake(0);
  return new FilasDiagnosticoService(
    { filaBull: () => pandape } as never,
    { filaBull: () => vazia } as never,
    { filaBull: () => vazia } as never,
  );
}

/** O CAMINHO DO DRAWER: o handler real de `GET /diagnostico/filas`, com o serviço real por baixo. */
async function pelaRotaDoDrawer(filas: FilasDiagnosticoService) {
  const campo = campoDoTipo("diagnostico.controller.ts", "FilasDiagnosticoService");
  const handler = handlerDaRota("filas", GET);
  return (await handler.call({ [campo]: filas } as never)) as { jobs: unknown[]; contagem: { falhados: number } };
}

/**
 * O CAMINHO DO SNAPSHOT: o `dependencias()` real. Só as quatro dependências que ele consulta são
 * dubladas; a leitura da fila é a de verdade, que é o que este teste mede.
 */
async function pelaDependenciaDoSnapshot(filas: FilasDiagnosticoService) {
  const campo = (tipo: string) => campoDoTipo("diagnostico.service.ts", tipo);
  const alvo = Object.create(DiagnosticoService.prototype) as Record<string, unknown> & {
    dependencias: () => Promise<{ nome: string; estado: string; detalhe: string }[]>;
  };
  alvo[campo("Database")] = { execute: vi.fn(async () => [{ um: 1 }]) };
  alvo[campo("FilasDiagnosticoService")] = filas;
  alvo[campo("AiClientService")] = {
    readinessVertex: vi.fn(async () => ({ ok: true, detalhe: "ok" })),
    readinessDrive: vi.fn(async () => ({ ok: true, detalhe: "ok" })),
  };
  alvo[campo("PandapeApiService")] = {
    readiness: vi.fn(async () => ({ estado: "ok", detalhe: "ok" })),
  };
  return alvo.dependencias();
}

describe("teto da lista de falhados: a fila INTEIRA chega ao drawer", () => {
  it("132 falhados (o número medido na produção em 30/09) chegam TODOS, não 50", async () => {
    // Este é o defeito literal do requisito: com o teto antigo, 82 candidatos nunca chegavam à tela,
    // e por isso nenhuma busca por nome poderia achá-los.
    const fila = filaFake(132);
    const r = await pelaRotaDoDrawer(servicoDeFilas(fila));
    expect(r.jobs).toHaveLength(132);
    expect(r.contagem.falhados).toBe(132);
  });

  it("o teto novo dá folga sobre o pior caso medido (pelo menos 200)", async () => {
    // Descobre o teto pelo COMPORTAMENTO, sem depender do nome da constante: pede muito mais do que
    // qualquer teto plausível e vê onde a lista para.
    const fila = filaFake(5_000);
    const r = await pelaRotaDoDrawer(servicoDeFilas(fila));
    expect(r.jobs.length).toBeGreaterThanOrEqual(200);
  });

  it("FRONTEIRA: exatamente no teto vem tudo; um acima vem o teto e NÃO quebra", async () => {
    const teto = (await pelaRotaDoDrawer(servicoDeFilas(filaFake(5_000)))).jobs.length;

    const noTeto = await pelaRotaDoDrawer(servicoDeFilas(filaFake(teto)));
    expect(noTeto.jobs).toHaveLength(teto);

    const umAcima = await pelaRotaDoDrawer(servicoDeFilas(filaFake(teto + 1)));
    expect(umAcima.jobs).toHaveLength(teto);
    // A CONTAGEM continua dizendo a verdade mesmo quando a lista foi cortada: é ela que impede a tela
    // de afirmar que a fila tem só o que ela conseguiu listar.
    expect(umAcima.contagem.falhados).toBe(teto + 1);
  });

  it("FRONTEIRA: zero falhado não quebra e não inventa linha", async () => {
    const r = await pelaRotaDoDrawer(servicoDeFilas(filaFake(0)));
    expect(r.jobs).toEqual([]);
    expect(r.contagem.falhados).toBe(0);
  });
});

describe("ALCANCE (§A.26/§A.27): o snapshot do card NÃO paga o preço da lista grande", () => {
  it("o snapshot continua BARATO: no máximo o teto antigo de 50 hashes, com 500 na fila", async () => {
    // A trava que impede a otimização de se desfazer sem nada falhar: o card só mostra
    // "falhados 500", então ler os 500 hashes a cada abertura do Diagnóstico é gasto puro. Quem
    // trocar o argumento no chamador, sem tocar no serviço, cai aqui.
    const fila = filaFake(500);
    const deps = await pelaDependenciaDoSnapshot(servicoDeFilas(fila));

    const card = deps.find((d) => d.nome === "Fila (BullMQ)");
    expect(card?.detalhe).toContain("falhados 500");
    expect(card?.estado).toBe("degradado");
    expect(fila.lidos()).toBeLessThanOrEqual(50);
  });

  it("e o DRAWER, na mesma fila, lê tudo: os dois caminhos não são o mesmo caminho", async () => {
    const fila = filaFake(300);
    const r = await pelaRotaDoDrawer(servicoDeFilas(fila));
    expect(r.jobs).toHaveLength(300);
    expect(fila.lidos()).toBe(300);
  });

  /**
   * §A.26 EM UMA LINHA: quem pede a lista grande é o endpoint do drawer, EXPLICITAMENTE. Subir o
   * default de `estado()` para 500 mudaria o custo de TODO chamador existente por omissão, e o
   * snapshot é um deles.
   */
  it("o DEFAULT de `estado()` segue sendo 50: nenhum chamador muda de custo por omissão", async () => {
    const fila = filaFake(500);
    const r = await servicoDeFilas(fila).estado();
    expect(r.jobs).toHaveLength(50);
    expect(r.contagem.falhados).toBe(500);
  });
});

/**
 * ─ O OFF-BY-ONE QUE LÊ A FILA INTEIRA EM SILÊNCIO ───────────────────────────────────────────────
 *
 * `getFailed(0, limite - 1)` com `limite = 0` é `getFailed(0, -1)`, e no BullMQ o índice negativo
 * conta do FIM: `-1` é o último elemento, então a faixa `0..-1` devolve a LISTA INTEIRA. Com
 * `removeOnFail` de 5.000, "pedi zero" viraria "leia cinco mil hashes do Redis", e não haveria
 * sintoma nenhum além de lentidão.
 *
 * O saneamento tem de morar DENTRO do serviço, e é por isso que o teste chama `estado()` direto: no
 * chamador ele protege UM caminho e deixa o próximo chamador descobrir o buraco sozinho.
 */
describe("saneamento do limite, dentro do serviço", () => {
  it("`estado(0)` NÃO devolve a fila inteira", async () => {
    const fila = filaFake(5_000);
    const r = await servicoDeFilas(fila).estado(0);
    expect(r.jobs).toEqual([]);
    // E não pede ao Redis uma faixa que o BullMQ leria como "tudo".
    for (const chamada of fila.getFailed.mock.calls) {
      expect(chamada[1]).toBeGreaterThanOrEqual(0);
    }
    expect(fila.lidos()).toBe(0);
  });

  it("limite NEGATIVO também não abre a porteira", async () => {
    const fila = filaFake(5_000);
    const r = await servicoDeFilas(fila).estado(-10);
    expect(r.jobs).toEqual([]);
    expect(fila.lidos()).toBe(0);
  });

  it("a contagem continua verdadeira mesmo quando a lista foi pedida em zero", async () => {
    const r = await servicoDeFilas(filaFake(5_000)).estado(0);
    expect(r.contagem.falhados).toBe(5_000);
    expect(r.disponivel).toBe(true);
  });
});
