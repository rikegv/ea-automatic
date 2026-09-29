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

// ── OS DOIS JOBS DO POLLING, E O DESENHO EXISTE PARA O LIMITER CONTINUAR VALENDO ───────────────

/**
 * ─ POR QUE O CICLO E LEQUE DE JOBS, E NAO UM JOB QUE VARRE TUDO ────────────────────────────────
 *
 * ┌─ O QUE UM "JOB DE CICLO" QUEBRARIA, E ESTE ARQUIVO JA AVISAVA ───────────────────────────────┐
 * │ O bloco de `DIGAI_WORKER_OPTIONS` diz, em letras: "o limiter do BullMQ conta JOBS, e um job   │
 * │ que faca varias chamadas HTTP passa POR BAIXO dele". Um unico job de varredura faria as 682   │
 * │ requisicoes medidas e o limiter de 90/min contaria UMA: a vazao sairia do teto do fornecedor  │
 * │ uma vez so, e o 90 no codigo viraria decoracao.                                                │
 * │                                                                                               │
 * │ ENTAO O CICLO E LEQUE: o TICK le uma pagina da listagem (1 requisicao) e enfileira UM job por │
 * │ screening; cada job de pagina le UMA pagina de resultados (1 requisicao) e, havendo mais,     │
 * │ enfileira o proximo. UM JOB E UMA REQUISICAO, que e a premissa que o limiter precisa para     │
 * │ contar o que realmente sai.                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E O CAMINHO DO WEBHOOK NAO MUDA ────────────────────────────────────────────────────────────┐
 * │ `JOB_EVENTO_DIGAI` continua exatamente como estava. O webhook FICA (ele funciona, e e opcao   │
 * │ futura: basta o Ivan cadastrar o listener no painel do fornecedor), e o polling nao depende   │
 * │ dele nem o substitui no codigo. O que mudou foi qual dos dois esta LIGADO por padrao.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** O ciclo: le UMA pagina da LISTAGEM de screenings e abre o leque. */
export const JOB_TICK_DIGAI = "digai-tick";

/** Uma folha do leque: le UMA pagina de resultados de UM screening. */
export const JOB_PAGINA_DIGAI = "digai-pagina";

/**
 * O payload do tick: a pagina da listagem e o ORCAMENTO que esta passada recebeu, em REQUISICOES.
 * Nenhum identificador, porque a listagem nao e de ninguem.
 *
 * ┌─ O ORCAMENTO VIAJA NO PAYLOAD, e foi o veto do `seguranca` (29/09) que o pos aqui ───────────┐
 * │ Sem ele, cada pagina de listagem recomecava com o teto cheio e cada folha do leque podia      │
 * │ pedir ate 20 paginas sem consultar orcamento nenhum: o teto autorizava 1 + N x 20             │
 * │ requisicoes. Um numero no payload e a forma mais barata de o gasto ATRAVESSAR os jobs sem     │
 * │ contador compartilhado, sem `cicloId` e sem corrida, e mantem a decisao pura e testavel.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface JobDoTickDigai {
  pagina: number;
  orcamento: number;
}

/**
 * O payload da folha. A MESMA REGRA DO JOB DO EVENTO: lista fechada de identificador tecnico, e
 * nada mais. O payload fica no Redis junto de `failedReason`, fora do alcance de um expurgo que so
 * conhece Postgres, entao campo a mais aqui e campo esquecido la.
 */
export interface JobDaPaginaDigai {
  screeningId: string;
  pagina: number;
  /** Quantas paginas o tick concedeu a ESTE screening nesta passada. A folha nao pede mais que isso. */
  paginasPermitidas: number;
}

/**
 * ─ AS TENTATIVAS DO POLLING SAO 2, E NAO OS 5 DO EVENTO ────────────────────────────────────────
 *
 * ┌─ O ARGUMENTO ANTIGO CAIU COM A MEDICAO DE 29/09, E O NOVO E MAIS FORTE ──────────────────────┐
 * │ ATE ENTAO o numero era derivado da cadencia: "attempts x teto, a 90/min, tem de caber no      │
 * │ intervalo". ESSA CONTA ESTAVA ERRADA NA RAIZ (ver `DIGAI_TETO_REQ_POR_CICLO`): ela derivava o │
 * │ teto da cadencia, quando a cadencia e escolha do diretor e o teto e freio de crescimento.     │
 * │ Quem impede a vazao de passar do fornecedor e o LIMITER de 90/min, em qualquer cadencia; quem │
 * │ impede ciclo sobre ciclo e `temCicloEmAndamento`. Retentativa nao fura nenhum dos dois: ela   │
 * │ passa pelo mesmo limiter e conta no mesmo ciclo.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE 2 CONTINUA CERTO, AGORA POR MEDICAO ────────────────────────────────────────────────┐
 * │ A varredura de 29/09 mediu 4 FALHAS EM 532 REQUISICOES (0,75%, timeout do fornecedor), e um   │
 * │ screening se perdeu mesmo com tres tentativas. NO POLLING, FALHA E ATRASO E NAO PERDA: o      │
 * │ ciclo rele TUDO daqui a 15 min, entao a pagina que falhou volta sozinha. Com 0,75% e duas     │
 * │ tentativas, a chance de um screening ficar de fora de UM ciclo e 1 em 18.000, e mesmo esse    │
 * │ volta no ciclo seguinte. Subir para 3 trocaria isso por 1 em 2,4 milhoes insistindo mais      │
 * │ contra um fornecedor QUE JA ESTA RESPONDENDO MAL: piora a causa para ganhar casa decimal.     │
 * │                                                                                               │
 * │ E A RAZAO DOS 5 NAO SE APLICA AQUI. O evento do webhook e entregue UMA VEZ e nunca            │
 * │ reentregue: desistir cedo PERDE A PESSOA, e por isso ele insiste.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const DIGAI_TENTATIVAS_DO_POLLING = 2;
