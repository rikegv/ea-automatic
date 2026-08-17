import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ReconciliacaoDriveService } from "./reconciliacao-drive.service";

/**
 * AGENDADOR DA RECONCILIAÇÃO DO DRIVE (OST da concorrência no arquivamento, camada 3).
 *
 * O BURACO QUE ISTO FECHA. A reconciliação já sabia consertar sozinha os dois casos que importam:
 * prontuário que existe no Drive e o EA não sabe (liga o link) e régua fechada sem pasta (dispara o
 * arquivamento). O que faltava era GATILHO: o único chamador era o carregamento da tela de
 * Diagnóstico. Ninguém abre a tela, ninguém reconcilia. Foi por isso que o prontuário do caso de
 * 17/08/2026 ficou horas no Drive, com os 13 documentos dentro, enquanto o EA o mostrava como "sem
 * pasta", e é a razão de o diretor precisar alocar o endereço da pasta à mão de tempos em tempos.
 *
 * Agora a varredura acontece por si, na cadência abaixo. A trava de 5 minutos e a de execução única
 * continuam morando no `ReconciliacaoDriveService` (`reconciliarSeVencido`), então abrir a tela junto
 * com um ciclo agendado não dispara duas varreduras: quem chegar depois vira no-op.
 *
 * Padrão in-process (`setInterval`), o mesmo do ExpurgoService, do StagingPurgeService e do
 * PandapeSchedulerService. NÃO cria fila nova: a varredura é curta, sequencial e sem escrita pesada.
 *
 * O QUE ELE NÃO FAZ (§A.14/§A.26): não decide arquivamento, não recalcula régua, não toca veredito,
 * farol nem o cadastro de pasta-pai. Só chama, na hora certa, a mesma rotina que a tela já chamava.
 * §A.6: log de contagem, nunca PII.
 */
@Injectable()
export class ReconciliacaoDriveSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ReconciliacaoDriveScheduler");
  private timer?: NodeJS.Timeout;

  /**
   * Cadência de 10 min. Escolhida contra o custo real: cada ciclo só toca o Drive quando existe
   * admissão em pendência (a consulta devolve vazio no caso comum, e aí o ciclo não faz chamada
   * nenhuma). Ficar abaixo dos 5 min da trava interna seria desperdício, porque a trava recusaria.
   */
  private static readonly INTERVALO_MS = 10 * 60 * 1000;

  /**
   * Espera antes do primeiro ciclo. O boot já é o momento mais concorrido do backend, e a
   * reconciliação pode disparar arquivamento: entrar junto com a subida seria criar exatamente o
   * pico de concorrência que esta OST está eliminando.
   */
  private static readonly ATRASO_INICIAL_MS = 2 * 60 * 1000;

  constructor(private readonly reconciliacao: ReconciliacaoDriveService) {}

  onModuleInit(): void {
    const primeiro = setTimeout(
      () => void this.ciclo(),
      ReconciliacaoDriveSchedulerService.ATRASO_INICIAL_MS,
    );
    primeiro.unref?.();
    this.timer = setInterval(
      () => void this.ciclo(),
      ReconciliacaoDriveSchedulerService.INTERVALO_MS,
    );
    this.timer.unref?.();
    this.logger.log(
      `Reconciliação do Drive agendada (cadência ${ReconciliacaoDriveSchedulerService.INTERVALO_MS / 60000} min).`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Um ciclo. NUNCA lança: um erro aqui não pode derrubar o processo nem interromper a cadência, e a
   * própria `reconciliarSeVencido` já engole a falha da varredura. Este `catch` é o cinto de segurança
   * do timer.
   */
  private async ciclo(): Promise<void> {
    try {
      await this.reconciliacao.reconciliarSeVencido();
    } catch (e) {
      this.logger.warn(
        `Ciclo de reconciliação falhou: ${e instanceof Error ? e.name : "erro"}. A próxima cadência tenta de novo.`,
      );
    }
  }
}
