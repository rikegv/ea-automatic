import "reflect-metadata";
import { ForbiddenException, Logger, ValidationPipe, type ExecutionContext } from "@nestjs/common";
import { validateSync } from "class-validator";
import { Reflector } from "@nestjs/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Papel } from "@ea/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { MenuAreasService } from "../auth/menu-areas.service";
import type { MenusService } from "../auth/menus.service";
import { PandapeNomeCacheService } from "../pandape/pandape-nome-cache.service";
import { DiagnosticoController } from "./diagnostico.controller";
import { DiagnosticoModule } from "./diagnostico.module";
import { FilasDiagnosticoService } from "./filas.service";
import { NomesFalhadosService } from "./nomes-falhados.service";
import * as DTOS from "./diagnostico.dto";

/**
 * ─ O LOTE DE NOMES DA FILA DEGRADADA (OST 30/09/2026) ───────────────────────────────────────────
 *
 * Cobertura INDEPENDENTE (§A.38): escrita a partir do REQUISITO e do contrato fechado, por quem não
 * escreveu o código. Teste do próprio autor pega regressão bem e mal-entendido de requisito mal.
 *
 * ┌─ O CONTRATO ─────────────────────────────────────────────────────────────────────────────────┐
 * │ `POST /diagnostico/filas/nomes`, corpo `{ jobIds: string[] }`, resposta                       │
 * │ `{ nomes: [{ jobId, nome }], restantes: number }`. A fila é fixa `pandape-sync` no servidor.   │
 * │                                                                                               │
 * │ É POST, e o cliente NÃO manda `idPrecollaborator`: o servidor deriva o id do `job.data`.       │
 * │ Aceitar o id do cliente transformaria a rota em ORÁCULO DE ENUMERAÇÃO de pré-colaborador, que  │
 * │ é o oposto do que uma tela de diagnóstico precisa poder fazer.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ARMADILHA DO CPF, CONCRETA E JÁ PRESENTE NA SUÍTE ────────────────────────────────────────┐
 * │ `getPrecollaborator` não traz CPF hoje, MAS o tipo declara `cpf?: string`                      │
 * │ (`pandape-api.service.ts`), e a própria suíte já mocka payload COM CPF dentro                  │
 * │ (`pandape-nome-cache.spec.ts`). Então a fixture daqui tem CPF no payload do Pandapé de         │
 * │ propósito: é assim que se pega o dia em que alguém trocar a montagem campo por campo por um    │
 * │ spread e o CPF sair na resposta sem ninguém notar (§A.6).                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const RAIZ = join(__dirname, "..");
const GET = 0; // RequestMethod.GET
const POST = 1; // RequestMethod.POST
const ROTA = "filas/nomes";

/** O CPF que NUNCA pode sair na resposta. Família reservada, com verificador válido. */
const CPF_DA_ARMADILHA = "00000000191";

function fonte(...partes: string[]): string {
  return readFileSync(join(RAIZ, ...partes), "utf8");
}

/**
 * A FONTE SEM COMENTÁRIO. Varredura de fonte casa comentário: este repositório documenta as regras
 * DENTRO do arquivo, então asserir "a palavra não aparece" no texto cru dá vermelho falso justamente
 * quando o autor explicou por que ela não pode aparecer. Só o CÓDIGO é medido.
 */
function codigo(...partes: string[]): string {
  return fonte(...partes)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** O nome do campo que guarda um tipo injetado, lido da assinatura do construtor. */
function campoDoTipo(arquivo: string, tipo: string): string {
  const m = new RegExp(`(?:private|public|protected)\\s+readonly\\s+(\\w+)\\s*:\\s*${tipo}\\b`).exec(
    fonte("diagnostico", arquivo),
  );
  if (!m) throw new Error(`Não achei o campo de tipo ${tipo} em ${arquivo}.`);
  return m[1];
}

function handlerDaRota(caminho: string, verbo: number): { nome: string; fn: (...a: never[]) => unknown } | undefined {
  const proto = DiagnosticoController.prototype as unknown as Record<string, unknown>;
  const nome = Object.getOwnPropertyNames(proto).find((k) => {
    const fn = proto[k];
    return (
      typeof fn === "function" &&
      Reflect.getMetadata("path", fn) === caminho &&
      Reflect.getMetadata("method", fn) === verbo
    );
  });
  if (!nome) return undefined;
  return { nome, fn: proto[nome] as (...a: never[]) => unknown };
}

function handlerDoLote(): (...a: never[]) => unknown {
  const achado = handlerDaRota(ROTA, POST);
  if (!achado) {
    const rotas = Object.getOwnPropertyNames(DiagnosticoController.prototype)
      .map((k) => {
        const fn = (DiagnosticoController.prototype as unknown as Record<string, unknown>)[k];
        return Reflect.getMetadata("path", fn as object);
      })
      .filter(Boolean);
    throw new Error(`Rota POST ${ROTA} não existe. Rotas achadas: ${rotas.join(", ")}`);
  }
  return achado.fn;
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
 * Fila falsa com N jobs falhados do Pandapé, cada um com o seu `idPrecollaborator` no `data`.
 *
 * O `jobId` é DESACOPLADO do id externo de propósito (`j1`, `j2`, ...): se o jobId carregasse o id do
 * pré-colaborador, o teste de §A.6 que prova "o id externo não volta na resposta" passaria por
 * acidente, porque o próprio jobId o conteria.
 */
function filaComFalhados(ids: string[]) {
  const jobs: JobFake[] = ids.map((id, i) => ({
    id: `j${i + 1}`,
    name: "sync-candidate",
    data: { idPrecollaborator: id },
    failedReason: "CPF ausente no Pandapé",
    attemptsMade: 5,
    finishedOn: Date.now() - (i + 1) * 60_000,
  }));
  return {
    getJobCounts: vi.fn(async () => ({ active: 0, waiting: 0, failed: jobs.length, delayed: 0 })),
    getFailed: vi.fn(async (inicio = 0, fim = -1) => jobs.slice(inicio, fim < 0 ? undefined : fim + 1)),
    // `alvosPandapeFalhados` agora soma failed + delayed. Sem atrasado aqui, mas o método tem de
    // existir, senão a leitura lança e o lote de nomes volta vazio.
    getDelayed: vi.fn(async () => [] as JobFake[]),
    getJob: vi.fn(async (jobId: string) => jobs.find((j) => j.id === jobId)),
    /** O jobId da linha que carrega este id externo, que é o que a tela manda no corpo. */
    jobDo: (id: string) => `j${ids.indexOf(id) + 1}`,
    jobIds: () => jobs.map((j) => j.id),
  };
}

/**
 * A API do Pandapé, falsa. Registra os ids consultados (é por eles que se mede a cota), conta quantas
 * chamadas ficaram SIMULTÂNEAS (é a rajada que atrasa o webhook da folha, §A.5) e devolve um payload
 * COM CPF dentro, que é a armadilha do parágrafo do cabeçalho.
 */
function apiFake(opts: { falharEm?: string[]; atrasoMs?: number } = {}) {
  let emVoo = 0;
  let pico = 0;
  const getPrecollaborator = vi.fn(async (id: string) => {
    emVoo += 1;
    pico = Math.max(pico, emVoo);
    try {
      if (opts.atrasoMs) await new Promise((r) => setTimeout(r, opts.atrasoMs));
      if (opts.falharEm?.includes(id)) throw new Error("Pandapé respondeu 500");
      return {
        idPrecollaborator: Number(id),
        idMatch: 900_000 + Number(id),
        name: NOMES[id]?.split(" ")[0] ?? "Nome",
        surname: NOMES[id]?.split(" ").slice(1).join(" ") || "Sobrenome",
        // §A.6, A ARMADILHA: o tipo declara `cpf?`, então a fixture o carrega.
        cpf: CPF_DA_ARMADILHA,
        vacancyJob: "Auxiliar de Limpeza",
        currentFolderName: "Admissão",
        admissionDate: "2026-10-05",
      };
    } finally {
      emVoo -= 1;
    }
  });
  return {
    getPrecollaborator,
    getMatch: vi.fn(async () => ({ cpf: CPF_DA_ARMADILHA })),
    idsConsultados: () => getPrecollaborator.mock.calls.map((c) => c[0] as string),
    picoSimultaneo: () => pico,
  };
}

const NOMES: Record<string, string> = {
  "406998": "José Álvaro Nogueira",
  "421114": "Maria da Silva Souza",
  "433201": "Ana Beatriz Lima",
};

/** O handler do lote, com as dependências reais que importam e o resto dublado. */
function montarLote(ids: string[], api = apiFake(), cache = new PandapeNomeCacheService()) {
  const fila = filaComFalhados(ids);
  const filas = new FilasDiagnosticoService(
    { filaBull: () => fila } as never,
    { filaBull: () => undefined } as never,
    { filaBull: () => undefined } as never,
  );
  const nomes = new NomesFalhadosService(api as never, cache);
  const ctx = Object.create(DiagnosticoController.prototype) as Record<string, unknown>;
  ctx[campoDoTipo("diagnostico.controller.ts", "FilasDiagnosticoService")] = filas;
  ctx[campoDoTipo("diagnostico.controller.ts", "NomesFalhadosService")] = nomes;
  ctx.logger = new Logger("TesteDoLote");
  const handler = handlerDoLote();
  const chamar = (corpo: unknown) =>
    handler.call(ctx as never, corpo as never, { id: "u-1", papel: "MASTER" } as never) as Promise<{
      nomes: { jobId: string; nome: string }[];
      restantes: number;
    }>;
  return { chamar, api, cache, fila, jobsDe: (...ids: string[]) => ids.map((i) => fila.jobDo(i)) };
}

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const metodo of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, metodo).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe("contrato da rota do lote", () => {
  it("é POST, e NÃO existe um GET equivalente (o GET seria o oráculo mais fácil de chamar)", () => {
    expect(handlerDaRota(ROTA, POST)).toBeTruthy();
    expect(handlerDaRota(ROTA, GET)).toBeUndefined();
  });

  it("resolve o nome dos jobs pedidos, e a resposta tem SÓ `nomes` e `restantes`", async () => {
    const { chamar, jobsDe } = montarLote(["406998", "421114"]);
    const r = await chamar({ jobIds: jobsDe("406998", "421114") });

    expect(Object.keys(r).sort()).toEqual(["nomes", "restantes"]);
    expect(r.restantes).toBe(0);
    expect(r.nomes).toHaveLength(2);
    expect(r.nomes.map((n) => n.nome).sort()).toEqual([
      "José Álvaro Nogueira",
      "Maria da Silva Souza",
    ]);
    // Cada item tem SÓ o par que a tela precisa (§A.6, minimização).
    for (const n of r.nomes) expect(Object.keys(n).sort()).toEqual(["jobId", "nome"]);
  });

  it("resolve UMA VEZ por lote: um id, uma chamada ao Pandapé", async () => {
    const { chamar, api, jobsDe } = montarLote(["406998", "421114", "433201"]);
    await chamar({ jobIds: jobsDe("406998", "421114", "433201") });
    expect(api.idsConsultados().sort()).toEqual(["406998", "421114", "433201"]);
  });

  it("resolve SÓ os jobIds pedidos, e não a fila inteira (o corpo não é decoração)", async () => {
    // Ignorar o corpo e resolver tudo o que está falhado gastaria cota resolvendo nome que a tela não
    // está mostrando, num teto compartilhado com o webhook da folha (§A.5).
    const { chamar, api, jobsDe } = montarLote(["406998", "421114", "433201"]);
    const r = await chamar({ jobIds: jobsDe("421114") });
    expect(api.idsConsultados()).toEqual(["421114"]);
    expect(r.nomes).toHaveLength(1);
  });

  it("jobId que não está na fila não vira chamada nem linha, e não derruba o lote", async () => {
    const { chamar, api, jobsDe } = montarLote(["406998"]);
    const r = await chamar({ jobIds: [...jobsDe("406998"), "job-que-nao-existe"] });
    expect(r.nomes).toHaveLength(1);
    expect(api.idsConsultados()).toEqual(["406998"]);
  });
});

/**
 * O DTO do lote, achado pelo que ele VALIDA (`jobIds`) e não pelo nome da classe: o nome é escolha do
 * autor, a regra não é.
 */
function dtoDoLote(): new () => unknown {
  for (const exportado of Object.values(DTOS)) {
    if (typeof exportado !== "function") continue;
    const vazio = Object.create(exportado.prototype);
    if (validateSync(vazio).some((e) => e.property === "jobIds")) {
      return exportado as new () => unknown;
    }
  }
  throw new Error("Nenhum DTO do diagnóstico valida `jobIds`.");
}

describe("O ORÁCULO: o cliente não escolhe o pré-colaborador", () => {
  it("corpo COM `idPrecollaborator` é RECUSADO pelo pipe (não apenas ignorado)", async () => {
    // O pipe global do `main.ts` roda com `whitelist` e `forbidNonWhitelisted`, então campo a mais é
    // 400. Este teste prova a regra CONTRA O DTO real, que é onde ela se perderia se alguém
    // acrescentasse o campo "para facilitar o debug".
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: "body" as const, metatype: dtoDoLote() };

    await expect(pipe.transform({ jobIds: ["j1"] }, metadata)).resolves.toBeTruthy();
    await expect(
      pipe.transform({ jobIds: ["j1"], idPrecollaborator: "999999" }, metadata),
    ).rejects.toThrow();
  });

  it("o DTO recusa lista vazia e tem TETO de tamanho (corpo de 100.000 jobIds não entra)", async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: "body" as const, metatype: dtoDoLote() };
    await expect(pipe.transform({ jobIds: [] }, metadata)).rejects.toThrow();
    await expect(
      pipe.transform({ jobIds: Array.from({ length: 100_000 }, (_, i) => `j${i}`) }, metadata),
    ).rejects.toThrow();
  });

  it("`idPrecollaborator` vindo do corpo é IGNORADO, não consultado", async () => {
    // Se a rota aceitasse o id, qualquer MASTER poderia varrer a base de pré-colaboradores do ATS
    // pedindo nome por nome, sem nenhum job falhado existir. O id sai do `job.data` e de mais nada.
    const { chamar, api, jobsDe } = montarLote(["406998"]);
    await chamar({ jobIds: jobsDe("406998"), idPrecollaborator: "999999", ids: ["999999"] });
    expect(api.idsConsultados()).toEqual(["406998"]);
    expect(api.idsConsultados()).not.toContain("999999");
  });

  it("nenhum DTO do diagnóstico declara `idPrecollaborator` (a porta não nasce amanhã)", () => {
    expect(codigo("diagnostico", "diagnostico.dto.ts")).not.toContain("idPrecollaborator");
  });

  it("o id externo NÃO volta na resposta", async () => {
    const { chamar, jobsDe } = montarLote(["406998"]);
    const r = await chamar({ jobIds: jobsDe("406998") });
    const bruto = JSON.stringify(r);
    expect(bruto).not.toContain("406998");
    expect(bruto).not.toContain("idPrecollaborator");
  });
});

describe("§A.6: o que NÃO pode sair daqui", () => {
  it("CPF no payload do Pandapé NÃO aparece na resposta (a armadilha do spread)", async () => {
    const { chamar, jobsDe } = montarLote(["406998", "421114"]);
    const r = await chamar({ jobIds: jobsDe("406998", "421114") });
    const bruto = JSON.stringify(r);
    expect(bruto).not.toContain(CPF_DA_ARMADILHA);
    expect(bruto).not.toMatch(/\d{11}/);
    expect(bruto.toLowerCase()).not.toContain("cpf");
  });

  it("o pré-colaborador INTEIRO não sai: nem vaga, nem etapa, nem data, nem idMatch", async () => {
    const { chamar, jobsDe } = montarLote(["406998"]);
    const bruto = JSON.stringify(await chamar({ jobIds: jobsDe("406998") }));
    for (const proibido of ["Auxiliar de Limpeza", "Admissão", "2026-10-05", "idMatch", "vacancyJob"]) {
      expect(bruto).not.toContain(proibido);
    }
  });

  it("NÃO chama `getMatch`, que é justamente a fonte de CPF do Pandapé", async () => {
    const { chamar, api, jobsDe } = montarLote(["406998"]);
    await chamar({ jobIds: jobsDe("406998") });
    expect(api.getMatch).not.toHaveBeenCalled();
  });

  it("o resolvedor não importa o leitor de estado de CPF", () => {
    // `estado-cpf-pandape.ts` existe para o painel "ver dados do alvo", que é POR LINHA e a pedido.
    // No lote ele seria uma segunda chamada por candidato e um caminho novo para o número vazar.
    expect(codigo("diagnostico", "nomes-falhados.service.ts")).not.toContain("estado-cpf-pandape");
    expect(codigo("diagnostico", "nomes-falhados.service.ts")).not.toContain("getMatch");
  });

  it("ZERO LOG com nome: o log do lote leva CONTAGEM, nunca a pessoa", async () => {
    const { chamar, jobsDe } = montarLote(["406998", "421114"]);
    await chamar({ jobIds: jobsDe("406998", "421114") });

    expect(logs.length).toBeGreaterThan(0); // o caminho fala algo, senão o teste não provaria nada
    for (const linha of logs) {
      for (const nome of Object.values(NOMES)) {
        expect(linha).not.toContain(nome);
        expect(linha).not.toContain(nome.split(" ")[0]);
      }
      expect(linha).not.toContain(CPF_DA_ARMADILHA);
    }
  });

  it("o nome não é SERIALIZADO em lugar nenhum: o cache não expõe o seu conteúdo", () => {
    // Ponto 3 da régua do `PandapeNomeCacheService` (15/09/2026): o BullMQ grava o RETORNO do job no
    // Redis, então qualquer caminho que despeje o cache vira nome persistido sem ninguém pedir.
    const cache = codigo("pandape", "pandape-nome-cache.service.ts");
    for (const vazamento of [
      "this.cache.entries()",
      "this.cache.values()",
      "[...this.cache]",
      "Object.fromEntries",
      "JSON.stringify",
    ]) {
      expect(cache).not.toContain(vazamento);
    }
    // E o serviço do lote não persiste nada: sem banco, sem Redis.
    const resolvedor = codigo("diagnostico", "nomes-falhados.service.ts");
    expect(resolvedor).not.toContain("this.db");
    expect(resolvedor).not.toContain("redis");
    expect(resolvedor).not.toContain("updateData");
    expect(resolvedor).not.toContain("updateProgress");
  });
});

describe("REUSO DO CACHE: a segunda abertura do modal custa ZERO de cota", () => {
  it("o que já está no cache não gera chamada; o que falta gera UMA e é GRAVADO", async () => {
    const cache = new PandapeNomeCacheService();
    const api = apiFake();
    const primeiro = montarLote(["406998", "421114"], api, cache);
    await primeiro.chamar({ jobIds: primeiro.jobsDe("406998", "421114") });
    expect(api.idsConsultados()).toHaveLength(2);

    // O MESMO cache, novo lote: é este o ponto inteiro do reuso.
    const segundo = montarLote(["406998", "421114"], api, cache);
    const r = await segundo.chamar({ jobIds: segundo.jobsDe("406998", "421114") });
    expect(api.idsConsultados()).toHaveLength(2); // nenhuma chamada nova
    expect(r.nomes).toHaveLength(2);
    expect(r.restantes).toBe(0);
  });

  it("nome que o WORKER já resolveu é lido do cache, sem tocar a API", async () => {
    const cache = new PandapeNomeCacheService();
    cache.guardar("406998", "José Álvaro Nogueira"); // como o `pandape-sync` faz
    const { chamar, api, jobsDe } = montarLote(["406998"], apiFake(), cache);
    const r = await chamar({ jobIds: jobsDe("406998") });
    expect(api.getPrecollaborator).not.toHaveBeenCalled();
    expect(r.nomes[0]?.nome).toBe("José Álvaro Nogueira");
  });

  it("o mesmo candidato em DUAS linhas custa UMA chamada", async () => {
    // Retentativa gera job novo com o mesmo `idPrecollaborator`: consultar duas vezes é cota jogada
    // fora num teto que é compartilhado com o webhook da folha (§A.5).
    const api = apiFake();
    const fila = filaComFalhados(["406998"]);
    // dois jobs, um id: monta na mão porque `filaComFalhados` casa id de job com id externo.
    const jobs = [
      { id: "job-a", name: "sync-candidate", data: { idPrecollaborator: "406998" }, failedReason: "x", attemptsMade: 1, finishedOn: Date.now() },
      { id: "job-b", name: "pull-docs", data: { idPrecollaborator: "406998" }, failedReason: "x", attemptsMade: 1, finishedOn: Date.now() },
    ];
    fila.getFailed.mockImplementation(async () => jobs);
    fila.getJob.mockImplementation(async (id: string) => jobs.find((j) => j.id === id));
    const filas = new FilasDiagnosticoService(
      { filaBull: () => fila } as never,
      { filaBull: () => undefined } as never,
      { filaBull: () => undefined } as never,
    );
    const ctx = Object.create(DiagnosticoController.prototype) as Record<string, unknown>;
    ctx[campoDoTipo("diagnostico.controller.ts", "FilasDiagnosticoService")] = filas;
    ctx[campoDoTipo("diagnostico.controller.ts", "NomesFalhadosService")] = new NomesFalhadosService(
      api as never,
      new PandapeNomeCacheService(),
    );
    ctx.logger = new Logger("TesteDoLote");
    const r = (await handlerDoLote().call(ctx as never, { jobIds: ["job-a", "job-b"] } as never, {
      id: "u-1",
      papel: "MASTER",
    } as never)) as { nomes: { jobId: string; nome: string }[] };

    expect(api.idsConsultados()).toEqual(["406998"]);
    expect(r.nomes.map((n) => n.jobId).sort()).toEqual(["job-a", "job-b"]);
  });
});

describe("FALHA DE UM ID não derruba o lote", () => {
  it("o id que falhou fica sem nome; os outros voltam normalmente", async () => {
    const api = apiFake({ falharEm: ["421114"] });
    const { chamar, jobsDe } = montarLote(["406998", "421114", "433201"], api);
    const r = await chamar({ jobIds: jobsDe("406998", "421114", "433201") });

    expect(r.nomes.map((n) => n.jobId).sort()).toEqual(jobsDe("406998", "433201").sort());
    expect(r.nomes).toHaveLength(2);
  });

  it("a API do Pandapé INTEIRA fora: lote vazio, e ainda assim resposta válida (a tela não cai)", async () => {
    const api = apiFake({ falharEm: ["406998", "421114"] });
    const { chamar, jobsDe } = montarLote(["406998", "421114"], api);
    const r = await chamar({ jobIds: jobsDe("406998", "421114") });
    expect(r.nomes).toEqual([]);
    expect(typeof r.restantes).toBe("number");
  });

  it("fila ILEGÍVEL (Redis engasgado) não vira erro do lote", async () => {
    const { chamar, fila, jobsDe } = montarLote(["406998"]);
    const jobs = jobsDe("406998");
    fila.getFailed.mockRejectedValue(new Error("READONLY"));
    fila.getJob.mockRejectedValue(new Error("READONLY"));
    const r = await chamar({ jobIds: jobs });
    expect(r.nomes).toEqual([]);
  });
});

/**
 * ─ O FREIO DE COTA, CONTADO EM REQUISIÇÃO ───────────────────────────────────────────────────────
 *
 * O teto do Pandapé (1.000 req/5min) é COMPARTILHADO com o webhook que alimenta a FOLHA (§A.5): o
 * excesso do EA atrasa a folha, então isto é requisito de segurança, não de performance. Este caminho
 * é HTTP e nasce FORA dos limiters das filas, então precisa do freio próprio: 150 requisições por
 * janela de 5 minutos, GLOBAL AO PROCESSO, que RECUSA o excedente em vez de enfileirar.
 */
describe("o freio de 150 requisições por janela", () => {
  const ORCAMENTO = 150;
  const muitos = (n: number) => Array.from({ length: n }, (_, i) => String(500_000 + i));

  it("RECUSA a 151ª requisição da janela, e diz quantos ficaram em `restantes`", async () => {
    const ids = muitos(ORCAMENTO + 50);
    const { chamar, api, jobsDe } = montarLote(ids, apiFake());
    const r = await chamar({ jobIds: jobsDe(...ids) });

    expect(api.idsConsultados()).toHaveLength(ORCAMENTO);
    expect(r.nomes).toHaveLength(ORCAMENTO);
    expect(r.restantes).toBe(50);
  });

  it("o balde é GLOBAL AO PROCESSO: a segunda chamada na mesma janela não ganha orçamento novo", async () => {
    // Mede no próprio resolvedor, que é o singleton do processo: a janela vive NELE, e é isso que
    // impede alguém de reabrir o modal cinco vezes e gastar 750 requisições da cota da folha.
    const api = apiFake();
    const resolvedor = new NomesFalhadosService(api as never, new PandapeNomeCacheService());
    const alvos = (ids: string[]) => ids.map((id) => ({ jobId: `job-${id}`, idPrecollaborator: id }));

    const primeiro = await resolvedor.resolver(alvos(muitos(ORCAMENTO)));
    expect(primeiro.nomes).toHaveLength(ORCAMENTO);
    expect(api.idsConsultados()).toHaveLength(ORCAMENTO);

    const segundo = await resolvedor.resolver(alvos(["777001", "777002"]));
    expect(api.idsConsultados()).toHaveLength(ORCAMENTO); // nenhuma chamada nova
    expect(segundo.nomes).toEqual([]);
    expect(segundo.restantes).toBe(2);
  });

  it("o freio NÃO lê env nenhuma e NÃO depende do estado da varredura do Pandapé", () => {
    // Freio condicionado ao estado da varredura é o freio que ninguém revê no dia em que ela ligar.
    const resolvedor = codigo("diagnostico", "nomes-falhados.service.ts");
    expect(resolvedor).not.toContain("process.env");
    expect(resolvedor).not.toMatch(/Varredura|Scheduler|ConfigService/);
  });

  it("orçamento estourado NÃO lança: devolve o que tem (degradação honesta)", async () => {
    const ids = muitos(ORCAMENTO + 5);
    const { chamar, jobsDe } = montarLote(ids, apiFake());
    await expect(chamar({ jobIds: jobsDe(...ids) })).resolves.toBeTruthy();
  });

  it("segura a RAJADA: não dispara as 132 chamadas do pior caso medido no mesmo instante", async () => {
    // Orçamento sozinho não impede 132 requisições simultâneas, e é a rajada, não o total, que
    // atrasa o webhook da folha.
    const ids = muitos(132);
    const api = apiFake({ atrasoMs: 1 });
    const { chamar, jobsDe } = montarLote(ids, api);
    await chamar({ jobIds: jobsDe(...ids) });
    expect(api.picoSimultaneo()).toBeLessThanOrEqual(20);
  });
});

describe("INSTÂNCIA ÚNICA do cache de nomes (o defeito silencioso que custa cota para sempre)", () => {
  /**
   * O conserto errado é declarar `PandapeNomeCacheService` nos providers do `DiagnosticoModule`:
   * nasce uma SEGUNDA instância, o cache que o worker preenche nunca é lido, toda abertura do modal
   * vai 100% à API, e passam a existir DOIS depósitos de 500 nomes no processo. Nada quebra em tela.
   */
  it("o DiagnosticoModule NÃO declara o cache nos seus providers", () => {
    const providers = (Reflect.getMetadata("providers", DiagnosticoModule) ?? []) as unknown[];
    expect(providers).not.toContain(PandapeNomeCacheService);
  });

  it("ele IMPORTA o módulo que exporta o cache (a instância do worker)", async () => {
    const imports = (Reflect.getMetadata("imports", DiagnosticoModule) ?? []) as unknown[];
    const { PandapeEntradaModule } = await import("../pandape/pandape-entrada.module");
    expect(imports).toContain(PandapeEntradaModule);
    const exports = (Reflect.getMetadata("exports", PandapeEntradaModule) ?? []) as unknown[];
    expect(exports).toContain(PandapeNomeCacheService);
  });
});

describe("RBAC (§A.38): o COMUM não alcança o lote de nomes", () => {
  const areasFixas = { areasDaOperacao: async () => ["ADM"] } as unknown as MenuAreasService;
  const menusDoUsuario = (areas: string[]) =>
    ({ areasDoUsuario: async () => new Set(areas) }) as unknown as MenusService;

  function contexto(papel: Papel, fn: object): ExecutionContext {
    return {
      getHandler: () => fn,
      getClass: () => DiagnosticoController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: "u-1", papel } }) }),
    } as unknown as ExecutionContext;
  }

  it("a classe segue exigindo MASTER/SUPER_ADMIN (é daí que a rota nova herda a guarda)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, DiagnosticoController)).toEqual(["MASTER", "SUPER_ADMIN"]);
  });

  it("o handler não tem @Roles próprio afrouxando a regra, nem @Public", () => {
    const fn = handlerDoLote();
    const doMetodo = Reflect.getMetadata(ROLES_KEY, fn) as Papel[] | undefined;
    if (doMetodo !== undefined) expect(doMetodo).toEqual(["MASTER", "SUPER_ADMIN"]);
    expect(Reflect.getMetadata("isPublic", fn)).toBeUndefined();
  });

  it("o RolesGuard REAL barra o COMUM (prova pelo guard, não pela anotação)", async () => {
    const guard = new RolesGuard(new Reflector(), menusDoUsuario(["ADM"]), areasFixas);
    await expect(guard.canActivate(contexto("COMUM", handlerDoLote()))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("MASTER de OUTRA área também para: a segunda dimensão do guard vale aqui", async () => {
    const guard = new RolesGuard(new Reflector(), menusDoUsuario(["AS"]), areasFixas);
    await expect(guard.canActivate(contexto("MASTER", handlerDoLote()))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("MASTER da área ADM e SUPER_ADMIN passam", async () => {
    const guard = new RolesGuard(new Reflector(), menusDoUsuario(["ADM"]), areasFixas);
    await expect(guard.canActivate(contexto("MASTER", handlerDoLote()))).resolves.toBe(true);
    await expect(guard.canActivate(contexto("SUPER_ADMIN", handlerDoLote()))).resolves.toBe(true);
  });
});
