import type { QueueOptions, WorkerOptions } from "bullmq";

/**
 * FILA DO RETRY DA EMISSÃO DO LINK DO PORTAL (frente A.1).
 *
 * Molde: a fila da Clicksign (`clicksign.queue.ts`) + o helper de conexão do Pandapé
 * (`criarConexaoRedis`). Aqui producer e worker vivem num SERVIÇO SÓ (`PortalLinkRetryService`),
 * porque, ao contrário da Clicksign, não há um terceiro módulo que precise enfileirar sem puxar o
 * worker: quem enfileira é o gancho da liberação, que já injeta o serviço do PortalModule. As
 * retentativas são do próprio BullMQ (`attempts` + `backoff`), não um reenfileiramento manual.
 *
 * §A.6: o payload leva só ids técnicos (admissão, autor). Nenhum e-mail, CPF, nome, link ou token.
 */

/** Nome da fila. */
export const PORTAL_LINK_RETRY_QUEUE = "portal-link-retry";

/** Mesmo prefixo das demais filas do EA. */
export const PORTAL_LINK_BULL_PREFIX = "ea:bull";

/** O único job: retentar a emissão automática de uma admissão. */
export const JOB_RETENTAR_EMISSAO = "retentar-emissao";

/**
 * O payload é uma REFERÊNCIA MÍNIMA: o worker re-lê o estado autoritativo do banco e re-chama
 * `enviarParaAdmissao(...,"AUTOMATICO")`. `autorId` é o usuário do EA que liberou (o mesmo que o
 * gancho usou), necessário porque `portal_links.criado_por_id` é NOT NULL (ver `SEM_AUTOR_PARA_O_LINK`).
 */
export interface RetentarEmissaoJobData {
  admissaoId: string;
  autorId: string;
}

/**
 * PRODUTOR. `attempts: 5` com backoff exponencial de base 60s (1, 2, 4, 8, 16 min): janela larga o
 * bastante para uma oscilação de canal de e-mail se resolver sozinha, e curta o bastante para o
 * estado consultável assentar no mesmo turno de trabalho. Esgotadas as 5, o job falha e o estado de
 * falha carimbado nas colunas de `admissoes` permanece consultável (é o ponto da frente).
 */
export const PORTAL_LINK_QUEUE_OPTIONS: Omit<QueueOptions, "connection"> = {
  prefix: PORTAL_LINK_BULL_PREFIX,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
};

/**
 * CONSUMIDOR. `concurrency: 1`: cada envio abre transação que toma o `pg_advisory_xact_lock` da
 * admissão (ver `enviarParaCandidaturas`), então serial é o certo. Sem `limiter`: esta fila não
 * fala com provedor externo com teto (o SendGrid já tem o próprio tratamento no correio).
 */
export const PORTAL_LINK_WORKER_OPTIONS: Omit<WorkerOptions, "connection"> = {
  prefix: PORTAL_LINK_BULL_PREFIX,
  concurrency: 1,
};
