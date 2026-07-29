import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { clicksignSchedulerEstado } from "../db/schema";
import { INTERVALO_MS, type EstadoScheduler } from "../domain/scheduler-clicksign";
import { ClicksignQueueService } from "./clicksign-queue.service";

const CHAVE = "clicksign";

/**
 * SCHEDULER DO TICK DA ASSINATURA (INT-4 / §A.5). Espelha `PandapeSchedulerService` e
 * `VtColetaSchedulerService`: em cadência fixa só ENFILEIRA um `poll-tick`; o ciclo em si roda NO
 * WORKER BullMQ (concorrência 1, sob o limiter) no `ClicksignSyncService`.
 *
 * POR QUE ELE EXISTE: até aqui o `poll-tick` só era enfileirado pelo `POST /internal/clicksign/tick`,
 * que dependia de um CRON externo (`infra/install-clicksign-cron.sh`) NUNCA instalado. Resultado: em
 * 28 dias o tick rodou 3 vezes, todas manuais, e nenhum contrato assinado seria detectado. Trazer o
 * agendamento para dentro do Nest elimina a dependência de infra e alinha a Clicksign aos outros dois
 * schedulers do sistema. A rota interna PERMANECE, agora como disparo manual/externo, não como único
 * caminho.
 *
 * É o dono do ESTADO do scheduler (a linha singleton `clicksign_scheduler_estado`): o liga/desliga
 * (lido a cada ciclo, então o toggle vale sem deploy), o heartbeat do "vivo" e o resultado do último
 * ciclo. §A.6: só contagens e instantes, jamais PII.
 *
 * Padrão in-process (setInterval); BullMQ é o consumidor. Tolerante a Redis/DB fora no boot: loga e
 * segue, os enfileiramentos viram no-op.
 */
@Injectable()
export class ClicksignSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ClicksignSchedulerService");
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly queue: ClicksignQueueService,
  ) {}

  onModuleInit(): void {
    // Não roda no boot (evita um pico a cada restart). O primeiro ciclo sai após uma cadência; a tela
    // de diagnóstico tem o disparo manual para quem quiser antecipar.
    this.timer = setInterval(() => void this.dispararCiclo(), INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      `Scheduler Clicksign inicializado (cadência ${INTERVALO_MS / 60000} min; enfileira no worker).`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Enfileira um ciclo (chamado pelo interval, pela rota interna e pelo disparo manual da tela). Só
   * enfileira se o scheduler estiver LIGADO. Nunca lança (o interval não pode derrubar o processo).
   */
  async dispararCiclo(): Promise<{ enfileirado: boolean; ligado: boolean }> {
    try {
      const ligado = await this.estaLigado();
      if (!ligado) return { enfileirado: false, ligado: false };
      await this.queue.enfileirarTick();
      return { enfileirado: true, ligado: true };
    } catch (err) {
      this.logger.warn(
        `Falha ao disparar ciclo da Clicksign: ${err instanceof Error ? err.message : "erro"}`,
      );
      return { enfileirado: false, ligado: false };
    }
  }

  // ── Estado (singleton) ──────────────────────────────────────────────────────
  /** Lê o liga/desliga. Default LIGADO se a linha ainda não existe. */
  async estaLigado(): Promise<boolean> {
    const linha = await this.db.query.clicksignSchedulerEstado.findFirst();
    return linha?.ligado ?? true;
  }

  /** Liga/desliga o scheduler. Persistido → vale no próximo ciclo, sem deploy. */
  async definirLigado(ligado: boolean): Promise<void> {
    await this.db
      .insert(clicksignSchedulerEstado)
      .values({ chave: CHAVE, ligado })
      .onConflictDoUpdate({
        target: clicksignSchedulerEstado.chave,
        set: { ligado, atualizadoEm: new Date() },
      });
    this.logger.log(`Scheduler Clicksign ${ligado ? "LIGADO" : "DESLIGADO"} (via controle).`);
  }

  /** Estado completo para a tela de diagnóstico. */
  async estado(): Promise<EstadoScheduler> {
    const l = await this.db.query.clicksignSchedulerEstado.findFirst();
    return {
      ligado: l?.ligado ?? true,
      ultimoCicloEm: l?.ultimoCicloEm ? new Date(l.ultimoCicloEm).toISOString() : null,
      ultimoCicloOkEm: l?.ultimoCicloOkEm ? new Date(l.ultimoCicloOkEm).toISOString() : null,
      varridas: l?.ultimoCicloVarridas ?? 0,
      assinados: l?.ultimoCicloAssinados ?? 0,
      expirados: l?.ultimoCicloExpirados ?? 0,
      falhas: l?.ultimoCicloFalhas ?? 0,
      nota: l?.ultimoCicloNota ?? null,
    };
  }

  /** Marca o INÍCIO de um ciclo (rodou, independente de sucesso). */
  async marcarInicioCiclo(): Promise<void> {
    const agora = new Date();
    await this.db
      .insert(clicksignSchedulerEstado)
      .values({ chave: CHAVE, ultimoCicloEm: agora })
      .onConflictDoUpdate({
        target: clicksignSchedulerEstado.chave,
        set: { ultimoCicloEm: agora, atualizadoEm: agora },
      });
  }

  /** Registra o RESULTADO de um ciclo concluído e bate o heartbeat (`ultimo_ciclo_ok_em`). */
  async registrarCiclo(r: {
    varridas: number;
    assinados: number;
    expirados: number;
    falhas: number;
    nota: string | null;
  }): Promise<void> {
    const agora = new Date();
    await this.db
      .insert(clicksignSchedulerEstado)
      .values({
        chave: CHAVE,
        ultimoCicloOkEm: agora,
        ultimoCicloVarridas: r.varridas,
        ultimoCicloAssinados: r.assinados,
        ultimoCicloExpirados: r.expirados,
        ultimoCicloFalhas: r.falhas,
        ultimoCicloNota: r.nota,
      })
      .onConflictDoUpdate({
        target: clicksignSchedulerEstado.chave,
        set: {
          ultimoCicloOkEm: agora,
          ultimoCicloVarridas: r.varridas,
          ultimoCicloAssinados: r.assinados,
          ultimoCicloExpirados: r.expirados,
          ultimoCicloFalhas: r.falhas,
          ultimoCicloNota: r.nota,
          atualizadoEm: agora,
        },
      });
  }
}
