import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * Configuração compartilhada da fila da Clicksign (INT-4 / F9, §A.5).
 *
 * A fila + backoff servem ao mesmo princípio do Pandapé: serializar o consumo da API externa e
 * absorver picos sem estourar o rate limit. O processamento do `document_closed` (polling, não
 * webhook nesta entrega) é idempotente, então retentativas do backoff são seguras.
 *
 * ONDE O RITMO REALMENTE MORA, e por que este limiter é só um cinto secundário. O teto é do
 * PROVEDOR e vale para requisição, não para job: **50 por janela fixa de 10s em produção** (medido
 * nos headers `x-rate-limit`; o comentário anterior falava em "sandbox ~20/10s", defasado desde a
 * virada para `app.clicksign.com`). Cada job de envelope gasta ~10 requisições, e a fila é apenas UM
 * dos três consumidores do balde: a tela de gestão e o tick do cron gastam pelo mesmo teto sem passar
 * por aqui. Um limiter de JOB nunca poderia governar isso, e o antigo (18 jobs/10s) autorizava na
 * prática ~180 req/10s, três vezes o teto; só não estourava porque a concorrência 1 e os ~10s de cada
 * job seguravam por acidente.
 *
 * O controle de verdade passou para o `ClicksignApiService`, que conta REQUISIÇÃO, lê os headers do
 * provedor e cobre os três consumidores de uma vez (`domain/clicksign-rate`). Este limiter fica como
 * teto grosseiro de jobs, agora num número honesto: 3 jobs por 10s ≈ 30 requisições, dentro dos 35
 * que o EA se impõe.
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
 * Opções do worker: concorrência 1 (serializa o consumo) + teto grosseiro de JOBS. O ritmo fino, por
 * requisição e com os headers do provedor, vive no `ClicksignApiService` e cobre também a tela e o
 * tick, que não passam por esta fila.
 */
export const CLICKSIGN_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: CLICKSIGN_BULL_PREFIX,
  concurrency: 1,
  // 3 jobs × ~10 requisições = ~30 req/10s, sob os 35 que o EA se impõe (70% dos 50 do provedor).
  limiter: { max: 3, duration: 10_000 },
};
