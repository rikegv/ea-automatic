import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, eq, exists, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoDadosGi, admissoes, frentesAdmissao } from "../db/schema";
import { FAROIS_VIVOS } from "../domain/admissao";
import { ORIGENS_AUTORIZADAS_A_ENVIAR_AO_GI } from "../domain/portal-dados-gi";
import { EnviarParaGiService } from "./enviar-para-gi.service";

/**
 * ─ RECONCILIAÇÃO DO ENVIO AO G.I: "QUEM DEVERIA ESTAR NO CADASTRO E NUNCA FOI ENVIADO, VAI" ────────
 *
 * Decisão do diretor (15/10/2026): o envio ao G.I deixa de depender SÓ do instante em que a auditoria
 * fecha. O gatilho automático (`auditoria.service`) é um EDGE-TRIGGER: dispara `enviar()` UMA vez, na
 * transição da frente, e NÃO tem retry. Se naquele instante o envio foi RECUSADO por uma pendência
 * preenchível depois (unidade do salário, empresa/filial, cliente) ou falhou (rede/G.I fora), a
 * admissão fica "auditada e nunca enviada" para sempre, sem ninguém ver. Foi o que prendeu os casos da
 * varredura. Esta varredura periódica fecha esse buraco: reenvia quem DEVERIA estar no Cadastro do G.I
 * e não está.
 *
 * ┌─ REUSA O GATILHO AUTOMÁTICO, NÃO DUPLICA GUARDA ──────────────────────────────────────────────┐
 * │ Para cada candidato, chama `EnviarParaGiService.enviar(id, contexto)`, o MESMO método do         │
 * │ fechamento da auditoria: a trava de ORIGEM (só `MANUAL`), a operabilidade (`admissaoOperavel`),  │
 * │ o encerramento, as guardas duras (empresa/filial, salário, unidade, cliente) e a IDEMPOTÊNCIA    │
 * │ (`jaEnviado`) são as de lá, sem uma segunda cópia que divergisse no primeiro ajuste. apiSinc é   │
 * │ `false` fixo (§A.48): o registro SAI da pré-seleção e o sincronizador do G.I o promove ao Cadastro.│
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ IDEMPOTENTE, NÃO DUPLICA, NÃO REABRE NADA VALIDADO ──────────────────────────────────────────┐
 * │ O ALVO é só quem NUNCA foi enviado (`admissao_dados_gi` sem `gi_enviado_em`), e `enviar()` ainda │
 * │ confere `jaEnviado` antes de criar: dupla rede, então rodar N vezes não cria um segundo          │
 * │ `FuncionarioSelecao`. A varredura NÃO toca auditoria, documento, farol nem a folha: só o carimbo │
 * │ de envio (upsert em `admissao_dados_gi`). Nada validado é reaberto.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As QUATRO condições do agendador são as mesmas da casa (`ReconciliacaoReguaScheduler`,
 * `DeParaClienteSchedulerService`):
 *  1. kill-switch por env (`GI_RECONCILIACAO=off`) nasce INERTE e diz isso UMA vez, no boot;
 *  2. a primeira passada é ATRASADA (não roda no `onModuleInit`, que sobe junto do resto);
 *  3. uma passada NÃO atropela a outra (trava de processo, pulos contados);
 *  4. falha NÃO derruba o processo (captura; promessa rejeitada sem catch mata o Node 20 e viraria
 *     crash-loop levando junto Esteira/Admissões/Clicksign).
 *
 * §A.6: o log é CONTAGEM e nada mais (candidatos, enviados, recusados, falhas, pulos). Nunca CPF, nome,
 * cliente, cargo nem id de admissão.
 */
@Injectable()
export class ReconciliacaoGiScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ReconciliacaoGi");
  private timerDaPrimeira?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  /** Trava de concorrência de PROCESSO (o backend é um processo só hoje). */
  private rodando = false;
  /** Passadas puladas por já haver uma viva. Número, nunca linha (§A.6). */
  private puladas = 0;

  /** O autor da trilha do envio pela reconciliação. Não é logado (§A.6) e não é FK hoje. */
  static readonly AUTOR_SISTEMA = "reconciliacao-gi";
  /** Cadência folgada: o alvo normalmente é vazio (nada a reenviar), então 10 min é barato. */
  static readonly INTERVALO_MS = 10 * 60 * 1000;
  /** Atraso da primeira passada: o backend sobe junto; 2 min é folga para o boot assentar. */
  static readonly ATRASO_DA_PRIMEIRA_MS = 2 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly enviarParaGi: EnviarParaGiService,
  ) {}

  onModuleInit(): void {
    if (process.env.GI_RECONCILIACAO === "off") {
      this.logger.log(
        "Reconciliação do envio ao G.I INERTE: GI_RECONCILIACAO=off. Nenhuma varredura é agendada e nada e enviado.",
      );
      return;
    }
    this.timerDaPrimeira = setTimeout(
      () => this.passada(),
      ReconciliacaoGiScheduler.ATRASO_DA_PRIMEIRA_MS,
    );
    this.timerDaPrimeira.unref?.();
    this.timer = setInterval(() => this.passada(), ReconciliacaoGiScheduler.INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      "Reconciliação do envio ao G.I agendada (cadência 10 min, primeira passada em 2 min).",
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
        `Reconciliação do G.I PULADA: a passada anterior ainda está rodando ` +
          `(${this.puladas} pulada(s) desde a subida).`,
      );
      return;
    }
    this.rodando = true;
    void this.reconciliar()
      .then((r) => {
        if (r.enviados > 0 || r.falhas > 0) {
          this.logger.log(
            `Reconciliação do G.I: ${r.candidatos} candidato(s), ` +
              `${r.enviados} enviado(s) ao Cadastro, ${r.recusados} recusado(s) por guarda, ` +
              `${r.falhas} falha(s) de envio.`,
          );
        }
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Falha na reconciliação do G.I: ${err instanceof Error ? err.message : String(err)}. ` +
            "Nada foi apagado, e a próxima passada tenta de novo.",
        );
      })
      .finally(() => {
        this.rodando = false;
      });
  }

  /**
   * O MIOLO, separado do agendador para ser testável. Varre os candidatos e reenvia cada um pela
   * cadeia única do `enviar()`. Devolve CONTAGENS (§A.6), nunca linhas.
   *
   * O ALVO: admissão de origem AUTORIZADA (`MANUAL`), VIVA e não pausada (`admissaoOperavel`), com a
   * AUDITORIA concluída (a condição que o edge-trigger representa) e que NUNCA foi enviada ao G.I
   * (`admissao_dados_gi` sem `gi_enviado_em`). As mesmas constantes do domínio
   * (`ORIGENS_AUTORIZADAS_A_ENVIAR_AO_GI`, `FAROIS_VIVOS`), não cópias.
   */
  async reconciliar(): Promise<{
    candidatos: number;
    enviados: number;
    recusados: number;
    falhas: number;
  }> {
    const candidatos = await this.db
      .select({
        id: admissoes.id,
        farolGlobal: admissoes.farolGlobal,
        pausadaEm: admissoes.pausadaEm,
      })
      .from(admissoes)
      .where(
        and(
          inArray(admissoes.origem, [...ORIGENS_AUTORIZADAS_A_ENVIAR_AO_GI]),
          inArray(admissoes.farolGlobal, [...FAROIS_VIVOS]),
          isNull(admissoes.pausadaEm),
          // AUDITORIA concluída: a frente AUDITORIA desta admissão com `concluida = true`. É a condição
          // que o gatilho automático tem (ele dispara na transição da frente), e que o alvo precisa ter
          // para não reenviar admissão com a régua ainda aberta.
          exists(
            this.db
              .select({ um: sql`1` })
              .from(frentesAdmissao)
              .where(
                and(
                  eq(frentesAdmissao.admissaoId, admissoes.id),
                  eq(frentesAdmissao.tipo, "AUDITORIA"),
                  eq(frentesAdmissao.concluida, true),
                ),
              ),
          ),
          // NUNCA enviado: nenhuma linha de `admissao_dados_gi` com `gi_enviado_em`. (Rede 1 de 2; a
          // rede 2 é o `jaEnviado` dentro do `enviar()`.)
          notExists(
            this.db
              .select({ um: sql`1` })
              .from(admissaoDadosGi)
              .where(
                and(
                  eq(admissaoDadosGi.admissaoId, admissoes.id),
                  sql`${admissaoDadosGi.giEnviadoEm} is not null`,
                ),
              ),
          ),
        ),
      );

    let enviados = 0;
    let recusados = 0;
    let falhas = 0;
    for (const c of candidatos) {
      const r = await this.enviarParaGi.enviar(c.id, {
        farolGlobal: c.farolGlobal,
        pausadaEm: c.pausadaEm,
        autorId: ReconciliacaoGiScheduler.AUTOR_SISTEMA,
      });
      if (r.enviado) enviados += 1;
      else if (r.motivo === "GI_FALHA_ENVIO") falhas += 1;
      else recusados += 1;
    }

    return { candidatos: candidatos.length, enviados, recusados, falhas };
  }
}
