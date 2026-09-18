import IORedis from "ioredis";
import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * ─ A FILA DA VARREDURA, ISOLADA DA FILA DO ADMISSIONAL ─────────────────────────────────────────
 *
 * ┌─ O RISCO QUE ESTE ARQUIVO EXISTE PARA CONTER, E ELE É DE DESENHO DO BULLMQ ──────────────────┐
 * │ O LIMITER É POR FILA. Duas filas com limiter próprio SOMAM os dois tetos, então acrescentar   │
 * │ uma fila nova de 250/5min ao lado de uma de 800/5min dá 1.050/5min contra um teto de terceiro │
 * │ de 1.000/5min, e NADA DO NOSSO LADO FALHA quando isso acontece: quem sente é o webhook do     │
 * │ G.Infor que alimenta a FOLHA, porque a cota é compartilhada (§A.5).                            │
 * │                                                                                                │
 * │ Por isso a fila nova sobe JUNTO com o rebaixamento da `pandape-sync` de 800 para 500           │
 * │ (`pandape/pandape.queue.ts`): 500 + 250 = 750/5min, ou 150 req/min, que é 75% do teto e MENOS  │
 * │ do que a casa já praticava sozinha. A `pandape-sync` usa 6,5 req/min medidos, então o corte    │
 * │ não tira nada de ninguém e continua com 15 vezes o consumo medido de folga para os picos.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A VARREDURA É ROLANTE, E NÃO UMA RAJADA DE 660 REQUISIÇÕES ────────────────────────────────┐
 * │ O limiter do BullMQ conta JOBS, não requisições HTTP: uma volta inteira dentro de um job só   │
 * │ passaria POR BAIXO do limiter e daria exatamente o pico que a §A.5 existe para impedir. Por   │
 * │ isso a unidade de trabalho é UMA PÁGINA de UMA VAGA, e o "ciclo" é o tempo que a roda leva     │
 * │ para dar a volta (26 minutos medidos, com intervalo de 30).                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** A fila, com nome próprio. Nada da `pandape-sync` entra aqui, e nada daqui entra lá. */
export const VARREDURA_QUEUE = "pandape-varredura";

/**
 * PREFIXO PRÓPRIO NO REDIS. Isolar o namespace é o que permite limpar, medir ou drenar a varredura
 * sem encostar na fila que atende o webhook e o scheduler admissional.
 */
export const VARREDURA_BULL_PREFIX = "ea:bull:varredura";

/** O banco Redis é OUTRO (a `pandape-sync` usa o 1), pelo mesmo motivo do prefixo. */
export const VARREDURA_REDIS_DB = 2;

/** A descoberta: UMA chamada, as vagas ativas, e o enfileiramento da primeira página de cada uma. */
export const JOB_DESCOBERTA = "varredura-descoberta";
/** Uma página de uma vaga. É a unidade que o limiter consegue contar. */
export const JOB_PAGINA = "varredura-pagina";

/**
 * ─ O PAYLOAD DO JOB É `{ idVacancy, page }` E NADA MAIS (achado 2 do `seguranca`) ──────────────
 *
 * PÁGINA DE INSCRIÇÃO NUNCA É ENFILEIRADA, nunca é `returnvalue`, e CPF nunca entra em `jobId`. O
 * motivo é concreto e não teórico: `removeOnFail` deixa os payloads no REDIS por tempo
 * indeterminado, junto de `failedReason` e `stacktrace`, FORA DO ALCANCE de um expurgo que só
 * conhece Postgres e sem TTL nenhum. O Redis com dado de currículo dentro é banco de dados com outro
 * nome, e ninguém o auditaria.
 */
export interface JobDaPagina {
  idVacancy: number;
  page: number;
}

/** Conexão própria, no banco 2. `maxRetriesPerRequest: null` é exigência do BullMQ para workers. */
export function criarConexaoDaVarredura(host: string, port: number): IORedis {
  return new IORedis({ host, port, db: VARREDURA_REDIS_DB, maxRetriesPerRequest: null });
}

export const VARREDURA_QUEUE_OPTIONS: Omit<QueueOptions, "connection"> = {
  prefix: VARREDURA_BULL_PREFIX,
  defaultJobOptions: {
    /*
     * TRÊS TENTATIVAS, ESPAÇADAS EM MINUTO. A página que falhou volta na próxima volta de qualquer
     * jeito (a leitura é sempre completa), então insistir rápido só gastaria cota compartilhada.
     */
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
};

/**
 * Concorrência 1 (a roda é sequencial por construção, e é isso que garante que nunca há duas voltas
 * ao mesmo tempo) e limiter de 250 jobs por 5 minutos, ou 50 por minuto. A varredura medida fica em
 * ~41 req/min por LATÊNCIA, ou seja dentro do próprio limiter antes de ele precisar agir.
 */
export const VARREDURA_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: VARREDURA_BULL_PREFIX,
  concurrency: 1,
  limiter: { max: 250, duration: 300_000 },
};
