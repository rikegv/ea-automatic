import IORedis from "ioredis";
import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * Configuração compartilhada da fila do Pandapé (Fase 5 / INT-1, §A.5).
 *
 * A fila + backoff são REQUISITO DE SEGURANÇA: o rate limit de 1.000 req/5min do Pandapé é
 * compartilhado entre a API que o EA consome e o webhook que alimenta a folha. Excesso do EA pode
 * atrasar a folha → o limiter do worker opera com HEADROOM (500/5min, somado aos 250/5min da fila
 * `pandape-varredura`, dá 750/5min sob o teto de 1.000/5min) e a concorrência é 1 para serializar o
 * consumo. O backoff exponencial absorve picos sem estourar o teto. O porquê do 500 (antes 800) está
 * no bloco de `PANDAPE_WORKER_OPTIONS`, lá embaixo.
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
/**
 * SCHEDULER TICK (OST scheduler): um ciclo de re-consulta das admissões vivas de origem Pandapé. Roda
 * NO WORKER (sob o limiter, concorrência 1 → nunca dispara N chamadas simultâneas) e varre as
 * admissões sequencialmente, incremental pela dedup por arquivo. Enfileirado pelo scheduler
 * in-process (cadência fixa) e pelo disparo manual da tela de diagnóstico.
 */
export const JOB_SCHEDULER_TICK = "scheduler-tick";

/** Dados do job `sync-candidate` (1 idPreCollaborator por job). */
export interface SyncCandidateJobData {
  idPrecollaborator: string;
}

/** Dados do job `pull-docs`: a admissão que acabou de nascer e o pré-colaborador de origem. */
export interface PullDocsJobData {
  admissaoId: string;
  idPrecollaborator: string;
  /**
   * REPROCESSO explícito (varredura retroativa, sob demanda). Derruba a trava por tipo (documento já
   * ENTREGUE volta a ser auditado) para corrigir o passivo auditado pelo fluxo antigo. NUNCA derruba
   * a idempotência: se todos os arquivos já têm marca, o tipo é pulado do mesmo jeito. Ausente/false
   * no pull normal da liberação e do webhook, que seguem com o comportamento vigente.
   */
  reprocessar?: boolean;
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

/**
 * ─ ESPAÇAMENTO DA RE-TENTATIVA DO `sync-candidate`, E SÓ DELE (OST 15/09/2026) ─────────────────
 *
 * O CASO MEDIDO: cinco tentativas em DEZ SEGUNDOS para um dado que só ficou válido DIAS depois. O
 * evento do Pandapé sai na pasta "Convite de admissão enviado", ANTES de a pessoa preencher o
 * formulário, então o CPF vem zerado; nenhuma quantidade de tentativas dentro do mesmo minuto faz
 * alguém preencher mais rápido, e cada uma ainda gasta o rate limit COMPARTILHADO com o webhook que
 * alimenta a folha (§A.5). A primeira re-tentativa passa a cair em 1 HORA e a janela total alcança
 * 31 horas (1+2+4+8+16), que é o dia seguinte com folga.
 *
 * ┌─ POR QUE ISTO NÃO ESTÁ NO `defaultJobOptions`, e mexer lá seria um incidente ──────────────────┐
 * │ O default é COMPARTILHADO com o `pull-docs`. Espaçar o pull empurra a coleta documental contra  │
 * │ o TTL de 48h da STAGING EFÊMERA: o prontuário se perde EM SILÊNCIO, que é exatamente o padrão   │
 * │ do incidente da §A.33. O pull fica como está (5 tentativas, backoff 2s).                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const SYNC_CANDIDATE_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 60 * 60 * 1000 },
};

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
 * compartilhado de 1.000 req/5min (§A.5).
 *
 * ┌─ O TETO CAIU DE 800 PARA 500 QUANDO A VARREDURA NASCEU, E ISSO NÃO É AJUSTE FINO ────────────┐
 * │ O LIMITER DO BULLMQ É POR FILA. A `pandape-varredura` (`as/ingestao-pandape`) tem limiter     │
 * │ próprio de 250/5min, e DUAS FILAS SOMAM OS DOIS TETOS: 800 + 250 = 1.050/5min contra o teto   │
 * │ de terceiro de 1.000/5min. Nada do nosso lado falharia; quem sentiria é o webhook do G.Infor  │
 * │ que alimenta a FOLHA, porque a cota é compartilhada, e excesso nosso é risco de segurança.     │
 * │                                                                                                │
 * │ 500 + 250 = 750/5min (150 req/min), 75% do teto e MENOS do que esta fila praticava sozinha.    │
 * │ O CORTE NÃO TIRA NADA DE NINGUÉM: o consumo medido desta fila é de 6,5 req/min (78 requisições │
 * │ por ciclo de 12 minutos do scheduler admissional), então sobram 15 vezes o consumo medido de   │
 * │ folga para os picos do webhook.                                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const PANDAPE_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: PANDAPE_BULL_PREFIX,
  concurrency: 1,
  limiter: { max: 500, duration: 300_000 },
};
