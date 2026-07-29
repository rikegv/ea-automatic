import IORedis from "ioredis";
import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * Configuração compartilhada da fila da COLETA DE VT (§A.17 etapa 3 / INT-2). Espelha a fila do
 * Pandapé em estrutura (namespace isolado, conexão db:1, backoff), mas o consumo aqui é do Drive,
 * não do Pandapé, então não disputa o teto compartilhado de 1.000 req/5min (§A.5). O limiter serve só
 * para não martelar o Drive numa pasta coletiva grande.
 */

/** Nome da fila BullMQ. */
export const VT_COLETA_QUEUE = "vt-coleta-scan";

/** Prefixo de namespace isolado no Redis (§A.1, namespace próprio do EA). */
export const VT_COLETA_BULL_PREFIX = "ea:bull";

/** Um ciclo de varredura da pasta coletiva (enfileirado pelo scheduler e pelo disparo manual). */
export const JOB_SCAN_TICK = "scan-tick";
/** Varredura direcionada a UMA admissão (o consultor clicou "buscar VT" na ficha). */
export const JOB_SCAN_ADMISSAO = "scan-admissao";

/** Dados do job `scan-admissao`. */
export interface ScanAdmissaoJobData {
  admissaoId: string;
}

/**
 * Conexão IORedis para BullMQ. `maxRetriesPerRequest: null` é exigência do BullMQ (workers). `db: 1`
 * isola a fila do rate-limit/throttler. Um listener de `error` é anexado pelo chamador para que uma
 * falha de conexão NÃO derrube o processo (tolerância de boot).
 */
export function criarConexaoRedis(host: string, port: number): IORedis {
  return new IORedis({
    host,
    port,
    db: 1,
    maxRetriesPerRequest: null,
  });
}

/** Opções padrão de job: 5 tentativas com backoff exponencial. */
export const VT_COLETA_QUEUE_OPTIONS: Omit<QueueOptions, "connection"> = {
  prefix: VT_COLETA_BULL_PREFIX,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
};

/**
 * Opções do worker: concorrência 1 (serializa o consumo) + limiter modesto (30 jobs / min) para não
 * martelar o Drive quando a pasta coletiva tiver muitos arquivos.
 */
export const VT_COLETA_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: VT_COLETA_BULL_PREFIX,
  concurrency: 1,
  limiter: { max: 30, duration: 60_000 },
};
