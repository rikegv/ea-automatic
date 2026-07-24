import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { pandapeSchedulerEstado } from "../db/schema";
import { SCHEDULER_INTERVALO_MS, type EstadoScheduler } from "../domain/scheduler-pandape";
import { PandapeQueueService } from "./pandape-queue.service";

/**
 * SCHEDULER DE RE-CONSULTA DO PANDAPÉ (OST scheduler). Fecha o buraco de o pull só disparar na
 * liberação: o candidato pode anexar documento DEPOIS, e o Pandapé não avisa (só manda evento de
 * ETAPA). Em cadência fixa (12 min, §`SCHEDULER_INTERVALO_MS`) este serviço só ENFILEIRA um
 * `scheduler-tick`; o ciclo em si roda NO WORKER BullMQ (sob o limiter, concorrência 1 → nunca N
 * chamadas simultâneas), no `PandapeSyncService`.
 *
 * É também o dono do ESTADO do scheduler (a linha singleton `pandape_scheduler_estado`): o liga/
 * desliga do Bloco 5 (lido a cada ciclo, então o toggle vale sem deploy), o heartbeat do "vivo" e o
 * resultado do último ciclo (Bloco 4). §A.6: só contagens e instantes, jamais PII.
 *
 * Padrão in-process (setInterval) igual a ExpurgoService/StagingPurgeService; BullMQ continua sendo o
 * consumidor. Tolerante a Redis/DB fora no boot: loga e segue, os enfileiramentos viram no-op.
 */
@Injectable()
export class PandapeSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("PandapeSchedulerService");
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly queue: PandapeQueueService,
  ) {}

  onModuleInit(): void {
    // Não roda no boot (evita um pico de Pandapé a cada restart do backend). O primeiro ciclo sai
    // após uma cadência; a tela de diagnóstico tem o disparo manual para quem quiser antecipar.
    this.timer = setInterval(() => void this.dispararCiclo(), SCHEDULER_INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      `Scheduler Pandapé inicializado (cadência ${SCHEDULER_INTERVALO_MS / 60000} min; enfileira no worker).`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Enfileira um ciclo (chamado pelo interval e pelo disparo manual da tela). Só enfileira se o
   * scheduler estiver LIGADO — o desligado é estado deliberado do diretor, não faz sentido varrer.
   * Retorna se enfileirou. Nunca lança (o interval não pode derrubar o processo).
   */
  async dispararCiclo(): Promise<{ enfileirado: boolean; ligado: boolean }> {
    try {
      const ligado = await this.estaLigado();
      if (!ligado) return { enfileirado: false, ligado: false };
      const ok = await this.queue.enfileirarSchedulerTick();
      return { enfileirado: ok, ligado: true };
    } catch (err) {
      this.logger.warn(
        `Falha ao disparar ciclo do scheduler: ${err instanceof Error ? err.message : "erro"}`,
      );
      return { enfileirado: false, ligado: false };
    }
  }

  // ── Estado (singleton) ──────────────────────────────────────────────────────
  /** Lê o liga/desliga. Default LIGADO se a linha ainda não existe (garantida pela migration/seed). */
  async estaLigado(): Promise<boolean> {
    const linha = await this.db.query.pandapeSchedulerEstado.findFirst();
    return linha?.ligado ?? true;
  }

  /** Liga/desliga o scheduler (Bloco 5). Persistido → vale no próximo ciclo, sem deploy. */
  async definirLigado(ligado: boolean): Promise<void> {
    await this.db
      .insert(pandapeSchedulerEstado)
      .values({ chave: "pandape", ligado })
      .onConflictDoUpdate({
        target: pandapeSchedulerEstado.chave,
        set: { ligado, atualizadoEm: new Date() },
      });
    this.logger.log(`Scheduler Pandapé ${ligado ? "LIGADO" : "DESLIGADO"} (via controle).`);
  }

  /** Estado completo para a tela de diagnóstico (Bloco 4). */
  async estado(): Promise<EstadoScheduler> {
    const l = await this.db.query.pandapeSchedulerEstado.findFirst();
    return {
      ligado: l?.ligado ?? true,
      ultimoCicloEm: l?.ultimoCicloEm ? new Date(l.ultimoCicloEm).toISOString() : null,
      ultimoCicloOkEm: l?.ultimoCicloOkEm ? new Date(l.ultimoCicloOkEm).toISOString() : null,
      varridas: l?.ultimoCicloVarridas ?? 0,
      novos: l?.ultimoCicloNovos ?? 0,
      falhas: l?.ultimoCicloFalhas ?? 0,
      abortado: l?.ultimoCicloAbortado ?? false,
      nota: l?.ultimoCicloNota ?? null,
    };
  }

  /** Marca o INÍCIO de um ciclo (rodou, independente de sucesso). */
  async marcarInicioCiclo(): Promise<void> {
    await this.db
      .insert(pandapeSchedulerEstado)
      .values({ chave: "pandape", ultimoCicloEm: new Date() })
      .onConflictDoUpdate({
        target: pandapeSchedulerEstado.chave,
        set: { ultimoCicloEm: new Date(), atualizadoEm: new Date() },
      });
  }

  /**
   * Registra o RESULTADO de um ciclo concluído (Bloco 4) e bate o heartbeat (`ultimo_ciclo_ok_em`).
   * Um ciclo abortado pelo teto de IA (Bloco 3) TAMBÉM bate o heartbeat (o loop está vivo, só foi
   * freado); o flag `abortado` é o que fica visível na tela.
   */
  async registrarCiclo(r: {
    varridas: number;
    novos: number;
    falhas: number;
    abortado: boolean;
    nota: string | null;
  }): Promise<void> {
    const agora = new Date();
    await this.db
      .insert(pandapeSchedulerEstado)
      .values({
        chave: "pandape",
        ultimoCicloOkEm: agora,
        ultimoCicloVarridas: r.varridas,
        ultimoCicloNovos: r.novos,
        ultimoCicloFalhas: r.falhas,
        ultimoCicloAbortado: r.abortado,
        ultimoCicloNota: r.nota,
      })
      .onConflictDoUpdate({
        target: pandapeSchedulerEstado.chave,
        set: {
          ultimoCicloOkEm: agora,
          ultimoCicloVarridas: r.varridas,
          ultimoCicloNovos: r.novos,
          ultimoCicloFalhas: r.falhas,
          ultimoCicloAbortado: r.abortado,
          ultimoCicloNota: r.nota,
          atualizadoEm: agora,
        },
      });
  }

  /**
   * Admissões VIVAS de origem Pandapé, alvo do ciclo: têm `id_precollaborator` (origem ATS) e farol
   * vivo COM régua (EM_ADMISSAO / BANCO_AGUARDAR). Exclui, por construção:
   *  - concluídas (ADMISSAO_CONCLUIDA), declinadas/rescindidas e o histórico importado (sem
   *    id_precollaborator);
   *  - manuais/wizard (sem id_precollaborator);
   *  - pré-admissões AGUARDANDO_LIBERACAO: ainda não têm cliente+cargo, logo não têm régua onde
   *    mapear documento — o pull delas acontece na liberação, não aqui.
   * §A.6: só ids técnicos (admissão + idPreCollaborator), nada de PII.
   */
  async admissoesVivasPandape(): Promise<Array<{ admissaoId: string; idPrecollaborator: string }>> {
    const rows = (await this.db.execute(sql`
      SELECT a.id AS admissao_id, ip.id_precollaborator AS id_precollaborator
      FROM admissoes a
      JOIN integracao_pandape ip ON ip.admissao_id = a.id
      WHERE ip.id_precollaborator IS NOT NULL
        AND a.farol_global IN ('EM_ADMISSAO', 'BANCO_AGUARDAR')
    `)) as unknown as Array<{ admissao_id: string; id_precollaborator: string }>;
    return rows.map((r) => ({ admissaoId: r.admissao_id, idPrecollaborator: r.id_precollaborator }));
  }
}
