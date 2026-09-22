import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import { PandapeApiService } from "../../pandape/pandape-api.service";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import {
  descobrirVagasAtivas,
  mensagemDoErro,
  novoResumo,
  varrerPaginaDaVaga,
} from "./ingestao-ciclo";
import { IngestaoHttp } from "./ingestao-http";
import {
  VARIAVEL_DO_SAL_DA_MARCA,
  type DependenciasDaVarredura,
  type ResumoDoCiclo,
} from "./ingestao-portas";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import {
  criarConexaoDaVarredura,
  JOB_DESCOBERTA,
  JOB_PAGINA,
  VARREDURA_QUEUE,
  VARREDURA_QUEUE_OPTIONS,
  VARREDURA_WORKER_OPTIONS,
  type JobDaPagina,
} from "./ingestao-varredura.queue";

/**
 * ─ A RODA DA VARREDURA: O QUE ENFILEIRA, O QUE CONSOME E O QUE A MANTÉM INERTE ─────────────────
 *
 * ┌─ A VARREDURA NASCE INERTE, E ISSO É DELIBERADO ──────────────────────────────────────────────┐
 * │ Sem `PANDAPE_VARREDURA_DATA_CORTE` no ambiente, NADA roda: nem o intervalo, nem o worker.     │
 * │ A data de corte é o que separa "só os novos" das 137.654 inscrições vivas do passivo, e ela   │
 * │ NÃO TEM DEFAULT de propósito: um default faria a ingestão começar a colher dado pessoal de    │
 * │ 137 mil pessoas no primeiro deploy, sem ninguém decidir isso. É o mesmo padrão da casa para o │
 * │ Pandapé: sem credencial, a rota nasce fechada e inerte, nunca com um valor chutado.           │
 * │                                                                                                │
 * │ A DATA É FIXA, E NÃO `agora() menos alguma coisa`: da segunda forma, duas vagas varridas com   │
 * │ dez minutos de diferença teriam cortes diferentes, e religar a varredura mudaria o que entra.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NUNCA HÁ DUAS VOLTAS AO MESMO TEMPO ────────────────────────────────────────────────────────┐
 * │ A volta leva 26 minutos medidos e o intervalo é de 30, mas relógio não é garantia: antes de    │
 * │ enfileirar a descoberta, o serviço confere se a fila ainda tem trabalho parado ou em execução. │
 * │ Sem essa guarda, uma volta atrasada dobraria o consumo da cota COMPARTILHADA (§A.5), que é     │
 * │ exatamente o que o dimensionamento inteiro existe para evitar.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o log daqui conta vaga, página e quantidade. Nenhum CPF, nome, e-mail, telefone ou id de
 * pessoa, inclusive no caminho de erro, que passa pelo funil `mensagemDoErro`.
 */
@Injectable()
export class IngestaoVarreduraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("IngestaoVarreduraService");
  /** 30 minutos: a volta completa leva 26 e ocupa 20% da cota. O número está medido no plano. */
  private static readonly INTERVALO_MS = 30 * 60 * 1000;

  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private dataDeCorte?: Date;
  /**
   * O SAL DA MARCA DE PASTA, lido do ambiente UMA vez, no boot, e guardado em memória.
   *
   * ┌─ ESTE É O ÚNICO LUGAR QUE LÊ A VARIÁVEL, E ELE É A BORDA ────────────────────────┐
   * │ O domínio (`marcaDeChaveExterna`) recebe o sal por PARÂMETRO e continua puro; o ciclo o      │
   * │ recebe pelas dependências, como já recebe a data de corte. Lido aqui, o segredo tem um       │
   * │ caminho só, que é o que torna a proibição conferível em revisão.                             │
   * │                                                                                              │
   * │ FIXO POR INSTALAÇÃO: vem do `.env` (classe JWT) e NÃO é sorteado no boot. Sorteado, as mesmas│
   * │ 15 pastas apareceriam como 15 novidades a cada subida, e o aviso viraria ruído. Não mora em  │
   * │ TABELA (viajaria em todo `pg_dump`, inclusive no que alimenta a homologação, entregando      │
   * │ chave e dado juntos) nem em arquivo novo (caminho de segredo que os procedimentos não        │
   * │ conhecem).                                                                                   │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: o VALOR nunca é logado, nem truncado, nem devolvido por rota. Só o NOME da variável.
   */
  private salDaMarca?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly api: PandapeApiService,
    private readonly repo: IngestaoRepositorio,
    private readonly http: IngestaoHttp,
    private readonly etapas: EtapasFunilService,
  ) {}

  onModuleInit(): void {
    const corte = lerDataDeCorte(this.config.get<string>("PANDAPE_VARREDURA_DATA_CORTE"));
    if (corte === null) {
      this.logger.log(
        "Varredura do Pandapé INERTE: PANDAPE_VARREDURA_DATA_CORTE não configurada. Nenhuma inscrição é lida.",
      );
      return;
    }
    if (!this.api.estaAtivo()) {
      this.logger.log("Varredura do Pandapé INERTE: integração sem credencial OAuth.");
      return;
    }
    /*
     * FAIL-CLOSED DO SAL, na mesma porta da data de corte: sem ele a varredura NÃO SOBE. Não é
     * "roda sem marca" (reabre a perda silenciosa de 35% da entrada) nem "roda sem sal" (o digesto
     * sem chave é confirmável por quem já suspeita do nome da pasta, que calcula e compara). A
     * linha nomeia a VARIÁVEL que falta, jamais o valor dela.
     */
    const sal = (this.config.get<string>(VARIAVEL_DO_SAL_DA_MARCA) ?? "").trim();
    if (sal === "") {
      this.logger.log(
        `Varredura do Pandapé INERTE: ${VARIAVEL_DO_SAL_DA_MARCA} não configurada. Nenhuma inscrição é lida.`,
      );
      return;
    }
    this.dataDeCorte = corte;
    this.salDaMarca = sal;
    try {
      const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
      const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
      this.connection = criarConexaoDaVarredura(host, port);
      // Sem este listener, um erro de conexão vira exceção não tratada e DERRUBA O PROCESSO, que
      // levaria junto Esteira, Admissões e Clicksign. É o mesmo cuidado do resto dos sweeps.
      this.connection.on("error", (err) => {
        this.logger.warn(`Conexão Redis (varredura) com erro: ${err.message}`);
      });
      this.queue = new Queue(VARREDURA_QUEUE, {
        connection: this.connection,
        ...VARREDURA_QUEUE_OPTIONS,
      });
      this.worker = new Worker(VARREDURA_QUEUE, (job) => this.processar(job), {
        connection: this.connection,
        ...VARREDURA_WORKER_OPTIONS,
      });
      this.worker.on("failed", (job, err) => {
        // §A.6: só o nome do job e a MENSAGEM. O payload é `{ idVacancy, page }`, e mesmo assim o
        // erro do driver não entra cru: `detail` carrega o valor que violou a restrição.
        this.logger.error(`Job ${job?.name ?? "desconhecido"} falhou: ${mensagemDoErro(err)}`);
      });
    } catch (err) {
      this.logger.warn(
        `Fila da varredura indisponível no boot (segue sem derrubar o app): ${mensagemDoErro(err)}`,
      );
      return;
    }

    // NÃO RODA NO BOOT, pelo mesmo motivo do scheduler admissional: um restart do backend não pode
    // virar um pico contra a cota compartilhada. A primeira volta sai depois de uma cadência.
    this.timer = setInterval(() => void this.dispararVolta(), IngestaoVarreduraService.INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      `Varredura do Pandapé ativa (cadência ${IngestaoVarreduraService.INTERVALO_MS / 60000} min, corte ${corte.toISOString().slice(0, 10)}).`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }

  /** Enfileira a DESCOBERTA de uma volta, se não houver volta em andamento. Nunca lança. */
  async dispararVolta(): Promise<boolean> {
    if (!this.queue) return false;
    try {
      const c = await this.queue.getJobCounts("active", "waiting", "delayed");
      const pendentes = (c.active ?? 0) + (c.waiting ?? 0) + (c.delayed ?? 0);
      if (pendentes > 0) {
        this.logger.log(`Volta anterior ainda em andamento (${pendentes} job(s)). Nada enfileirado.`);
        return false;
      }
      await this.queue.add(JOB_DESCOBERTA, {});
      return true;
    } catch (err) {
      this.logger.warn(`Falha ao disparar a volta da varredura: ${mensagemDoErro(err)}`);
      return false;
    }
  }

  /**
   * O CONSUMIDOR. Dois jobs, e cada um chama a MESMA função que o ciclo monolítico auditado chama.
   */
  private async processar(job: Job): Promise<void> {
    if (job.name === JOB_DESCOBERTA) return this.processarDescoberta();
    if (job.name === JOB_PAGINA) return this.processarPagina(job.data as JobDaPagina);
  }

  private async processarDescoberta(): Promise<void> {
    const resumo = novoResumo();
    const vagas = await descobrirVagasAtivas(this.deps(), resumo);
    for (const vaga of vagas) {
      // O PAYLOAD É `{ idVacancy, page }` E NADA MAIS. O id da vaga do EA NÃO vai junto: ele é
      // resolvido no consumo, e mandá-lo aqui só aumentaria o que fica guardado no Redis.
      await this.queue?.add(JOB_PAGINA, { idVacancy: vaga.idVacancy, page: 1 } satisfies JobDaPagina);
    }
    this.registrar("descoberta", resumo);
  }

  private async processarPagina(dados: JobDaPagina): Promise<void> {
    const deps = this.deps();
    const vaga = await this.repo.vagaPorIdPandape(dados.idVacancy);
    if (!vaga) {
      // A vaga espelhada sumiu entre a descoberta e o consumo. Não é erro: a volta seguinte
      // a espelha de novo, e escrever candidatura sem vaga é o que não pode acontecer.
      return;
    }
    const resumo = novoResumo();
    const r = await varrerPaginaDaVaga(
      deps,
      { idVacancy: dados.idVacancy, vagaId: vaga.id },
      dados.page,
      resumo,
    );
    if (r.proximaPagina !== null) {
      await this.queue?.add(JOB_PAGINA, {
        idVacancy: dados.idVacancy,
        page: r.proximaPagina,
      } satisfies JobDaPagina);
    }
    this.registrar("pagina", resumo);
  }

  /** As dependências de produção, montadas por volta de job. */
  private deps(): DependenciasDaVarredura {
    const corte = this.dataDeCorte;
    if (!corte) throw new Error("Varredura sem data de corte configurada.");
    // A SEGUNDA FECHADURA DO SAL: montar as dependências sem ele LANÇA, em vez de devolver um
    // ciclo que marcaria pasta sem chave. A mensagem nomeia a variável, nunca o valor (§A.6).
    const sal = this.salDaMarca;
    if (!sal) throw new Error(`Varredura sem ${VARIAVEL_DO_SAL_DA_MARCA} configurada.`);
    return {
      http: this.http,
      banco: this.repo,
      fila: {
        enfileirar: async (_fila, payload) => {
          await this.queue?.add(JOB_PAGINA, payload as JobDaPagina);
        },
      },
      log: {
        info: (texto, dados) => this.logger.log(`${texto} ${resumir(dados)}`),
        erro: (texto, dados) => this.logger.error(`${texto} ${resumir(dados)}`),
      },
      agora: () => new Date(),
      dataDeCorte: corte,
      salDaMarca: sal,
      cicloDeVida: this.repo,
      etapaInicial: async () => (await this.etapas.etapaInicial()).codigo,
    };
  }

  /** §A.6: o resumo do ciclo é CONTAGEM e MARCA de pasta. Nenhum texto livre do ATS entra no log. */
  private registrar(etapa: string, r: ResumoDoCiclo): void {
    if (
      r.vagasVarridas === 0 &&
      r.paginasLidas === 0 &&
      r.pessoasCriadas === 0 &&
      r.candidaturasCriadas === 0 &&
      r.erros === 0
    ) {
      return;
    }
    this.logger.log(
      `Varredura (${etapa}): ${r.vagasVarridas} vaga(s), ${r.paginasLidas} pagina(s), ` +
        `${r.pessoasCriadas} pessoa(s) nova(s), ${r.candidaturasCriadas} candidatura(s) escrita(s), ` +
        `${r.conflitosParaRevisao} conflito(s) para revisao, ${r.erros} erro(s).`,
    );
    if (r.etapasNaoMapeadas.length > 0) {
      /*
       * SEM ESTA LINHA, A RECUSA FAIL-CLOSED VIRA PERDA SILENCIOSA DE 35% DA ENTRADA: ela diz que
       * houve pasta sem tradução e QUANTAS, que é o que faz alguém ir configurar o de/para.
       *
       * O QUE SOBE É A MARCA, NUNCA O NOME DA PASTA (achado R1 do `seguranca`): o nome é texto
       * livre digitado no ATS e pode chegar com nome de gente dentro, e o log da aplicação é
       * permanente e está fora do alcance do `aplicarRetencao`. A marca é estável entre passadas,
       * então ela ainda responde "são sempre as mesmas?", que é a pergunta de quem opera; o nome
       * legível se lê na FONTE, o ATS, que é de onde sai a linha de de/para de qualquer jeito.
       */
      this.logger.warn(
        `Pastas do ATS sem de/para nesta passada: ${r.etapasNaoMapeadas.length}. ` +
          `Marcas (o nome da pasta nao entra no log, §A.6): ${r.etapasNaoMapeadas.join(" | ")}`,
      );
    }
  }
}

/**
 * A DATA DE CORTE, lida do ambiente. Valor ausente, vazio ou ilegível devolve `null`, e `null`
 * mantém a varredura INERTE: chutar uma data aqui é decidir sozinho quantas das 137.654 inscrições
 * do passivo entram na base.
 */
export function lerDataDeCorte(valor: string | undefined): Date | null {
  const texto = (valor ?? "").trim();
  if (texto === "") return null;
  const t = Date.parse(texto);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** O que o ciclo manda para o log, achatado. Só chave e valor curto; nada de objeto aninhado. */
function resumir(dados: unknown): string {
  if (dados === null || dados === undefined) return "";
  if (typeof dados !== "object") return String(dados);
  return Object.entries(dados as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "object" ? "[objeto]" : String(v)}`)
    .join(" ");
}
