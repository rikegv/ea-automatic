import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { ClicksignQueueService } from "../clicksign/clicksign-queue.service";
import { PandapeQueueService } from "../pandape/pandape-queue.service";
import { VtColetaQueueService } from "../vt-coleta/vt-coleta-queue.service";
import type { DesfechoReprocesso } from "./motivo-reprocesso";

/**
 * AS TRÊS FILAS DO SISTEMA, vistas como uma só pelo Diagnóstico.
 *
 * POR QUE EXISTE (bug encontrado no incidente de 06/08/2026). O card "Fila (BullMQ)" consultava
 * APENAS `pandape-sync`, porque era o único serviço de fila que o diagnóstico conhecia. Job falhado
 * em `clicksign-sync` ou em `vt-coleta-scan` deixava o card VERDE: um envelope de assinatura falhando
 * em loop não acendia absolutamente nada na tela. Não era limitação de produto, era um alvo que
 * ninguém tinha revisto desde que a segunda e a terceira fila nasceram.
 *
 * O QUE ELE ENTREGA. Contagem somada das três, e a LISTA dos jobs falhados com o motivo LEGÍVEL (é o
 * `failedReason` do BullMQ, que já é a mensagem da exceção: "CPF inválido", não um código). Cada job
 * vira uma linha acionável na tela, com limpar e reprocessar.
 *
 * §A.6: o `data` do job carrega ID externo (idPrecollaborator, admissaoId), nunca CPF nem URL. O
 * rótulo do alvo é montado a partir desses ids; quem quiser o nome do candidato pede o "ver dados do
 * alvo", que resolve na hora e não persiste nada.
 */

/** As filas que o diagnóstico enxerga. O nome é o que a tela mostra e o que a ação recebe de volta. */
export const FILAS = ["pandape-sync", "clicksign-sync", "vt-coleta-scan"] as const;
export type NomeFila = (typeof FILAS)[number];

export interface ContagemFilas {
  ativos: number;
  aguardando: number;
  falhados: number;
  atrasados: number;
}

export interface JobFalhado {
  fila: NomeFila;
  jobId: string;
  /** O tipo do job (`sync-candidate`, `criar-envelope`, `scan-tick`, ...). */
  nome: string;
  /** Identificação do alvo em linguagem de operação, sem PII. */
  alvo: string;
  /** Motivo REAL da falha, como a exceção o escreveu. */
  motivo: string;
  tentativas: number;
  /** ISO de quando falhou pela última vez; `null` quando o BullMQ não registrou. */
  falhouEm: string | null;
  /** Há quantas horas falhou (inteiro, para a tela dizer "há 16h"). */
  horas: number | null;
}

/**
 * O RESULTADO DO REPROCESSAMENTO, com o desfecho REAL. O `{reenfileirado: true}` de antes não era
 * resposta: era o recibo de ter empurrado o job de volta para a fila, que a tela lia como sucesso.
 */
export interface ResultadoReprocesso {
  fila: NomeFila;
  jobId: string;
  /** Tipo do job (`sync-candidate`, `criar-envelope`, `scan-tick`, ...), para a tela dar contexto. */
  nome: string;
  desfecho: DesfechoReprocesso;
  /** `failedReason` cru do BullMQ, presente só quando FALHOU. Já é legível e não carrega PII. */
  motivo?: string;
  /** Quanto tempo o acompanhamento esperou, em segundos, para a tela ser honesta sobre o teto. */
  esperouSegundos: number;
}

export interface EstadoFilas {
  /** false quando NENHUMA fila subiu (Redis fora no boot). */
  disponivel: boolean;
  contagem: ContagemFilas;
  jobs: JobFalhado[];
  /** Filas que não subiram, para a tela não afirmar "tudo certo" sobre o que não olhou. */
  indisponiveis: NomeFila[];
}

@Injectable()
export class FilasDiagnosticoService {
  private readonly logger = new Logger("FilasDiagnostico");

  /**
   * TETO DA LISTA DE FALHADOS, POR FILA, quando alguém abre o drawer.
   *
   * ERA 50, E ESCONDIA A MAIOR PARTE DA FILA. Medido na produção em 30/09/2026: a `pandape-sync`
   * tinha 132 jobs falhados (`zcard ea:bull:pandape-sync:failed`), então 82 deles NUNCA chegavam à
   * tela. O comentário antigo dizia que "a lista é para AGIR, não para paginar", e isso deixou de
   * valer no momento em que a lista ganhou BUSCA POR NOME: busca que varre meia fila responde
   * "não encontrado" para um candidato que está ali, o que é pior do que não ter busca.
   *
   * POR QUE 500, e não um número maior: é o mesmo teto do `PandapeNomeCacheService` (500 entradas).
   * Listar mais linhas do que o cache de nomes consegue guardar não tornaria a busca mais completa,
   * só gastaria cota do Pandapé resolvendo nome que seria evicto em seguida. Dá folga de ~3,8x sobre
   * as 132 medidas, e a leitura é do Redis LOCAL (barata, sem rede externa).
   */
  static readonly LIMITE_LISTA = 500;
  /**
   * O PADRÃO DE `estado()` CONTINUA 50, e isso é deliberado (§A.26). Subir o teto no DEFAULT mudaria
   * o comportamento de todo chamador por OMISSÃO, inclusive de quem só quer contagem. Quem quer a
   * lista grande PEDE: o endpoint do drawer passa `LIMITE_LISTA` explicitamente.
   */
  static readonly LIMITE_PADRAO = 50;
  /**
   * O QUE O SNAPSHOT PEDE: ZERO linha. `estado()` tem DOIS consumidores, e só um usa a lista. O card
   * "Fila (BullMQ)" de `/diagnostico` (`diagnostico.service.dependencias`) consome SÓ a contagem e os
   * indisponíveis; subir o teto para ele faria toda abertura da tela ler centenas de hashes do Redis
   * para descartar todos. Zero significa "nem chame o `getFailed`".
   */
  static readonly LIMITE_SNAPSHOT = 0;

  /** Teto do acompanhamento do reprocesso. Segura a conexão HTTP por no máximo isto. */
  private static readonly TETO_ESPERA_MS = 25_000;
  /** Cadência das checagens de estado. Barato: é um HGET no Redis local. */
  private static readonly INTERVALO_MS = 1_000;

  constructor(
    private readonly pandape: PandapeQueueService,
    private readonly clicksign: ClicksignQueueService,
    private readonly vtColeta: VtColetaQueueService,
  ) {}

  private fila(nome: NomeFila): Queue | undefined {
    if (nome === "pandape-sync") return this.pandape.filaBull();
    if (nome === "clicksign-sync") return this.clicksign.filaBull();
    return this.vtColeta.filaBull();
  }

  /**
   * O ALVO em linguagem de operação. Cada fila carrega um id diferente no `data`, e o que a tela
   * precisa mostrar é "de quem é este job", não o JSON cru.
   */
  private alvoDoJob(fila: NomeFila, dados: unknown): string {
    const d = (dados ?? {}) as Record<string, unknown>;
    if (fila === "pandape-sync") {
      if (d.idPrecollaborator) return `Candidato do Pandapé ${String(d.idPrecollaborator)}`;
      if (d.admissaoId) return `Admissão ${String(d.admissaoId).slice(0, 8)}`;
      return "Ciclo de varredura do Pandapé";
    }
    if (fila === "clicksign-sync") {
      if (d.admissaoId) return `Admissão ${String(d.admissaoId).slice(0, 8)}`;
      return "Ciclo de consulta da assinatura";
    }
    return "Ciclo de varredura da coleta de VT";
  }

  /**
   * Estado somado das três filas + os jobs falhados de todas elas, do mais recente ao mais antigo.
   *
   * O `limiteFalhados` é por FILA, e existe porque os dois consumidores querem coisas diferentes: o
   * drawer quer a lista inteira (para a busca por nome varrer tudo), o snapshot do card quer só a
   * contagem. Zero não lista nada e poupa o `getFailed`.
   */
  async estado(
    limiteFalhados: number = FilasDiagnosticoService.LIMITE_PADRAO,
  ): Promise<EstadoFilas> {
    // SANEAMENTO AQUI DENTRO, e não no chamador, por causa de um off-by-one que lê a fila INTEIRA em
    // silêncio: `getFailed(0, limite - 1)` com `limite` igual a 0 vira `getFailed(0, -1)`, e no BullMQ
    // o -1 significa ATÉ O FIM, ou seja, os até 5.000 jobs que o `removeOnFail` retém. Zero ou menos
    // não vira -1: vira "não chame o `getFailed`". E o 500 é absoluto, o chamador não pode passar dele.
    const teto = Math.min(
      Math.max(Math.trunc(limiteFalhados) || 0, 0),
      FilasDiagnosticoService.LIMITE_LISTA,
    );
    const contagem: ContagemFilas = { ativos: 0, aguardando: 0, falhados: 0, atrasados: 0 };
    const jobs: JobFalhado[] = [];
    const indisponiveis: NomeFila[] = [];
    let alguma = false;
    const agora = Date.now();

    for (const nome of FILAS) {
      const q = this.fila(nome);
      if (!q) {
        indisponiveis.push(nome);
        continue;
      }
      try {
        const c = await q.getJobCounts("active", "waiting", "failed", "delayed");
        alguma = true;
        contagem.ativos += c.active ?? 0;
        contagem.aguardando += c.waiting ?? 0;
        contagem.falhados += c.failed ?? 0;
        contagem.atrasados += c.delayed ?? 0;

        // A lista é opcional: o snapshot pede 0 e nem chega a ler os hashes (ver LIMITE_SNAPSHOT).
        const falhados = teto > 0 ? await q.getFailed(0, teto - 1) : [];
        for (const j of falhados) {
          const quando = j.finishedOn ?? j.processedOn ?? null;
          jobs.push({
            fila: nome,
            jobId: String(j.id ?? ""),
            nome: j.name,
            alvo: this.alvoDoJob(nome, j.data),
            motivo: j.failedReason || "sem motivo registrado",
            tentativas: j.attemptsMade,
            falhouEm: quando ? new Date(quando).toISOString() : null,
            horas: quando ? Math.floor((agora - quando) / 3_600_000) : null,
          });
        }
      } catch (err) {
        indisponiveis.push(nome);
        this.logger.warn(
          `Falha ao ler a fila ${nome}: ${err instanceof Error ? err.message : "erro"}`,
        );
      }
    }

    jobs.sort((a, b) => (b.falhouEm ?? "").localeCompare(a.falhouEm ?? ""));
    return { disponivel: alguma, contagem, jobs, indisponiveis };
  }

  /**
   * OS ALVOS DO PANDAPÉ entre os jobs falhados: o par (jobId, idPrecollaborator), e nada mais.
   *
   * Existe para a BUSCA POR NOME do drawer (OST 30/09/2026) poder resolver o nome de todas as linhas
   * de uma vez. O `JobFalhado` NÃO ganhou o id externo de propósito: ele é o contrato que a tela já
   * consome, e quem precisa do id é só o resolvedor de nomes, do lado do servidor. O id nunca vai
   * para a resposta HTTP (§A.6, minimização): sai daqui para o `NomesFalhadosService` e para.
   *
   * Pega TODO job falhado da fila que carregue `idPrecollaborator`, inclusive o `pull-docs` (que
   * carrega os dois ids): quem procura por nome quer achar a pessoa em qualquer linha dela.
   */
  async alvosPandapeFalhados(
    limite: number = FilasDiagnosticoService.LIMITE_LISTA,
  ): Promise<{ jobId: string; idPrecollaborator: string }[]> {
    const q = this.fila("pandape-sync");
    const teto = Math.min(
      Math.max(Math.trunc(limite) || 0, 0),
      FilasDiagnosticoService.LIMITE_LISTA,
    );
    if (!q || teto <= 0) return [];
    try {
      const falhados = await q.getFailed(0, teto - 1);
      const alvos: { jobId: string; idPrecollaborator: string }[] = [];
      for (const j of falhados) {
        const id = (j.data as Record<string, unknown> | undefined)?.idPrecollaborator;
        if (id) alvos.push({ jobId: String(j.id ?? ""), idPrecollaborator: String(id) });
      }
      return alvos;
    } catch (err) {
      // Mesma direção do `estado()`: fila ilegível não derruba a tela, só não traz nome.
      this.logger.warn(
        `Falha ao ler os alvos da fila pandape-sync: ${err instanceof Error ? err.message : "erro"}`,
      );
      return [];
    }
  }

  private async buscarJob(fila: NomeFila, jobId: string): Promise<Job> {
    const q = this.fila(fila);
    if (!q) throw new NotFoundException(`Fila ${fila} indisponível.`);
    const job = await q.getJob(jobId);
    if (!job) throw new NotFoundException("Job não encontrado (pode já ter sido limpo).");
    return job;
  }

  /**
   * REMOVE o job falhado. Destrutiva de verdade: o job é o ÚNICO rastro do que ele carregava, e foi
   * exatamente isso que o incidente mostrou (um candidato real existia só ali). Por isso a tela
   * confirma antes E oferece "ver dados do alvo" ao lado; aqui embaixo não há como recuperar.
   *
   * Remove pelo caminho do próprio BullMQ (`job.remove()`), que limpa o hash e a lista de falhados
   * juntos. Mexer no Redis na mão deixaria hash órfão.
   */
  async limparJob(fila: NomeFila, jobId: string): Promise<{ removido: true }> {
    const job = await this.buscarJob(fila, jobId);
    await job.remove();
    this.logger.log(`Job falhado removido: ${fila}/${jobId}.`);
    return { removido: true };
  }

  /**
   * REPROCESSA o job falhado e ESPERA o desfecho. Não destrutiva.
   *
   * O `job.retry()` devolve na hora, porque só empurra o job de volta para a fila: quem trabalha é o
   * worker, depois. A versão anterior parava aqui e respondia `{reenfileirado: true}`, e era esse o
   * defeito, porque a tela lista APENAS falhados e a lista recarregada ficava vazia, com cara de
   * sucesso. Aqui o método acompanha o job até ele terminar e devolve o que de fato aconteceu.
   *
   * O TETO DE 25 SEGUNDOS não é estética: os três workers têm concorrência 1 e limiter, então o job
   * reprocessado pode ficar atrás de outro na fila, e há job que roda por minutos (`scheduler-tick`
   * do Pandapé, `scan-tick` do VT). Estourado o teto, a resposta é EM_PROCESSAMENTO, que é verdade,
   * e não um sucesso inventado. Medido em produção: o `sync-candidate` da Zelda fechou em 12s.
   *
   * COMPARTILHADO PELAS TRÊS FILAS (§A.26): Pandapé, Clicksign e VT usam este mesmo método. Nada aqui
   * é específico de uma delas; o que muda por fila é só quanto tempo o job leva, e isso o teto cobre.
   */
  async reprocessarJob(
    fila: NomeFila,
    jobId: string,
    /** Só a suite mexe nisto: o caminho de produção usa o teto real de 25s. */
    opts: { tetoMs?: number; intervaloMs?: number } = {},
  ): Promise<ResultadoReprocesso> {
    const tetoMs = opts.tetoMs ?? FilasDiagnosticoService.TETO_ESPERA_MS;
    const intervaloMs = opts.intervaloMs ?? FilasDiagnosticoService.INTERVALO_MS;
    const q = this.fila(fila);
    if (!q) throw new NotFoundException(`Fila ${fila} indisponível.`);
    const job = await this.buscarJob(fila, jobId);
    const nome = job.name;
    await job.retry();
    this.logger.log(`Job falhado reenfileirado: ${fila}/${jobId}. Acompanhando o desfecho.`);

    const inicio = Date.now();
    const segundos = () => Math.round((Date.now() - inicio) / 1000);

    while (Date.now() - inicio < tetoMs) {
      await new Promise((r) => setTimeout(r, intervaloMs));
      const atual = await q.getJob(jobId);
      // Sumiu do Redis: o `removeOnComplete` levou. Só quem completa é removido, então é sucesso.
      if (!atual) return { fila, jobId, nome, desfecho: "CONCLUIDO", esperouSegundos: segundos() };

      const estado = await atual.getState();
      if (estado === "completed") {
        return { fila, jobId, nome, desfecho: "CONCLUIDO", esperouSegundos: segundos() };
      }
      // O `retry()` apaga `failedReason` junto com o estado antigo (script `reprocessJob` do BullMQ),
      // então "falhado COM motivo" é necessariamente a falha NOVA, nunca o eco da anterior.
      if (estado === "failed" && atual.failedReason) {
        this.logger.warn(`Reprocesso falhou de novo: ${fila}/${jobId}.`);
        return {
          fila,
          jobId,
          nome,
          desfecho: "FALHOU",
          motivo: atual.failedReason,
          esperouSegundos: segundos(),
        };
      }
    }

    this.logger.log(`Reprocesso ainda rodando após o teto: ${fila}/${jobId}.`);
    return { fila, jobId, nome, desfecho: "EM_PROCESSAMENTO", esperouSegundos: segundos() };
  }

  /** O `data` cru do job, para quem vai resolver quem é o alvo. */
  async dadosDoJob(fila: NomeFila, jobId: string): Promise<Record<string, unknown>> {
    const job = await this.buscarJob(fila, jobId);
    return (job.data ?? {}) as Record<string, unknown>;
  }
}
