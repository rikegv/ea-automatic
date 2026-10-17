import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ClicksignQueueService } from "./clicksign-queue.service";

/**
 * ─ RECONCILIAÇÃO DOS TERMINAIS DA CLICKSIGN: "ASSINADO NO CLICK, NÃO ASSINADO NA PLATAFORMA" ─────
 *
 * O tick normal (`ClicksignSchedulerService` a cada 2 min) só varre os envelopes
 * AGUARDANDO_ASSINATURA. Um envelope que o EA marcou CANCELADO (cancelamento best-effort do §A.5, que
 * o provedor não honra em `running`) ou EXPIRADO, e que os signatários assinaram MESMO ASSIM, FECHA na
 * Clicksign e SOME da varredura daqui: fica "assinado no Click, parado na nossa tela". Medido em
 * produção (17/10/2026): 5 envelopes CANCELADO estavam `closed` na Clicksign, com o PDF assinado
 * disponível e sem arquivamento no Drive.
 *
 * Este agendador só ENFILEIRA um `reconciliar-fechados`; o ciclo roda NO WORKER BullMQ (concorrência
 * 1, sob o limiter de requisição do `ClicksignApiService`) no `ClicksignSyncService.reconciliarFechados`,
 * exatamente como o tick. Assim nunca concorre com o tick nem estoura o teto do provedor. O miolo
 * (re-confere o terminal, arquiva o `closed` pela guarda §A.33, exclui declínio) vive no Sync.
 *
 * Espelha `ReconciliacaoReguaScheduler` e `DeParaClienteSchedulerService` (o padrão da casa para
 * varredura periódica no processo, sem rota interna nem cron na VM). As QUATRO condições:
 *  1. kill-switch por env (`CLICKSIGN_RECONCILIACAO=off`) nasce INERTE e diz isso UMA vez, no boot;
 *  2. a primeira passada é ATRASADA (não roda no `onModuleInit`, que sobe junto do resto);
 *  3. uma passada NÃO atropela a outra (trava de processo, pulos contados);
 *  4. falha NÃO derruba o processo (captura; promessa rejeitada sem catch mataria o Node 20).
 *
 * §A.6: o log é CONTAGEM e nada mais. Nunca CPF, nome, e-mail ou id de envelope.
 */
@Injectable()
export class ClicksignReconciliacaoScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ClicksignReconciliacao");
  private timerDaPrimeira?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  /** Trava de concorrência de PROCESSO (o backend é um processo só hoje). */
  private rodando = false;
  /** Passadas puladas por já haver uma viva. Número, nunca linha (§A.6). */
  private puladas = 0;

  /**
   * Cadência folgada: o alvo (terminais com envelope) é pequeno e muda raramente, e o caso que
   * reconcilia é a exceção do cancelamento best-effort. 30 min é barato e sobra.
   */
  static readonly INTERVALO_MS = 30 * 60 * 1000;
  /** Atraso da primeira passada: o backend sobe inteiro antes; 3 min é folga para o boot assentar. */
  static readonly ATRASO_DA_PRIMEIRA_MS = 3 * 60 * 1000;

  constructor(private readonly queue: ClicksignQueueService) {}

  onModuleInit(): void {
    if (process.env.CLICKSIGN_RECONCILIACAO === "off") {
      this.logger.log(
        "Reconciliação Clicksign INERTE: CLICKSIGN_RECONCILIACAO=off. Nenhuma varredura é agendada.",
      );
      return;
    }
    this.timerDaPrimeira = setTimeout(
      () => this.passada(),
      ClicksignReconciliacaoScheduler.ATRASO_DA_PRIMEIRA_MS,
    );
    this.timerDaPrimeira.unref?.();
    this.timer = setInterval(
      () => this.passada(),
      ClicksignReconciliacaoScheduler.INTERVALO_MS,
    );
    this.timer.unref?.();
    this.logger.log(
      "Reconciliação Clicksign agendada (cadência 30 min, primeira passada em 3 min; enfileira no worker).",
    );
  }

  onModuleDestroy(): void {
    if (this.timerDaPrimeira) clearTimeout(this.timerDaPrimeira);
    if (this.timer) clearInterval(this.timer);
  }

  /** Uma passada: enfileira o job (o ciclo roda no worker), com trava de concorrência e captura. */
  private passada(): void {
    if (this.rodando) {
      this.puladas += 1;
      this.logger.warn(
        `Reconciliação Clicksign PULADA: a passada anterior ainda está enfileirando ` +
          `(${this.puladas} pulada(s) desde a subida).`,
      );
      return;
    }
    this.rodando = true;
    void this.queue
      .enfileirarReconciliacao()
      .catch((err: unknown) => {
        this.logger.warn(
          `Falha ao enfileirar a reconciliação Clicksign: ${
            err instanceof Error ? err.message : String(err)
          }. A próxima passada tenta de novo.`,
        );
      })
      .finally(() => {
        this.rodando = false;
      });
  }
}
