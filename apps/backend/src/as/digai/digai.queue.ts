import IORedis from "ioredis";
import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * ─ A FILA DO DIGAI, ISOLADA DE TUDO O QUE JA EXISTE ────────────────────────────────────────────
 *
 * ┌─ O RISCO QUE ESTE ARQUIVO EXISTE PARA CONTER, E ELE E DE DESENHO DO BULLMQ ──────────────────┐
 * │ O LIMITER E POR FILA. Duas filas com limiter proprio SOMAM os dois tetos, e nada do nosso     │
 * │ lado falha quando a soma estoura o teto do terceiro: quem sente e a operacao, do outro lado.  │
 * │ A casa ja mediu isso (`ingestao-varredura.queue.ts`), quando uma fila nova de 250/5min ao     │
 * │ lado de uma de 800/5min daria 1.050 contra um teto de 1.000. Por isso o teto do Digai e       │
 * │ declarado EM CODIGO e a conta e feita contra a SOMA, nunca contra uma fila isolada.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O TETO DO DIGAI E PROPRIO, E NAO SE SOMA AO DO PANDAPE ─────────────────────────────────────┐
 * │ O do Pandape e COMPARTILHADO com o webhook do G.Infor que alimenta a FOLHA (§A.5), e por isso │
 * │ e o mais caro de estourar. O do Digai e so do Digai. Misturar as duas contas so faria uma das │
 * │ duas ficar apertada sem motivo, e a outra ficar frouxa sem ninguem notar.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * O TETO ADOTADO: 120 REQUISICOES POR MINUTO.
 *
 * A DOCUMENTACAO DO DIGAI DIZ 500; O FORNECEDOR DISSE 120. ADOTA-SE O MENOR, e isso nao e cautela
 * decorativa: dos dois numeros, um esta errado, e o erro que custa e o de cima. O numero vive em
 * CODIGO porque numero que vive so no comentario volta a ser 500 na primeira refatoracao.
 */
export const DIGAI_TETO_REQ_POR_MINUTO = 120;

/** A fila, com nome proprio. Nada do Pandape entra aqui, e nada daqui entra la. */
export const DIGAI_QUEUE = "digai-ingestao";

/**
 * PREFIXO PROPRIO NO REDIS. E ele que permite medir, drenar ou limpar a fila do Digai sem encostar
 * na que atende o webhook da folha.
 */
export const DIGAI_BULL_PREFIX = "ea:bull:digai";

/**
 * O BANCO REDIS E O 3, e a escolha foi medida: o 1 e da `pandape-sync`, o 2 e da varredura do
 * Pandape, e o 3 estava livre. Compartilhar banco faria um `flushdb` de diagnostico de uma frente
 * apagar a fila da outra.
 */
export const DIGAI_REDIS_DB = 3;

/** O job do evento `NEW_APPLICATION`: um por entrega, deduplicado pelo `jobId`. */
export const JOB_EVENTO_DIGAI = "digai-evento";

/**
 * ─ O PAYLOAD DO JOB E A LISTA FECHADA DE IDENTIFICADORES TECNICOS, E NADA ALEM ─────────────────
 *
 * ┌─ POR QUE A LISTA E FECHADA, e o motivo e concreto e nao teorico ─────────────────────────────┐
 * │ O payload do BullMQ FICA NO REDIS, junto de `failedReason` e `stacktrace`, e `removeOnFail`  │
 * │ o retem SEM TTL, FORA DO ALCANCE de um expurgo que so conhece Postgres. Redis com e-mail e    │
 * │ telefone dentro e banco de dados com outro nome, e ninguem o auditaria. E o achado 2 do       │
 * │ `seguranca` na varredura do Pandape, onde o job ficou sendo `{ idVacancy, page }`.             │
 * │                                                                                               │
 * │ CAMPO A MAIS HOJE E CAMPO ESQUECIDO NO REDIS AMANHA. O enriquecimento e do WORKER: ele busca  │
 * │ o resto pelos ids, e o resto nunca precisa viajar.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface JobDoEventoDigai {
  screeningId: string;
  userId: string;
  /** Opcional: o evento nem sempre o traz, e a segunda chamada se resolve sem ele. */
  attemptId?: string;
}

/** Conexao propria, no banco 3. `maxRetriesPerRequest: null` e exigencia do BullMQ para workers. */
export function criarConexaoDoDigai(host: string, port: number): IORedis {
  return new IORedis({ host, port, db: DIGAI_REDIS_DB, maxRetriesPerRequest: null });
}

export const DIGAI_QUEUE_OPTIONS: Omit<QueueOptions, "connection"> = {
  prefix: DIGAI_BULL_PREFIX,
  defaultJobOptions: {
    /*
     * CINCO TENTATIVAS, ESPACADAS EXPONENCIALMENTE A PARTIR DE UM MINUTO. O evento nao volta
     * sozinho (o fornecedor entrega uma vez), entao desistir cedo perde a pessoa; insistir rapido
     * gasta o teto contra um fornecedor que ja esta respondendo mal.
     */
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { age: 24 * 3600, count: 500 },
    /*
     * ─ `removeOnFail` COM TTL, E ELE E OBRIGATORIO AQUI ──────────────────────────────────────
     *
     * O padrao do BullMQ RETEM o job falho indefinidamente. Mesmo com o payload limpo de dado
     * pessoal, a retencao tem de ser DECLARADA: e a diferenca entre "nao guardamos dado pessoal" e
     * "nao guardamos dado pessoal nem por acidente". 48h e o padrao da casa para dado temporario
     * (protocolo, secao 5), o mesmo da staging efemera.
     */
    removeOnFail: { age: 48 * 3600, count: 500 },
  },
};

/**
 * CONCORRENCIA 1 E LIMITER DE 90 POR MINUTO, ou 75% do teto de 120.
 *
 * A CONCORRENCIA 1 NAO E DESEMPENHO, E CONTAGEM: o limiter do BullMQ conta JOBS, e um job que faca
 * varias chamadas HTTP passa POR BAIXO dele. Com um job igual a uma leitura, o limiter conta o que
 * realmente sai. Se um dia o job passar a fazer N chamadas, este numero precisa ser dividido por N,
 * e esta frase esta aqui para quem fizer isso saber.
 */
export const DIGAI_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: DIGAI_BULL_PREFIX,
  concurrency: 1,
  limiter: { max: 90, duration: 60_000 },
};
