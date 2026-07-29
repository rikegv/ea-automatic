import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { vtColetaSchedulerEstado } from "../db/schema";
import { INTERVALO_MS, type EstadoScheduler } from "../domain/scheduler-vt-coleta";
import { VtColetaQueueService } from "./vt-coleta-queue.service";

const CHAVE = "vt-coleta";

/**
 * SCHEDULER DA COLETA DE VT (§A.17 etapa 3 / INT-2). Espelha o `PandapeSchedulerService`: em cadência
 * fixa (15 min) só ENFILEIRA um `scan-tick`; o ciclo em si roda NO WORKER BullMQ (concorrência 1, sob
 * o limiter) no `VtColetaService`.
 *
 * É o dono do ESTADO do scheduler (a linha singleton `vt_coleta_scheduler_estado`): o liga/desliga
 * (lido a cada ciclo, então o toggle vale sem deploy), o heartbeat do "vivo" e o resultado do último
 * ciclo. §A.6: só contagens e instantes, jamais PII.
 *
 * Padrão in-process (setInterval); BullMQ é o consumidor. Tolerante a Redis/DB fora no boot: loga e
 * segue, os enfileiramentos viram no-op.
 */
@Injectable()
export class VtColetaSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("VtColetaSchedulerService");
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly queue: VtColetaQueueService,
  ) {}

  onModuleInit(): void {
    // Não roda no boot (evita um pico a cada restart). O primeiro ciclo sai após uma cadência; a tela
    // de diagnóstico tem o disparo manual para quem quiser antecipar.
    this.timer = setInterval(() => void this.dispararCiclo(), INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      `Scheduler de coleta de VT inicializado (cadência ${INTERVALO_MS / 60000} min; enfileira no worker).`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Enfileira um ciclo (chamado pelo interval e pelo disparo manual). Só enfileira se o scheduler
   * estiver LIGADO. Nunca lança (o interval não pode derrubar o processo).
   */
  async dispararCiclo(): Promise<{ enfileirado: boolean; ligado: boolean }> {
    try {
      const ligado = await this.estaLigado();
      if (!ligado) return { enfileirado: false, ligado: false };
      const ok = await this.queue.enfileirarScanTick();
      return { enfileirado: ok, ligado: true };
    } catch (err) {
      this.logger.warn(
        `Falha ao disparar ciclo da coleta de VT: ${err instanceof Error ? err.message : "erro"}`,
      );
      return { enfileirado: false, ligado: false };
    }
  }

  // ── Estado (singleton) ──────────────────────────────────────────────────────
  /** Lê o liga/desliga. Default LIGADO se a linha ainda não existe. */
  async estaLigado(): Promise<boolean> {
    const linha = await this.db.query.vtColetaSchedulerEstado.findFirst();
    return linha?.ligado ?? true;
  }

  /** Liga/desliga o scheduler. Persistido → vale no próximo ciclo, sem deploy. */
  async definirLigado(ligado: boolean): Promise<void> {
    await this.db
      .insert(vtColetaSchedulerEstado)
      .values({ chave: CHAVE, ligado })
      .onConflictDoUpdate({
        target: vtColetaSchedulerEstado.chave,
        set: { ligado, atualizadoEm: new Date() },
      });
    this.logger.log(`Scheduler de coleta de VT ${ligado ? "LIGADO" : "DESLIGADO"} (via controle).`);
  }

  /** Estado completo para a tela de diagnóstico. */
  async estado(): Promise<EstadoScheduler> {
    const l = await this.db.query.vtColetaSchedulerEstado.findFirst();
    return {
      ligado: l?.ligado ?? true,
      ultimoCicloEm: l?.ultimoCicloEm ? new Date(l.ultimoCicloEm).toISOString() : null,
      ultimoCicloOkEm: l?.ultimoCicloOkEm ? new Date(l.ultimoCicloOkEm).toISOString() : null,
      varridas: l?.ultimoCicloVarridas ?? 0,
      novos: l?.ultimoCicloNovos ?? 0,
      semAdmissao: l?.ultimoCicloSemAdmissao ?? 0,
      falhas: l?.ultimoCicloFalhas ?? 0,
      abortado: l?.ultimoCicloAbortado ?? false,
      nota: l?.ultimoCicloNota ?? null,
    };
  }

  /** Marca o INÍCIO de um ciclo (rodou, independente de sucesso). */
  async marcarInicioCiclo(): Promise<void> {
    const agora = new Date();
    await this.db
      .insert(vtColetaSchedulerEstado)
      .values({ chave: CHAVE, ultimoCicloEm: agora })
      .onConflictDoUpdate({
        target: vtColetaSchedulerEstado.chave,
        set: { ultimoCicloEm: agora, atualizadoEm: agora },
      });
  }

  /** Registra o RESULTADO de um ciclo concluído e bate o heartbeat (`ultimo_ciclo_ok_em`). */
  async registrarCiclo(r: {
    varridas: number;
    novos: number;
    semAdmissao: number;
    falhas: number;
    abortado: boolean;
    nota: string | null;
  }): Promise<void> {
    const agora = new Date();
    await this.db
      .insert(vtColetaSchedulerEstado)
      .values({
        chave: CHAVE,
        ultimoCicloOkEm: agora,
        ultimoCicloVarridas: r.varridas,
        ultimoCicloNovos: r.novos,
        ultimoCicloSemAdmissao: r.semAdmissao,
        ultimoCicloFalhas: r.falhas,
        ultimoCicloAbortado: r.abortado,
        ultimoCicloNota: r.nota,
      })
      .onConflictDoUpdate({
        target: vtColetaSchedulerEstado.chave,
        set: {
          ultimoCicloOkEm: agora,
          ultimoCicloVarridas: r.varridas,
          ultimoCicloNovos: r.novos,
          ultimoCicloSemAdmissao: r.semAdmissao,
          ultimoCicloFalhas: r.falhas,
          ultimoCicloAbortado: r.abortado,
          ultimoCicloNota: r.nota,
          atualizadoEm: agora,
        },
      });
  }
}
