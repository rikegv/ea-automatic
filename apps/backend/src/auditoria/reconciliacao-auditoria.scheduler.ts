import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, eq, exists, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, frentesAdmissao } from "../db/schema";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { AuditoriaService, ATOR_SISTEMA_POS_VEREDITO } from "./auditoria.service";

/**
 * ─ RECONCILIAÇÃO DO AVANÇO DA AUDITORIA: "QUEM FECHOU A RÉGUA E NÃO AVANÇOU, AVANÇA" ────────────
 *
 * POR QUE EXISTE. O avanço automático da Auditoria (`aplicarPosVeredito` → `autoConcluirAuditoria`)
 * é disparado por um EVENTO: um documento muda de estado e o pós-veredito roda. Quando a auditoria
 * AUTOMÁTICA do Portal aprovava o documento que FECHAVA a régua, ela gravava ENTREGUE e arquivava,
 * mas NÃO chamava o pós-veredito (o fio que a frente Auditoria -> Avanço ligou na origem). O
 * resultado era a frente AUDITORIA presa em `ANALISE_PENDENTE` com a régua obrigatória completa, sem
 * ninguém ver. A origem fecha o caso para a frente, e esta varredura é a REDE: qualquer caminho novo
 * que feche a régua sem disparar o avanço é recuperado aqui, sozinho.
 *
 * ┌─ REUSA O CHOKE-POINT, NÃO DUPLICA A RÉGUA NEM O AVANÇO ────────────────────────────────────────┐
 * │ A completude é medida pelo `ReguaCompletudeService` (a MESMA régua do `progressoObrigatoriosMap`/│
 * │ `progresso`, com o recorte de Reservista por sexo), NÃO reescrita. O avanço é o                 │
 * │ `AuditoriaService.aplicarPosVeredito`, o MESMO método do fechamento da auditoria e da validação │
 * │ humana: ele re-verifica `progresso.completa` por dentro (dupla rede), é idempotente (UPDATE      │
 * │ condicional por `concluida=false`, trava de corrida pelo `rowCount`) e NÃO reescreve frente já   │
 * │ concluída. A varredura NÃO toca documento, farol nem o G.I por fora: só CHAMA o disparo.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As QUATRO condições do agendador são as mesmas da casa (`ReconciliacaoGiScheduler`,
 * `ReconciliacaoReguaScheduler`, `DeParaClienteSchedulerService`):
 *  1. kill-switch por env (`AUDITORIA_RECONCILIACAO=off`) nasce INERTE e diz isso UMA vez, no boot;
 *  2. a primeira passada é ATRASADA (não roda no `onModuleInit`, que sobe junto do resto);
 *  3. uma passada NÃO atropela a outra (trava de processo, pulos de passada contados);
 *  4. falha NÃO derruba o processo (captura; promessa rejeitada sem catch mata o Node 20 e viraria
 *     crash-loop levando junto Esteira/Admissões/Clicksign).
 *
 * §A.6: o log é CONTAGEM e nada mais (varridos, avançados, pulos, falhas). Nunca CPF, nome, cliente,
 * cargo nem id de admissão.
 */
@Injectable()
export class ReconciliacaoAuditoriaScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ReconciliacaoAuditoria");
  private timerDaPrimeira?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  /** Trava de concorrência de PROCESSO (o backend é um processo só hoje). */
  private rodando = false;
  /** Passadas puladas por já haver uma viva. Número, nunca linha (§A.6). */
  private puladas = 0;

  /** Cadência folgada: o alvo normalmente é vazio (nada a avançar), então 10 min é barato. */
  static readonly INTERVALO_MS = 10 * 60 * 1000;
  /** Atraso da primeira passada: o backend sobe junto; 2 min é folga para o boot assentar. */
  static readonly ATRASO_DA_PRIMEIRA_MS = 2 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditoria: AuditoriaService,
    private readonly completude: ReguaCompletudeService,
  ) {}

  onModuleInit(): void {
    if (process.env.AUDITORIA_RECONCILIACAO === "off") {
      this.logger.log(
        "Reconciliação do avanço da auditoria INERTE: AUDITORIA_RECONCILIACAO=off. Nenhuma varredura é agendada e nada avança.",
      );
      return;
    }
    this.timerDaPrimeira = setTimeout(
      () => this.passada(),
      ReconciliacaoAuditoriaScheduler.ATRASO_DA_PRIMEIRA_MS,
    );
    this.timerDaPrimeira.unref?.();
    this.timer = setInterval(() => this.passada(), ReconciliacaoAuditoriaScheduler.INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      "Reconciliação do avanço da auditoria agendada (cadência 10 min, primeira passada em 2 min).",
    );
  }

  onModuleDestroy(): void {
    if (this.timerDaPrimeira) clearTimeout(this.timerDaPrimeira);
    if (this.timer) clearInterval(this.timer);
  }

  /** Uma passada, com a trava de concorrência e a captura (retorno `void`, como a casa). */
  private passada(): void {
    if (this.rodando) {
      this.puladas += 1;
      this.logger.warn(
        `Reconciliação do avanço da auditoria PULADA: a passada anterior ainda está rodando ` +
          `(${this.puladas} pulada(s) desde a subida).`,
      );
      return;
    }
    this.rodando = true;
    void this.reconciliar()
      .then((r) => {
        if (r.avancados > 0 || r.falhas > 0) {
          this.logger.log(
            `Reconciliação do avanço da auditoria: ${r.varridos} varrido(s), ` +
              `${r.avancados} avançado(s), ${r.pulos} pulo(s) (régua ainda incompleta), ` +
              `${r.falhas} falha(s).`,
          );
        }
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Falha na reconciliação do avanço da auditoria: ${err instanceof Error ? err.message : String(err)}. ` +
            "Nada foi apagado, e a próxima passada tenta de novo.",
        );
      })
      .finally(() => {
        this.rodando = false;
      });
  }

  /**
   * Admissões CANDIDATAS: VIVAS (`EM_ADMISSAO`) com a frente AUDITORIA em `ANALISE_PENDENTE` e
   * `concluida=false`, e com cliente+cargo (a régua só existe para o par, e `carregarAdmissao` faz
   * INNER JOIN em clientes, então sem `cod_cliente` o avanço nem roda). A completude NÃO entra aqui:
   * é medida depois, pelo `ReguaCompletudeService`, uma por uma. Público para o backfill reusar o
   * MESMO conjunto, sem SQL duplicado.
   */
  async candidatos(): Promise<Array<{ id: string; codCliente: string; cargoId: string }>> {
    const linhas = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
      })
      .from(admissoes)
      .where(
        and(
          eq(admissoes.farolGlobal, "EM_ADMISSAO"),
          isNotNull(admissoes.codCliente),
          isNotNull(admissoes.cargoId),
          exists(
            this.db
              .select({ um: sql`1` })
              .from(frentesAdmissao)
              .where(
                and(
                  eq(frentesAdmissao.admissaoId, admissoes.id),
                  eq(frentesAdmissao.tipo, "AUDITORIA"),
                  eq(frentesAdmissao.status, "ANALISE_PENDENTE"),
                  eq(frentesAdmissao.concluida, false),
                ),
              ),
          ),
        ),
      );
    return linhas.filter(
      (l): l is { id: string; codCliente: string; cargoId: string } =>
        Boolean(l.codCliente && l.cargoId),
    );
  }

  /**
   * O MIOLO, separado do agendador para ser testável. Varre as candidatas, mede a régua de cada uma
   * pela fonte única e, só nas COMPLETAS, chama `aplicarPosVeredito` (que re-mede por dentro). Devolve
   * CONTAGENS (§A.6), nunca linhas.
   */
  async reconciliar(): Promise<{
    varridos: number;
    avancados: number;
    pulos: number;
    falhas: number;
  }> {
    const candidatos = await this.candidatos();
    let avancados = 0;
    let pulos = 0;
    let falhas = 0;
    for (const c of candidatos) {
      let completa = false;
      try {
        const prog = await this.completude.progresso(c.id, c.codCliente, c.cargoId);
        completa = prog.completa;
      } catch {
        falhas += 1;
        continue;
      }
      // Régua ainda incompleta: NÃO avança (o pós-veredito recuaria, e o alvo já é pendente). Pulo.
      if (!completa) {
        pulos += 1;
        continue;
      }
      try {
        await this.auditoria.aplicarPosVeredito(c.id, ATOR_SISTEMA_POS_VEREDITO);
        avancados += 1;
      } catch {
        // §A.6: nem a mensagem sobe; a próxima passada tenta de novo.
        falhas += 1;
      }
    }
    return { varridos: candidatos.length, avancados, pulos, falhas };
  }
}
