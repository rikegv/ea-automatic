import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type IORedis from "ioredis";
import { criarConexaoRedis } from "../pandape/pandape.queue";
import {
  CLICKSIGN_QUEUE,
  CLICKSIGN_QUEUE_OPTIONS,
  JOB_CRIAR_ENVELOPE,
  JOB_POLL_TICK,
  type CriarEnvelopeJobData,
} from "./clicksign.queue";

/**
 * Dono do lado PRODUTOR da fila da Clicksign (a `Queue` BullMQ) + a conexão Redis dedicada. Vive em
 * módulo próprio (ClicksignQueueModule) para que o KitService possa enfileirar `criar-envelope` SEM
 * acoplar o KitModule ao ClicksignModule (evita dependência circular: ClicksignModule → KitModule).
 *
 * Tolerante a Redis indisponível no boot (§A.5): se a criação falhar, loga e segue; os
 * enfileiramentos viram no-op logado. O Worker (consumidor) vive no ClicksignSyncService.
 */
@Injectable()
export class ClicksignQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ClicksignQueueService");
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
        this.logger.warn(`Conexão Redis (fila Clicksign) com erro: ${err.message}`);
      });
      this.queue = new Queue(CLICKSIGN_QUEUE, {
        connection: this.connection,
        ...CLICKSIGN_QUEUE_OPTIONS,
      });
      this.logger.log("Fila clicksign-sync inicializada.");
    } catch (err) {
      this.logger.warn(
        `Fila clicksign-sync indisponível no boot (segue sem derrubar o app): ${
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
   * Enfileira a criação de 1 envelope para uma admissão. Devolve se ENFILEIROU de fato.
   *
   * O jobId é ÚNICO POR DISPARO. Ele já foi estável (`env-<admissao>`) e isso criava um bug calado:
   * o BullMQ guarda o job concluído (`removeOnComplete: 1000`), então o SEGUNDO disparo da mesma
   * admissão era descartado sem erro nenhum. A tela dizia "enfileirado", o envelope não nascia, e o
   * consultor não tinha como saber. Atingia todo reenvio por correção, toda troca de kit e todo
   * redisparo depois de um cancelamento.
   *
   * É a MESMA armadilha que o `PandapeQueueService.enfileirarPullDocumentos` já documentava e
   * resolvia com sufixo; a fila da Clicksign é que tinha ficado para trás.
   *
   * A proteção contra disparo em duplicidade deixou de ser o jobId e passou a ser o estado: o
   * `criarEnvelope` recusa criar um segundo envelope para admissão que já tem um aguardando.
   */
  async enfileirarCriarEnvelope(admissaoId: string, stagingPathKit: string): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("enfileirarCriarEnvelope ignorado: fila indisponível.");
      return false;
    }
    const jobId = `env-${admissaoId}-${Date.now().toString(36)}`;
    const job = await this.queue.add(
      JOB_CRIAR_ENVELOPE,
      { admissaoId, stagingPathKit } satisfies CriarEnvelopeJobData,
      { jobId },
    );
    return Boolean(job?.id);
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
