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

  /** Enfileira a criação de 1 envelope para uma admissão. No-op (logado) se a fila não subiu. */
  async enfileirarCriarEnvelope(admissaoId: string, stagingPathKit: string): Promise<void> {
    if (!this.queue) {
      this.logger.warn("enfileirarCriarEnvelope ignorado: fila indisponível.");
      return;
    }
    // jobId estável pela admissão: dedup de criações em voo para a mesma admissão.
    await this.queue.add(
      JOB_CRIAR_ENVELOPE,
      { admissaoId, stagingPathKit } satisfies CriarEnvelopeJobData,
      { jobId: `env-${admissaoId}` },
    );
  }

  /** Enfileira um `poll-tick`. No-op (logado) se a fila não subiu. */
  async enfileirarTick(): Promise<void> {
    if (!this.queue) {
      this.logger.warn("enfileirarTick ignorado: fila indisponível.");
      return;
    }
    await this.queue.add(JOB_POLL_TICK, {});
  }
}
