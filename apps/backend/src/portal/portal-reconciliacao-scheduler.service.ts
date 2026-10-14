import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PortalArquivamentoService } from "./portal-arquivamento.service";

/**
 * AGENDADOR DA REDE DE SEGURANÇA DO PRONTUÁRIO DO PORTAL (AJUSTE B da frente Prontuário Drive).
 *
 * O BURACO QUE ISTO FECHA. O documento do Portal sobe ao prontuário por dois caminhos vivos: o
 * gatilho do candidato (`portal-credencial`, quando o doc vira ENTREGUE) e, desde o AJUSTE A, a
 * validação humana. Mas um caminho novo de conclusão (uma reabertura, um fluxo futuro) pode deixar
 * ENTREGUE sem passar por nenhum dos dois, e aí o documento ficaria confirmado no balde e FORA do
 * prontuário, em silêncio. Esta varredura é a GARANTIA: de tempos em tempos, re-arquiva as admissões
 * vivas com documento do Portal confirmado. O arquivador deduplica por md5, então o que já está no
 * prontuário é no-op ("já estavam"): nunca duplica.
 *
 * Padrão in-process (`setInterval`), o MESMO do `ReconciliacaoDriveSchedulerService` da esteira, do
 * ExpurgoService e do StagingPurgeService. NÃO cria fila nem rota: a varredura é sequencial,
 * best-effort e inerte sem arme (`reconciliarVivos` sai cedo quando `armado()` é falso).
 *
 * CADÊNCIA (algumas vezes ao dia, não de minuto a minuto): a dedup do arquivador ainda BAIXA cada
 * objeto do balde para comparar o md5 (o md5 do metadado do GCS existe e deixaria a varredura barata,
 * mas usá-lo é otimização PROPOSTA, não pedida nesta OST). Enquanto a dedup baixa, a varredura tem
 * custo por objeto, então a cadência é espaçada de propósito: o gatilho do candidato e o AJUSTE A já
 * cobrem o caso comum na hora, e esta rede só precisa pegar o raro que escapou.
 *
 * O QUE ELE NÃO FAZ (§A.14/§A.26): não decide régua, não toca veredito, farol nem cadastro de pasta.
 * Só chama, na cadência, a mesma rotina de arquivamento já no ar (opção B, conta da esteira). §A.6:
 * log de contagem, nunca PII.
 */
@Injectable()
export class PortalReconciliacaoSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("PortalReconciliacaoScheduler");
  private timer?: NodeJS.Timeout;

  /** Cadência de 4 h (seis vezes ao dia). Espaçada porque a dedup atual baixa os objetos (ver topo). */
  private static readonly INTERVALO_MS = 4 * 60 * 60 * 1000;

  /** Atraso antes do primeiro ciclo: o boot é o momento mais concorrido; não entrar junto da subida. */
  private static readonly ATRASO_INICIAL_MS = 5 * 60 * 1000;

  constructor(private readonly arquivamento: PortalArquivamentoService) {}

  onModuleInit(): void {
    const primeiro = setTimeout(
      () => void this.ciclo(),
      PortalReconciliacaoSchedulerService.ATRASO_INICIAL_MS,
    );
    primeiro.unref?.();
    this.timer = setInterval(
      () => void this.ciclo(),
      PortalReconciliacaoSchedulerService.INTERVALO_MS,
    );
    this.timer.unref?.();
    this.logger.log(
      `Rede de segurança do prontuário do Portal agendada (cadência ${
        PortalReconciliacaoSchedulerService.INTERVALO_MS / 3_600_000
      } h).`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Um ciclo. NUNCA lança: um erro aqui não pode derrubar o processo nem interromper a cadência;
   * `reconciliarVivos` já é best-effort por admissão. Este `catch` é o cinto de segurança do timer.
   */
  private async ciclo(): Promise<void> {
    try {
      await this.arquivamento.reconciliarVivos();
    } catch (e) {
      this.logger.warn(
        `Ciclo da rede de segurança do prontuário falhou: ${e instanceof Error ? e.name : "erro"}. ` +
          `A próxima cadência tenta de novo.`,
      );
    }
  }
}
