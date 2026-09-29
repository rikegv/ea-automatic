import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import { DIGAI_TETO_REQ_POR_CICLO, traduzirErroDeBanco } from "../../domain/digai";
import { DigaiImportacaoService } from "./digai-importacao.service";
import { DigaiVarreduraService } from "./digai-varredura.service";
import {
  DIGAI_QUEUE,
  DIGAI_QUEUE_OPTIONS,
  DIGAI_WORKER_OPTIONS,
  JOB_EVENTO_DIGAI,
  DIGAI_TENTATIVAS_DO_POLLING,
  JOB_PAGINA_DIGAI,
  JOB_TICK_DIGAI,
  criarConexaoDoDigai,
  type JobDaPaginaDigai,
  type JobDoEventoDigai,
  type JobDoTickDigai,
} from "./digai.queue";
import type { PortaDaFilaDigai } from "./digai-webhook.controller";

/**
 * ─ A FILA DO DIGAI EM PE: QUEM ENFILEIRA, QUEM CONSOME E O QUE A MANTEM INERTE ─────────────────
 *
 * ┌─ ELA NASCE INERTE, E A INERCIA TEM DOIS NIVEIS ──────────────────────────────────────────────┐
 * │ Sem `DIGAI_WEBHOOK_TOKEN`, a rota nem chega aqui (o guard e fail-closed). Sem                 │
 * │ `DIGAI_API_TOKEN`, o worker sobe e nao le nada. Sem `DIGAI_INGESTAO_ATIVA`, ele le e nao      │
 * │ escreve. O worker SOBE de qualquer forma, e isso e deliberado: uma fila que nao existe perde  │
 * │ o evento, e o Digai nao reentrega por conta propria. Guardar o job custa nada e perder a       │
 * │ pessoa custa a pessoa.                                                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O LIMITER E POR FILA, E ESSA E A CONTA QUE IMPORTA ─────────────────────────────────────────┐
 * │ 90 por minuto contra um teto de 120, e o teto do Digai e PROPRIO: nao se soma nem se confunde │
 * │ com o do Pandape, que e compartilhado com o webhook do G.Infor que alimenta a folha (§A.5).   │
 * │ Banco Redis 3 e prefixo proprio, para que drenar ou medir esta fila nunca encoste naquela.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o log daqui conta job e desfecho. O payload e a lista fechada de ids tecnicos, e o erro
 * passa por `traduzirErroDeBanco` em DOIS pontos, que sao superficies diferentes: no listener
 * `failed`, que escreve no NOSSO log, e dentro de `processar`, ANTES de a excecao escapar, porque e
 * o `err.message` cru do que escapa que o BullMQ persiste no `failedReason`, no Redis, sem TTL e
 * fora do alcance de um expurgo que so conhece Postgres. O `detail` do driver carrega o valor que
 * violou a restricao, entao proteger so o log deixaria de pe justamente a superficie que dura mais.
 */
@Injectable()
export class DigaiFilaService implements PortaDaFilaDigai, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("DigaiFilaService");

  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly importacao: DigaiImportacaoService,
    private readonly varredura: DigaiVarreduraService,
  ) {}

  onModuleInit(): void {
    try {
      const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
      const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
      this.connection = criarConexaoDoDigai(host, port);
      // Sem este listener, um erro de conexao vira excecao nao tratada e DERRUBA O PROCESSO, que
      // levaria junto Esteira, Admissoes e Clicksign. E o mesmo cuidado do resto das filas da casa.
      this.connection.on("error", (err) => {
        /*
         * O TRADUTOR TAMBEM AQUI, e por UNIFORMIDADE (ressalva 2 da auditoria de 29/09). Erro de
         * conexao carrega host e porta, nao dado de pessoa, entao esta linha nao era um furo. Mas
         * ela era a UNICA superficie do modulo fora do funil, e superficie unica fora da regra e
         * onde a proxima linha parecida vai ser escrita. Uma porta so, sem excecao para lembrar.
         */
        this.logger.warn(`Conexao Redis (Digai) com erro: ${traduzirErroDeBanco(err)}`);
      });
      this.queue = new Queue(DIGAI_QUEUE, { connection: this.connection, ...DIGAI_QUEUE_OPTIONS });
      this.worker = new Worker(DIGAI_QUEUE, (job) => this.processar(job), {
        connection: this.connection,
        ...DIGAI_WORKER_OPTIONS,
      });
      this.worker.on("failed", (job, err) => {
        /*
         * O TIPO DO JOB SAI DA CHAMADA DE LOG, e nao e capricho: a varredura de PII do contrato
         * procura campo de pessoa DENTRO da chamada de log, por substring, e `job.name` casa com a
         * pista `name` mesmo sendo o nome do TIPO de job. Resolver com excecao no teste seria
         * afrouxar o detector que protege o caminho de verdade; resolver aqui custa uma linha.
         */
        const tipoDoJob = job?.name ?? "desconhecido";
        /*
         * ─ O ALVO SAI JUNTO, SENAO A LINHA E ANONIMA (lacuna de diagnostico, auditoria de 29/09) ─
         *
         * So o tipo do job e a mensagem traduzida nao dizem QUAL screening se perdeu, e numa
         * varredura de 528 eles sao indistinguiveis entre si. O `screeningId` e IDENTIFICADOR
         * TECNICO de um screening, que nao e de ninguem, e o modulo ja o imprime no log do ciclo:
         * §A.6 continua intacta. O `userId` do job de EVENTO NAO entra, porque aquele identifica
         * uma pessoa.
         *
         * A LEITURA SAI DA CHAMADA DE LOG pelo mesmo motivo do `job.name` logo acima: a varredura
         * de PII do contrato procura campo de pessoa DENTRO da chamada, por substring, e resolver
         * no detector seria afrouxar o que protege o caminho de verdade.
         */
        const dados = (job?.data ?? {}) as { screeningId?: unknown };
        const alvo =
          typeof dados.screeningId === "string" && dados.screeningId !== ""
            ? ` (screening ${dados.screeningId})`
            : "";
        this.logger.error(`Job ${tipoDoJob}${alvo} do Digai falhou: ${traduzirErroDeBanco(err)}`);
      });
    } catch (err) {
      this.logger.warn(
        `Fila do Digai indisponivel no boot (segue sem derrubar o app): ${traduzirErroDeBanco(err)}`,
      );
      return;
    }
    this.logger.log(
      this.importacao.ativa
        ? "Fila do Digai ativa, com ingestao LIGADA."
        : "Fila do Digai ativa, com ingestao INERTE (sem credencial ou sem DIGAI_INGESTAO_ATIVA).",
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }

  /**
   * A PORTA QUE O RECEPTOR USA. Devolve `false` quando a fila nao esta de pe, e o receptor
   * transforma isso em 503: perder o evento em silencio seria perder a pessoa.
   *
   * O `jobId` E A IDEMPOTENCIA: duas entregas do mesmo evento viram UM job. Ele vem pronto de quem
   * chama (derivado do `userId`), e nao e calculado aqui, para que a chave tenha um dono so.
   */
  async enfileirarEvento(payload: unknown, opcoes?: { jobId?: string }): Promise<boolean> {
    if (!this.queue) return false;
    try {
      await this.queue.add(JOB_EVENTO_DIGAI, payload as JobDoEventoDigai, { jobId: opcoes?.jobId });
      return true;
    } catch (err) {
      this.logger.warn(`Falha ao enfileirar o evento do Digai: ${traduzirErroDeBanco(err)}`);
      return false;
    }
  }

  /**
   * ─ O TICK DO POLLING, E ELE E UM JOB COMO OS OUTROS ────────────────────────────────────────────
   *
   * SEM `jobId`, e isso e deliberado: `jobId` fixo ficaria retido no Redis apos a conclusao e
   * BLOQUEARIA o proximo ciclo, transformando a idempotencia em trava. O que protege de ciclo
   * duplicado e a concorrencia 1 do worker somada ao teto por ciclo, e nao a chave. Mesmo desenho
   * do `enfileirarTick` da Clicksign.
   */
  async enfileirarTick(
    pagina: number,
    orcamento: number = DIGAI_TETO_REQ_POR_CICLO,
  ): Promise<boolean> {
    if (!this.queue) {
      this.logger.warn("Tick do Digai ignorado: fila indisponivel.");
      return false;
    }
    try {
      await this.queue.add(JOB_TICK_DIGAI, { pagina, orcamento } satisfies JobDoTickDigai, {
        attempts: DIGAI_TENTATIVAS_DO_POLLING,
      });
      return true;
    } catch (err) {
      this.logger.warn(`Falha ao enfileirar o tick do Digai: ${traduzirErroDeBanco(err)}`);
      return false;
    }
  }

  /**
   * Uma folha do leque: UMA pagina de resultados de UM screening, ou seja UMA requisicao.
   *
   * `attempts` PROPRIO, e nao os 5 do evento: retentativa e requisicao e nao passa pelo orcamento,
   * entao os 5 multiplicariam o teto por cinco. A razao dos 5 tambem nao se aplica, porque o
   * polling rele tudo no proximo ciclo, 15 min depois (ver `DIGAI_TENTATIVAS_DO_POLLING`).
   */
  async enfileirarPagina(dados: JobDaPaginaDigai): Promise<boolean> {
    if (!this.queue) return false;
    try {
      await this.queue.add(JOB_PAGINA_DIGAI, dados, { attempts: DIGAI_TENTATIVAS_DO_POLLING });
      return true;
    } catch (err) {
      this.logger.warn(`Falha ao enfileirar a pagina do Digai: ${traduzirErroDeBanco(err)}`);
      return false;
    }
  }

  /**
   * ─ JA HA CICLO EM ANDAMENTO? A TRAVA CONTRA EMPILHAMENTO ────────────────────────────────────
   *
   * O tick NAO tem `jobId` (chave fixa ficaria retida no Redis e bloquearia o ciclo seguinte), e
   * sem ela nada impediria o scheduler de somar um ciclo novo a cada 15 min sobre um ciclo que
   * ainda nao acabou, fazendo a fila crescer monotonicamente. O orcamento por ciclo ja limita o
   * tamanho de cada um; esta trava impede a SOMA deles.
   *
   * `true` QUANDO NAO DA PARA SABER e o lado seguro aqui: com o Redis fora, nao enfileirar custa um
   * ciclo de 15 min, e enfileirar as cegas custa uma fila que ninguem esta drenando.
   *
   * ELA MEDE A FILA INTEIRA, E NAO SO O CICLO (auditoria de 29/09). A fila e compartilhada com o
   * job de EVENTO do webhook, entao um evento em backoff (ate ~15 min em `delayed`) tambem devolve
   * `true` e suprime o tick. Mantido de proposito: distinguir o tipo custaria varrer os jobs, e a
   * direcao do erro e a segura (na duvida, nao empilha). O QUE FOI CORRIGIDO E A LINHA DE LOG do
   * scheduler, que afirmava "o ciclo anterior" e nesse caso mentia.
   */
  async temCicloEmAndamento(): Promise<boolean> {
    if (!this.queue) return true;
    try {
      const [esperando, ativos, atrasados] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getDelayedCount(),
      ]);
      return esperando + ativos + atrasados > 0;
    } catch (err) {
      this.logger.warn(`Nao foi possivel medir a fila do Digai: ${traduzirErroDeBanco(err)}`);
      return true;
    }
  }

  private async processar(job: Job): Promise<void> {
    if (job.name === JOB_TICK_DIGAI) return this.processarTick(job);
    if (job.name === JOB_PAGINA_DIGAI) return this.processarPagina(job);
    if (job.name !== JOB_EVENTO_DIGAI) return;
    const dados = job.data as JobDoEventoDigai;
    const r = await this.comFunilDeErro(() =>
      this.importacao.processarEvento({
        screeningId: dados.screeningId,
        userId: dados.userId,
      }),
    );
    /*
     * OS QUATRO CASOS SAIEM JUNTOS, e o quarto (`naoFinalizaram`) entrou com a regua de admissao de
     * 29/09: imprimir tres de quatro faria a soma nao fechar com o total lido, e diferenca sem nome
     * vira "sumiu no caminho". Ele tambem conta no teste de "houve alguma coisa a relatar", senao a
     * passada em que TODOS foram recusados nao apareceria em lugar nenhum desta superficie.
     */
    if (r.escritos + r.adiados + r.ignorados + r.naoFinalizaram === 0) return;
    this.logger.log(
      `Ingestao do Digai: ${r.escritos} escrito(s), ${r.adiados} adiado(s), ` +
        `${r.ignorados} ja conhecido(s), ${r.naoFinalizaram} fora da regua de admissao.`,
    );
  }

  /**
   * ─ O FUNIL VALE PARA A EXCECAO QUE ESCAPA, E NAO SO PARA O LOG (ressalva A3 do `seguranca`) ────
   *
   * ┌─ O QUE O COMENTARIO DO TOPO PROMETIA E O CODIGO NAO CUMPRIA ─────────────────────────────────┐
   * │ A traducao acontecia no listener `failed`, que so escreve no NOSSO log. O que o BullMQ        │
   * │ PERSISTE no `failedReason`, dentro do Redis, e o `err.message` CRU do que escapa daqui, e o   │
   * │ `detail` do driver do Postgres carrega o VALOR que violou a restricao. Ou seja: a superficie  │
   * │ que o comentario dizia proteger era exatamente a que ficava sem dono, e o Redis nao tem TTL   │
   * │ nem alcance do expurgo, que so conhece Postgres.                                              │
   * │                                                                                               │
   * │ ESCOLHA FEITA: EMBRULHAR A EXCECAO, e nao apenas corrigir o comentario. Um comentario mais    │
   * │ humilde deixaria o furo de pe, e este modulo ja vetou "comentario que promete alcance que o   │
   * │ codigo nao tem" em `digai-grade.ts`.                                                           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O ERRO CONTINUA SENDO ERRO: a excecao e RELANCADA, entao o job falha e a fila retenta como
   * antes. So o TEXTO muda, e ele passa pelo mesmo tradutor do resto do modulo.
   */
  /**
   * ─ O TICK: UMA PAGINA DA LISTAGEM, E O LEQUE SAI DAQUI ─────────────────────────────────────────
   *
   * QUEM ENFILEIRA E A FILA, E QUEM DECIDE E A VARREDURA. O servico da varredura devolve o que
   * precisa ser enfileirado e nao conhece a fila: sem isso haveria ciclo de dependencia entre os
   * dois, e o ciclo deixaria de ser exercitavel sem Redis.
   */
  private async processarTick(job: Job): Promise<void> {
    const { pagina, orcamento } = job.data as JobDoTickDigai;
    const r = await this.comFunilDeErro(() =>
      this.varredura.executarTick(pagina ?? 1, orcamento ?? DIGAI_TETO_REQ_POR_CICLO),
    );
    if (r.inerte) return;
    for (const item of r.screenings) {
      await this.enfileirarPagina({
        screeningId: item.screeningId,
        pagina: 1,
        paginasPermitidas: item.paginasPermitidas,
      });
    }
    /*
     * A PROXIMA PAGINA DA LISTAGEM LEVA O QUE SOBROU, e nao o teto inteiro. Era o furo B do veto:
     * `{ pagina }` sozinho fazia cada pagina de listagem recomecar com 1.199 requisicoes frescas.
     */
    if (r.proximaPaginaDaListagem !== null) {
      await this.enfileirarTick(r.proximaPaginaDaListagem, r.orcamentoRestante);
    }
  }

  /** A folha: UMA pagina de resultados. Havendo mais, ela mesma enfileira a proxima. */
  private async processarPagina(job: Job): Promise<void> {
    const dados = job.data as JobDaPaginaDigai;
    const r = await this.comFunilDeErro(() =>
      this.varredura.executarPaginaDeScreening(
        dados.screeningId,
        dados.pagina ?? 1,
        dados.paginasPermitidas ?? 1,
      ),
    );
    if (r.inerte) return;
    if (r.proximaPagina !== null) {
      await this.enfileirarPagina({
        screeningId: dados.screeningId,
        pagina: r.proximaPagina,
        paginasPermitidas: dados.paginasPermitidas ?? 1,
      });
    }
  }

  private async comFunilDeErro<T>(acao: () => Promise<T>): Promise<T> {
    try {
      return await acao();
    } catch (err) {
      throw new Error(traduzirErroDeBanco(err));
    }
  }
}
