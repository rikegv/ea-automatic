import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DIGAI_POLLING_INTERVALO_MS,
  DIGAI_TETO_REQ_POR_CICLO,
  pollingHabilitado,
  traduzirErroDeBanco,
} from "../../domain/digai";
import { DigaiFilaService } from "./digai-fila.service";

/**
 * ─ O SCHEDULER DA VARREDURA DO DIGAI: A CADENCIA VIVE DENTRO DO NEST, E NAO NO CRON ────────────
 *
 * ┌─ POR QUE IN-PROCESS, E A MEDIDA QUE DECIDIU ────────────────────────────────────────────────┐
 * │ O padrao da casa e `ClicksignSchedulerService`, e ele existe EXATAMENTE porque o cron externo │
 * │ NUNCA foi instalado: o `crontab` desta VM esta VAZIO, e a Clicksign rodou 3 ticks em 28 dias, │
 * │ todos manuais. Uma ingestao cuja cadencia depende de um passo de infra que ninguem deu e uma  │
 * │ ingestao que nao roda, e o pior e que ela nao FALHA: ela so nao acontece.                      │
 * │                                                                                               │
 * │ A ROTA INTERNA CONTINUA EXISTINDO (`POST /internal/digai/tick`), agora como disparo manual e  │
 * │ externo, e nunca como UNICO caminho. Ela respeita o mesmo portao daqui.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELE FAZ E SO ENFILEIRAR ─────────────────────────────────────────────────────────────┐
 * │ Ele NAO varre. Ele enfileira UM tick, e o ciclo roda no worker BullMQ, sob o limiter de 90/min │
 * │ e com concorrencia 1. Varrer aqui dentro furaria o teto de vazao do fornecedor, porque o       │
 * │ limiter e da FILA e nao do processo.                                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O TERCEIRO PORTAO DE INERCIA: `DIGAI_POLLING_ATIVO` ───────────────────────────────────────┐
 * │ Sem ele, o scheduler NAO DISPARA e a rota interna nao enfileira. E lido A CADA CICLO, e nao   │
 * │ uma vez no boot, para que ligar e desligar valha sem deploy. Ele e separado dos outros dois   │
 * │ porque decide coisa diferente: `DIGAI_API_TOKEN` e "pode sair para a rede",                    │
 * │ `DIGAI_INGESTAO_ATIVA` e "pode escrever no banco", e este e "pode varrer sozinho, em cadencia, │
 * │ sem ninguem pedir". Varrer 528 screenings a cada 15 minutos nao e a mesma decisao que escrever │
 * │ o que o webhook trouxer.                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NAO RODA NO BOOT (evita um pico a cada restart) e o timer e `unref`. Nada aqui lanca: o interval
 * nao pode derrubar o processo, que levaria junto Esteira, Admissoes e Clicksign.
 *
 * §A.6: o log e cadencia e desfecho, sem PII e sem nome de variavel de credencial com valor.
 */
@Injectable()
export class DigaiSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("DigaiSchedulerService");
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly fila: DigaiFilaService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.dispararCiclo(), DIGAI_POLLING_INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      `Scheduler do Digai inicializado (cadencia ${DIGAI_POLLING_INTERVALO_MS / 60000} min; ` +
        `polling ${this.ligado ? "LIGADO" : "DESLIGADO"}; enfileira no worker).`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** O portao do polling, lido do ambiente na borda e decidido pelo dominio puro. Fail-closed. */
  get ligado(): boolean {
    return pollingHabilitado({ DIGAI_POLLING_ATIVO: this.config.get<string>("DIGAI_POLLING_ATIVO") });
  }

  /**
   * Enfileira UM ciclo (pela cadencia ou pela rota interna). So enfileira com o portao aberto, e
   * NUNCA lanca: tolerante a Redis fora, que no boot e um estado normal e nao um incidente.
   */
  async dispararCiclo(): Promise<{ enfileirado: boolean; ligado: boolean }> {
    if (!this.ligado) return { enfileirado: false, ligado: false };
    try {
      /*
       * ─ NAO SE EMPILHA CICLO SOBRE CICLO (veto do `seguranca`, 29/09) ───────────────────────────
       *
       * O tick nao tem `jobId` (chave fixa ficaria retida no Redis e bloquearia o ciclo seguinte),
       * entao nada deduplicava e o scheduler somava um ciclo a cada 15 min sobre um que ainda nao
       * acabou: a fila crescia monotonicamente. O orcamento por ciclo limita o TAMANHO de cada um;
       * esta guarda impede a SOMA deles.
       */
      if (await this.fila.temCicloEmAndamento()) {
        /*
         * A FRASE NAO DIZ "O CICLO ANTERIOR", E ISSO E CORRECAO DE DIAGNOSTICO (auditoria 29/09).
         * A fila e COMPARTILHADA entre o evento do webhook, o tick e a pagina, e a trava conta a
         * fila INTEIRA: um job de EVENTO em backoff (ate ~15 min em `delayed`) suprime o ciclo, e
         * a linha antiga afirmava, nesse caso, uma coisa FALSA. Fail-closed continua certo (na
         * duvida, nao empilhar), mas o log tem de descrever o que foi medido, que e "ha job
         * pendente", e nao inferir de que tipo ele e.
         */
        this.logger.log(
          "Ciclo do Digai NAO enfileirado: a fila do Digai ainda tem job pendente " +
            "(ciclo anterior drenando ou evento do webhook em backoff).",
        );
        return { enfileirado: false, ligado: true };
      }
      const enfileirado = await this.fila.enfileirarTick(1, DIGAI_TETO_REQ_POR_CICLO);
      return { enfileirado, ligado: true };
    } catch (err) {
      this.logger.warn(`Falha ao disparar o ciclo do Digai: ${traduzirErroDeBanco(err)}`);
      return { enfileirado: false, ligado: true };
    }
  }
}
