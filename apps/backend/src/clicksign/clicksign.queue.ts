import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * Configuração compartilhada da fila da Clicksign (INT-4 / F9, §A.5).
 *
 * A fila + backoff servem ao mesmo princípio do Pandapé: serializar o consumo da API externa e
 * absorver picos sem estourar o rate limit. A Clicksign sandbox tolera ~20 req/10s — o limiter
 * opera com HEADROOM (18/10s) e concorrência 1. O processamento do `document_closed` (polling, não
 * webhook nesta entrega) é idempotente, então retentativas do backoff são seguras.
 *
 * Reusa `criarConexaoRedis` (IORedis db1, prefix `ea:bull`) do módulo Pandapé — mesma infra de fila,
 * namespace isolado do EA (§A.1).
 */

/** Nome da fila BullMQ. */
export const CLICKSIGN_QUEUE = "clicksign-sync";

/** Prefixo de namespace isolado no Redis (§A.1 — namespace próprio do EA). */
export const CLICKSIGN_BULL_PREFIX = "ea:bull";

/** Dois tipos de job: criar 1 envelope e varrer os envelopes aguardando assinatura. */
export const JOB_CRIAR_ENVELOPE = "criar-envelope";
export const JOB_POLL_TICK = "poll-tick";

/**
 * Dados do job `criar-envelope`. `stagingPathKit` é o caminho do kit já materializado na staging
 * (gerado pelo KitService) — o binário viaja por referência de disco efêmero, NUNCA pelo banco
 * (§A.6). Se o arquivo tiver sido expurgado pelo TTL antes do worker rodar, o job falha e entra no
 * backoff (o consultor regenera o kit). Sem CPF/PII no payload do job.
 */
export interface CriarEnvelopeJobData {
  admissaoId: string;
  stagingPathKit: string;
}

/** Opções padrão de job: 5 tentativas com backoff exponencial (resiliência ao rate limit). */
export const CLICKSIGN_QUEUE_OPTIONS: Omit<QueueOptions, "connection"> = {
  prefix: CLICKSIGN_BULL_PREFIX,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
};

/**
 * Opções do worker: concorrência 1 (serializa o consumo) + limiter com headroom sob o teto da
 * sandbox (~20 req/10s). 18 jobs / 10_000 ms = folga deliberada.
 */
export const CLICKSIGN_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: CLICKSIGN_BULL_PREFIX,
  concurrency: 1,
  limiter: { max: 18, duration: 10_000 },
};
