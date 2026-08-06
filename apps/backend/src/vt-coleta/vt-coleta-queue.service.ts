import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type IORedis from "ioredis";
import {
  criarConexaoRedis,
  JOB_SCAN_ADMISSAO,
  JOB_SCAN_TICK,
  VT_COLETA_QUEUE,
  VT_COLETA_QUEUE_OPTIONS,
  type ScanAdmissaoJobData,
} from "./vt-coleta.queue";

/**
 * Dono do lado PRODUTOR da fila da coleta de VT (a `Queue` BullMQ) e da conexão Redis dedicada.
 * Tolerante a Redis indisponível no boot (paridade com o produtor do Pandapé): se a criação falhar,
 * loga e segue; os enfileiramentos viram no-op. O Worker (consumidor) vive no VtColetaService.
 */
@Injectable()
export class VtColetaQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("VtColetaQueueService");
  private connection?: IORedis;
  private queue?: Queue;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    try {
      const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
      const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
      this.connection = criarConexaoRedis(host, port);
      this.connection.on("error", (err) => {
        this.logger.warn(`Conexão Redis (fila coleta VT) com erro: ${err.message}`);
      });
      this.queue = new Queue(VT_COLETA_QUEUE, {
        connection: this.connection,
        ...VT_COLETA_QUEUE_OPTIONS,
      });
      this.logger.log("Fila vt-coleta-scan inicializada.");
    } catch (err) {
      this.logger.warn(
        `Fila vt-coleta-scan indisponível no boot (segue sem derrubar o app): ${
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
   * Estado da fila para a TELA DE DIAGNÓSTICO: contagem por estado e se a fila subiu.
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

  /**
   * Enfileira um `scan-tick` (um ciclo de varredura). jobId único por ciclo (carimbo de tempo, com
   * separador "-", nunca ":", que o BullMQ 5.x rejeita em custom jobId) porque um jobId estável de job
   * já concluído (removeOnComplete) bloquearia o próximo ciclo. Retorna `false` se a fila não subiu.
   */
  async enfileirarScanTick(): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("enfileirarScanTick ignorado: fila indisponível.");
      return false;
    }
    try {
      await this.queue.add(JOB_SCAN_TICK, {}, { jobId: `scan-tick-${Date.now()}` });
      return true;
    } catch (err) {
      this.logger.warn(
        `Falha ao enfileirar scan-tick: ${err instanceof Error ? err.message : "erro"}`,
      );
      return false;
    }
  }

  /**
   * Enfileira uma varredura direcionada a UMA admissão (o consultor clicou "buscar VT"). jobId único
   * por disparo (carimbo de tempo) para não ser descartado como duplicado de um job já concluído.
   * Retorna `true` se enfileirou; `false` se a fila não subiu ou o `add` lançou.
   */
  async enfileirarScanAdmissao(admissaoId: string): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("enfileirarScanAdmissao ignorado: fila indisponível.");
      return false;
    }
    try {
      await this.queue.add(
        JOB_SCAN_ADMISSAO,
        { admissaoId } satisfies ScanAdmissaoJobData,
        { jobId: `scan-adm-${admissaoId}-${Date.now()}` },
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Falha ao enfileirar scan-admissao: ${err instanceof Error ? err.message : "erro"}`,
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
