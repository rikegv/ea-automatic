import IORedis from "ioredis";
import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * Configuração compartilhada da fila do Pandapé (Fase 5 / INT-1, §A.5).
 *
 * A fila + backoff são REQUISITO DE SEGURANÇA: o rate limit de 1.000 req/5min do Pandapé é
 * compartilhado entre a API que o EA consome e o webhook que alimenta a folha. Excesso do EA pode
 * atrasar a folha → o limiter do worker opera com HEADROOM (800/5min < 1.000/5min) e a concorrência
 * é 1 para serializar o consumo. O backoff exponencial absorve picos sem estourar o teto.
 */

/** Nome da fila BullMQ. */
export const PANDAPE_QUEUE = "pandape-sync";

/** Prefixo de namespace isolado no Redis (§A.1 — namespace próprio do EA). */
export const PANDAPE_BULL_PREFIX = "ea:bull";

/**
 * Tipos de job: o tick que varre mudanças, o sync de 1 pré-colaborador e o PULL DE DOCUMENTOS de uma
 * admissão recém-liberada (que é o que faz a coleta rodar sem disparar N chamadas simultâneas ao
 * Pandapé: passa pelo mesmo limiter com headroom).
 */
export const JOB_POLL_TICK = "poll-tick";
export const JOB_SYNC_CANDIDATE = "sync-candidate";
export const JOB_PULL_DOCS = "pull-docs";

/** Dados do job `sync-candidate` (1 idPreCollaborator por job). */
export interface SyncCandidateJobData {
  idPrecollaborator: string;
}

/** Dados do job `pull-docs`: a admissão que acabou de nascer e o pré-colaborador de origem. */
export interface PullDocsJobData {
  admissaoId: string;
  idPrecollaborator: string;
}

/**
 * Conexão IORedis para BullMQ. `maxRetriesPerRequest: null` é exigência do BullMQ (workers). `db: 1`
 * isola a fila do Pandapé de outros usos de Redis (rate-limit/throttler). Um listener de `error` é
 * anexado pelo chamador para que falhas de conexão NÃO derrubem o processo (tolerância de boot).
 */
export function criarConexaoRedis(host: string, port: number): IORedis {
  return new IORedis({
    host,
    port,
    db: 1,
    maxRetriesPerRequest: null,
  });
}

/** Opções padrão de job: 5 tentativas com backoff exponencial (resiliência ao rate limit). */
export const PANDAPE_QUEUE_OPTIONS: Omit<QueueOptions, "connection"> = {
  prefix: PANDAPE_BULL_PREFIX,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
};

/**
 * Opções do worker: concorrência 1 (serializa o consumo) + limiter com headroom sob o teto
 * compartilhado de 1.000 req/5min (§A.5). 800 jobs / 300_000 ms = folga deliberada para o webhook
 * da folha não competir pelo limite.
 */
export const PANDAPE_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: PANDAPE_BULL_PREFIX,
  concurrency: 1,
  limiter: { max: 800, duration: 300_000 },
};
