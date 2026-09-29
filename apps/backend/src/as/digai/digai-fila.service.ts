import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import { traduzirErroDeBanco } from "../../domain/digai";
import { DigaiImportacaoService } from "./digai-importacao.service";
import {
  DIGAI_QUEUE,
  DIGAI_QUEUE_OPTIONS,
  DIGAI_WORKER_OPTIONS,
  JOB_EVENTO_DIGAI,
  criarConexaoDoDigai,
  type JobDoEventoDigai,
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
        this.logger.error(`Job ${tipoDoJob} do Digai falhou: ${traduzirErroDeBanco(err)}`);
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

  private async processar(job: Job): Promise<void> {
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
  private async comFunilDeErro<T>(acao: () => Promise<T>): Promise<T> {
    try {
      return await acao();
    } catch (err) {
      throw new Error(traduzirErroDeBanco(err));
    }
  }
}
