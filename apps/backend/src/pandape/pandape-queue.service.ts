import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type IORedis from "ioredis";
import {
  criarConexaoRedis,
  JOB_POLL_TICK,
  JOB_PULL_DOCS,
  JOB_SCHEDULER_TICK,
  JOB_SYNC_CANDIDATE,
  PANDAPE_QUEUE,
  PANDAPE_QUEUE_OPTIONS,
  type PullDocsJobData,
  type SyncCandidateJobData,
} from "./pandape.queue";

/**
 * Dono do lado PRODUTOR da fila (a `Queue` BullMQ) e da conexão Redis dedicada. Tolerante a Redis
 * indisponível no boot (§A.5 — paridade com a tolerância dos sweeps in-process): se a criação
 * falhar, loga e segue; os enfileiramentos viram no-op. O Worker (consumidor) vive no SyncService.
 */
@Injectable()
export class PandapeQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("PandapeQueueService");
  private connection?: IORedis;
  private queue?: Queue;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    try {
      const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
      const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
      this.connection = criarConexaoRedis(host, port);
      // Sem este listener, um erro de conexão vira exceção não tratada e derruba o processo.
      this.connection.on("error", (err) => {
        this.logger.warn(`Conexão Redis (fila Pandapé) com erro: ${err.message}`);
      });
      this.queue = new Queue(PANDAPE_QUEUE, {
        connection: this.connection,
        ...PANDAPE_QUEUE_OPTIONS,
      });
      this.logger.log("Fila pandape-sync inicializada.");
    } catch (err) {
      this.logger.warn(
        `Fila pandape-sync indisponível no boot (segue sem derrubar o app): ${
          err instanceof Error ? err.message : "erro"
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }

  /**
   * Estado da fila para a TELA DE DIAGNÓSTICO (Bloco 3): contagem por estado e se a fila subiu.
   * `disponivel:false` = Redis não subiu no boot (a fila é no-op). Nunca lança.
   */
  async statusFila(): Promise<{
    disponivel: boolean;
    contagem?: { ativos: number; aguardando: number; falhados: number; atrasados: number };
    erro?: string;
  }> {
    if (!this.queue) return { disponivel: false };
    try {
      const c = await this.queue.getJobCounts("active", "waiting", "failed", "delayed");
      return {
        disponivel: true,
        contagem: {
          ativos: c.active ?? 0,
          aguardando: c.waiting ?? 0,
          falhados: c.failed ?? 0,
          atrasados: c.delayed ?? 0,
        },
      };
    } catch (err) {
      return { disponivel: false, erro: err instanceof Error ? err.name : "erro" };
    }
  }

  /** Enfileira um `poll-tick`. No-op (logado) se a fila não subiu. */
  async enfileirarTick(): Promise<void> {
    if (!this.queue) {
      this.logger.warn("enfileirarTick ignorado: fila indisponível.");
      return;
    }
    await this.queue.add(JOB_POLL_TICK, {});
  }

  /**
   * Enfileira um `scheduler-tick` (OST scheduler): um ciclo de re-consulta. jobId único por ciclo
   * (carimbo de tempo) porque um jobId estável de job já concluído (removeOnComplete) bloquearia o
   * próximo ciclo. Concorrência 1 do worker serializa ciclos que se sobreponham. Retorna `false` se a
   * fila não subiu (o scheduler in-process apenas loga e tenta no próximo tick).
   */
  async enfileirarSchedulerTick(): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("enfileirarSchedulerTick ignorado: fila indisponível.");
      return false;
    }
    try {
      await this.queue.add(JOB_SCHEDULER_TICK, {}, { jobId: `scheduler-tick-${Date.now()}` });
      return true;
    } catch (err) {
      this.logger.warn(
        `Falha ao enfileirar scheduler-tick: ${err instanceof Error ? err.message : "erro"}`,
      );
      return false;
    }
  }

  /**
   * Enfileira um `sync-candidate` para 1 idPreCollaborator.
   * Retorna `true` se enfileirou; `false` se a fila não subiu (Redis fora no boot) OU se o
   * `queue.add` lançou. O retorno permite ao webhook (INT-1) responder 503 em vez de perder o
   * evento silenciosamente — o Pandapé reenvia (§A.5). O chamador do tick (loop) ignora o retorno.
   */
  async enfileirarCandidato(idPrecollaborator: string): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("enfileirarCandidato ignorado: fila indisponível.");
      return false;
    }
    try {
      // jobId estável pelo idPreCollaborator: dedup de jobs em voo para o mesmo candidato.
      // Separador "-" (não ":"): o BullMQ 5.x REJEITA custom jobId contendo ":" ("Custom Id
      // cannot contain :"), o que fazia todo webhook real cair em 503 na fila. Ver INT-1/§A.5.
      await this.queue.add(
        JOB_SYNC_CANDIDATE,
        { idPrecollaborator } satisfies SyncCandidateJobData,
        { jobId: `cand-${idPrecollaborator}` },
      );
      return true;
    } catch (err) {
      // Sem vazar dados (§A.6): mensagem genérica, nunca o id/CPF.
      this.logger.warn(
        `Falha ao enfileirar sync-candidate: ${err instanceof Error ? err.message : "erro"}`,
      );
      return false;
    }
  }

  /**
   * Enfileira o PULL DE DOCUMENTOS de uma admissão recém-liberada (INT-1 / §A.9).
   *
   * É enfileirado, e não chamado direto, por dois motivos: a liberação EM MASSA de N admissões não
   * pode disparar N chamadas simultâneas ao Pandapé (o limiter da fila serializa sob o teto
   * compartilhado, §A.5), e a liberação **nunca** pode ser travada ou revertida por falha do pull.
   * Fila indisponível → devolve false e a liberação segue igual (o evento se perde, não a liberação).
   *
   * `jobId` estável por admissão: reprocessar a mesma liberação não empilha pull duplicado. O
   * separador é "-" porque o BullMQ 5.x rejeita ":" em custom jobId.
   */
  async enfileirarPullDocumentos(
    admissaoId: string,
    idPrecollaborator: string,
    opts: { reprocessar?: boolean; jobIdSufixo?: string } = {},
  ): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("enfileirarPullDocumentos ignorado: fila indisponível.");
      return false;
    }
    try {
      // O sufixo existe para a VARREDURA sob demanda: sem ele, o jobId estável `pull-<admissao>` já
      // consta como concluído no histórico do BullMQ e a nova solicitação seria descartada calada.
      const jobId = opts.jobIdSufixo
        ? `pull-${admissaoId}-${opts.jobIdSufixo}`
        : `pull-${admissaoId}`;
      await this.queue.add(
        JOB_PULL_DOCS,
        {
          admissaoId,
          idPrecollaborator,
          ...(opts.reprocessar ? { reprocessar: true } : {}),
        } satisfies PullDocsJobData,
        { jobId },
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Falha ao enfileirar pull-docs: ${err instanceof Error ? err.message : "erro"}`,
      );
      return false;
    }
  }
}
