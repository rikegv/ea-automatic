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
  SYNC_CANDIDATE_JOB_OPTIONS,
  type PullDocsJobData,
  type SyncCandidateJobData,
} from "./pandape.queue";
import { PandapeEntradaService } from "./pandape-entrada.service";

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

  /**
   * `entradas` é OPCIONAL na assinatura e SEMPRE injetada em produção (o provider é exportado pelo
   * módulo da fila). Opcional porque o descarte por jobId ocupado é a ÚNICA coisa que esta classe
   * registra, e porque as suítes que já existiam constroem o serviço só com a config: um argumento
   * obrigatório novo quebraria código validado sem nenhum ganho (§A.26).
   */
  constructor(
    private readonly config: ConfigService,
    private readonly entradas?: PandapeEntradaService,
  ) {}

  /**
   * O job devolvido pelo `add` já EXISTIA? Comparado pelo `timestamp` do próprio BullMQ (instante de
   * criação do job): job recém-criado nasce agora, job pré-existente traz o carimbo de quando foi
   * criado. A folga de 5s evita falso positivo por relógio/latência, e o lado seguro do erro é NÃO
   * marcar como duplicado (um descarte não registrado é um dado a menos na tela; um falso duplicado
   * marcaria como descartado um evento que está rodando).
   */
  private ehJobPreexistente(job: unknown): boolean {
    const ts = (job as { timestamp?: unknown } | undefined)?.timestamp;
    return typeof ts === "number" && Number.isFinite(ts) && Date.now() - ts > 5_000;
  }

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
  async enfileirarCandidato(
    idPrecollaborator: string,
    opts: { jobIdSufixo?: string } = {},
  ): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("enfileirarCandidato ignorado: fila indisponível.");
      return false;
    }
    try {
      // jobId estável pelo idPreCollaborator: dedup de jobs em voo para o mesmo candidato.
      // Separador "-" (não ":"): o BullMQ 5.x REJEITA custom jobId contendo ":" ("Custom Id
      // cannot contain :"), o que fazia todo webhook real cair em 503 na fila. Ver INT-1/§A.5.
      //
      // O SUFIXO é o precedente já escrito ao lado, em `enfileirarPullDocumentos`, e existe para o
      // REPROCESSO MANUAL: `cand-<id>` é estável PARA SEMPRE, e o BullMQ recusa, CALADO, um `add`
      // com jobId que ainda consta no conjunto de concluídos (`removeOnComplete: 1000`). Sem ele, o
      // botão "reprocessar" da tela mostraria "reprocessado" para uma coisa que nunca rodou: um
      // silêncio novo dentro da frente que existe para acabar com o silêncio.
      const jobId = opts.jobIdSufixo
        ? `cand-${idPrecollaborator}-${opts.jobIdSufixo}`
        : `cand-${idPrecollaborator}`;
      const job = await this.queue.add(
        JOB_SYNC_CANDIDATE,
        { idPrecollaborator } satisfies SyncCandidateJobData,
        // O espaçamento vale SÓ aqui: o default é compartilhado com o `pull-docs` (ver
        // SYNC_CANDIDATE_JOB_OPTIONS, e o porquê de não mexer no default).
        { jobId, ...SYNC_CANDIDATE_JOB_OPTIONS },
      );

      // ─ "ACEITOU" NÃO É A MESMA COISA QUE "JÁ EXISTIA" (exigência 3 da auditoria) ─────────────
      // O `add` do BullMQ devolve `true` de qualquer jeito: com jobId ocupado ele DESCARTA o
      // enfileiramento e devolve o job ANTIGO, sem erro nenhum. Uma re-entrega real do Pandapé
      // sumia aí dentro, e a janela em que isso acontece ficou MAIOR com o espaçamento novo (o
      // jobId fica ocupado por horas, não por segundos), que é por que as duas coisas sobem juntas.
      // O carimbo de criação do job devolvido é o que separa um caso do outro.
      if (this.ehJobPreexistente(job)) {
        // NÃO É `registrarDesfecho`: o descarte não pode sobrescrever o motivo acionável de uma
        // linha pendente (ela viraria "Duplicado" e a tela pararia de dizer o que resolver) nem
        // incrementar `tentativas`, que conta só tentativa de virar admissão. Ver o método.
        await this.entradas?.registrarDescarteDuplicado(idPrecollaborator);
      }
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

  /**
   * A `Queue` crua, para o Diagnóstico inspecionar e agir sobre os jobs FALHADOS (onda 1 do
   * diagnóstico detalhado). Existe porque o card da fila precisava enxergar as TRÊS filas, e cada
   * uma guardava a sua atrás de um `private`. `undefined` quando a fila não subiu (Redis fora).
   *
   * Leitura e ação por alvo, nunca enfileiramento: quem enfileira são os métodos nomeados acima,
   * que continuam sendo o único caminho de produção desta fila.
   */
  filaBull(): Queue | undefined {
    return this.queue;
  }

}
