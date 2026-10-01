import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { mensagemDoErro } from "../ingestao-pandape/ingestao-ciclo";
import { DeParaClienteService } from "./depara-cliente.service";
import { PlanilhaVivaService, VARIAVEL_DO_ARQUIVO_DA_PLANILHA } from "./planilha-viva.service";

/**
 * ─ A CADÊNCIA DA SINCRONIZAÇÃO DO DE/PARA DE CLIENTE: DE HORA EM HORA, DENTRO DO PROCESSO ──────
 *
 * Decisão do diretor (01/10/2026): a planilha viva do time passa a ser lida automaticamente, de hora
 * em hora, em vez de só sob demanda pela tela de curadoria.
 *
 * ┌─ POR QUE AGENDADOR NO PROCESSO, E NÃO CRON NA VM ───────────────────────────────────────────┐
 * │ A rota da sincronização está atrás do `JwtAuthGuard` global e do `MenuGuard` do menu ADMIN, e │
 * │ um cron da VM NÃO TEM SESSÃO: ele não alcança a rota. As duas saídas eram abrir uma rota      │
 * │ interna com `X-Internal-Token` mais um cron (mais peças, e a lição do cron da Clicksign que   │
 * │ nunca foi instalado) ou o agendador no processo, que é o padrão desta casa para varredura     │
 * │ periódica: `RetencaoCandidatosService`, `ExpurgoService`, `ReconciliacaoDriveScheduler`.      │
 * │                                                                                              │
 * │ O PADRÃO DA CASA GANHA TAMBÉM POR UM MOTIVO DE SEGURANÇA: rota interna é superfície nova, e   │
 * │ rota sem guard nasce alcançável por qualquer coisa que rode na VM. Aqui não há rota nova.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS QUATRO CONDIÇÕES DESTE ARQUIVO, E NENHUMA DELAS É DE ESTILO ────────────────────────────┐
 * │ 1. NASCE INERTE sem `AS_PLANILHA_VIVA_FILE_ID`: o intervalo nem é armado, e o log diz isso     │
 * │    UMA vez, no boot. É a mesma porta da varredura do Pandapé, que não sobe sem a data de       │
 * │    corte: agendador armado sobre porta fechada é uma falha por hora, para sempre, e quem opera │
 * │    aprende a ignorar o aviso (foi o argumento do sal da marca de pasta);                       │
 * │ 2. A PRIMEIRA PASSADA É ATRASADA, e não roda no `onModuleInit`. O molde do                     │
 * │    `RetencaoCandidatosService` chama a varredura direto no init porque lá ela é um `update`;   │
 * │    aqui ela BAIXA 1,9 MB do Drive e fala com o `ai-service`, que é OUTRO processo e sobe junto │
 * │    com este. No boot, isso atrasa o start e a primeira passada falha à toa enquanto o vizinho  │
 * │    não respondeu;                                                                              │
 * │ 3. UMA PASSADA NÃO ATROPELA A OUTRA. Uma hora é folgado para 3.560 linhas, mas o dia em que o  │
 * │    Drive ficar lento duas leituras concorrentes escreveriam o MESMO de/para ao mesmo tempo, e  │
 * │    a segunda decidiria sobre o estado que a primeira ainda está mudando. A que chega durante   │
 * │    uma passada viva PULA, e o pulo é CONTADO: sem a contagem, uma leitura que passou a demorar │
 * │    mais de uma hora viraria silêncio, indistinguível de agendador parado;                      │
 * │ 4. FALHA NÃO DERRUBA NADA E NÃO APAGA NADA. A sincronização já preserva o de/para gravado      │
 * │    quando a leitura falha (503 transitório, 422 de cabeçalho, 413 de tamanho), e aqui o que se │
 * │    acrescenta é a CAPTURA: promessa rejeitada sem `catch` é `unhandledRejection`, e no Node 20 │
 * │    isso MATA O PROCESSO. O serviço sobe sob `systemd --user` com restart automático, então uma │
 * │    falha de planilha viraria CRASH-LOOP levando junto Esteira, Admissões e Clicksign, que não  │
 * │    têm nada a ver com A&S. É a lição já escrita em `retencao-candidatos.service.ts`.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o log daqui é CONTAGEM e RÓTULO. A contagem da passada quem escreve é a própria
 * sincronização (linhas lidas, chaves, criadas, atualizadas, malformadas, vazias, ambíguas); daqui
 * saem o número de passadas puladas e a MENSAGEM do erro pelo funil `mensagemDoErro`, nunca o objeto
 * do erro (o `detail` do Postgres carrega o valor que violou a restrição e a `query` carrega os
 * parâmetros), nunca o corpo da resposta do provedor e nunca nome de cliente.
 */
@Injectable()
export class DeParaClienteSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("DeParaClienteScheduler");
  private timerDaPrimeira?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  /**
   * A TRAVA DE CONCORRÊNCIA, e ela é de PROCESSO, não de banco.
   *
   * ELA NÃO PROTEGE CONTRA DOIS PROCESSOS, e isso está declarado: hoje o backend é um processo só, e
   * a segunda instância é um problema que não existe. No dia em que existir, a trava que vale é a do
   * banco (um `advisory lock` ou uma linha de controle), e esta linha é onde se lê que ela falta.
   */
  private rodando = false;
  /** Quantas passadas pularam por já haver uma viva. Número, nunca linha (§A.6). */
  private puladas = 0;

  /** De hora em hora, a mesma cadência do expurgo e da retenção de A&S. */
  static readonly INTERVALO_MS = 60 * 60 * 1000;
  /**
   * O ATRASO DA PRIMEIRA PASSADA, e o número vem do modo como esta casa publica: os três serviços
   * (backend, frontend e `ai-service`) são reiniciados juntos. Cinco minutos é folga para o vizinho
   * estar no ar, e o custo de esperar é zero: o de/para que já está no banco continua servindo a
   * proposta enquanto isso.
   */
  static readonly ATRASO_DA_PRIMEIRA_MS = 5 * 60 * 1000;

  constructor(
    private readonly dePara: DeParaClienteService,
    private readonly planilha: PlanilhaVivaService,
  ) {}

  onModuleInit(): void {
    /*
     * A PORTA FECHADA É CONFERIDA AQUI, E NÃO DENTRO DA PASSADA. A sincronização também responde
     * INERTE sozinha (ela pergunta à borda antes de ler), e as duas fechaduras são de propósito: a
     * de lá protege a rota da tela, esta impede o agendador de nascer armado sobre porta fechada e
     * de escrever uma linha de log por hora, para sempre, que é como um aviso real se perde.
     */
    if (!this.planilha.estaAtiva()) {
      this.logger.log(
        `Sincronização do de/para de cliente INERTE: ${VARIAVEL_DO_ARQUIVO_DA_PLANILHA} não ` +
          "configurada. Nenhuma leitura é agendada e nada é escrito.",
      );
      return;
    }
    /*
     * O `setTimeout` DA PRIMEIRA E O `setInterval` DA CADÊNCIA SÃO DOIS RELÓGIOS, de propósito: a
     * primeira passada é adiada, e a cadência segue de hora em hora a partir do boot, sem herdar o
     * atraso. Os dois com `unref`, como o resto da casa: timer que não deixa o processo morrer
     * transforma um `SIGTERM` de deploy em um processo pendurado.
     */
    this.timerDaPrimeira = setTimeout(
      () => this.passada(),
      DeParaClienteSchedulerService.ATRASO_DA_PRIMEIRA_MS,
    );
    this.timerDaPrimeira.unref?.();
    this.timer = setInterval(
      () => this.passada(),
      DeParaClienteSchedulerService.INTERVALO_MS,
    );
    this.timer.unref?.();
    this.logger.log(
      "Sincronização do de/para de cliente agendada (cadência 60 min, primeira passada em 5 min).",
    );
  }

  onModuleDestroy(): void {
    if (this.timerDaPrimeira) clearTimeout(this.timerDaPrimeira);
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * UMA PASSADA, com a trava de concorrência e a captura.
   *
   * ELA NÃO DEVOLVE PROMESSA DE PROPÓSITO (o retorno é `void`): quem a chama são os dois timers, que
   * não têm como aguardar nada, e um método `async` aqui convidaria um `void this.passada()` solto no
   * chamador, que é exatamente a forma do `unhandledRejection` que o bloco do topo descreve.
   *
   * A CONTAGEM DA PASSADA QUEM ESCREVE É A SINCRONIZAÇÃO, e não este arquivo: ela já loga os doze
   * contadores dela, e repetir aqui criaria duas linhas de log por hora dizendo a mesma coisa com
   * números que podem divergir na próxima mudança.
   */
  private passada(): void {
    if (this.rodando) {
      this.puladas += 1;
      /*
       * `warn`, E NÃO `log`: pular uma vez é folga de relógio, pular sempre é uma leitura que passou
       * a demorar mais de uma hora, e isso precisa aparecer. O TOTAL vai na linha porque é ele que
       * responde "é sempre a mesma coisa?", que é a pergunta de quem opera.
       */
      this.logger.warn(
        `Sincronização do de/para de cliente PULADA: a passada anterior ainda está rodando ` +
          `(${this.puladas} pulada(s) desde a subida).`,
      );
      return;
    }
    this.rodando = true;
    void this.dePara
      .sincronizar()
      .catch((err: unknown) => {
        /*
         * A SINCRONIZAÇÃO JÁ NÃO LANÇA POR FALHA DE LEITURA (ela devolve a família no resumo e
         * preserva o de/para gravado), então o que chega aqui é falha de BANCO. Ela vira ERRO
         * visível, nada é apagado, e a hora seguinte tenta de novo.
         *
         * §A.6: só a MENSAGEM, pelo mesmo funil do ciclo da ingestão e da retenção de A&S.
         */
        this.logger.error(
          `Falha na sincronização do de/para de cliente: ${mensagemDoErro(err)}. ` +
            "Nenhuma tradução foi apagada, e a próxima passada tenta de novo.",
        );
      })
      .finally(() => {
        /*
         * O `finally` É A TRAVA INTEIRA: liberar a trava dentro do `then` deixaria a flag presa em
         * `true` para sempre no primeiro erro, e o agendador pararia de rodar em silêncio, sem
         * nenhuma linha de log dizendo que parou. O estado "parado para sempre" é pior que a falha.
         */
        this.rodando = false;
      });
  }
}
