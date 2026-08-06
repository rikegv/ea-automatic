import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { ClicksignQueueService } from "../clicksign/clicksign-queue.service";
import { PandapeQueueService } from "../pandape/pandape-queue.service";
import { VtColetaQueueService } from "../vt-coleta/vt-coleta-queue.service";

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

  /** Estado somado das três filas + os jobs falhados de todas elas, do mais recente ao mais antigo. */
  async estado(): Promise<EstadoFilas> {
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

        // Teto de 50 por fila: a lista é para AGIR, não para paginar. Com mais que isso o problema
        // não é um job, é a fila inteira, e a contagem já diz isso.
        const falhados = await q.getFailed(0, 49);
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
   * REPROCESSA o job falhado (`job.retry()`): ele volta para a fila e o worker tenta de novo, com o
   * mesmo payload. Não destrutiva, e é o caminho certo quando a causa foi corrigida fora do EA (o
   * CPF arrumado no Pandapé, por exemplo).
   */
  async reprocessarJob(fila: NomeFila, jobId: string): Promise<{ reenfileirado: true }> {
    const job = await this.buscarJob(fila, jobId);
    await job.retry();
    this.logger.log(`Job falhado reenfileirado: ${fila}/${jobId}.`);
    return { reenfileirado: true };
  }

  /** O `data` cru do job, para quem vai resolver quem é o alvo. */
  async dadosDoJob(fila: NomeFila, jobId: string): Promise<Record<string, unknown>> {
    const job = await this.buscarJob(fila, jobId);
    return (job.data ?? {}) as Record<string, unknown>;
  }
}
