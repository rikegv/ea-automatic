import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { CODIGOS_REGUA_PADRAO } from "@ea/shared-types";
import { and, eq, inArray, isNotNull, notExists, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, reguaDocumental, tiposDocumento } from "../db/schema";
import { ReguaCompletudeService } from "./regua-completude.service";

/**
 * ─ A RÉGUA PADRÃO APLICADA SOZINHA: "CLIENTE COM CARGO CADASTRADO FICA COM RÉGUA" ──────────────
 *
 * Decisão do diretor: a régua padrão deixa de depender do lote manual da tela de Admin. Toda admissão
 * VIVA (EM_ADMISSAO / BANCO_AGUARDAR) cujo par (cliente + cargo) não tem NENHUMA régua cadastrada
 * passa a receber a régua padrão (`CODIGOS_REGUA_PADRAO`, a MESMA fonte única de `aplicarPadraoNosPendentes`)
 * e a materializar os documentos, automaticamente.
 *
 * ┌─ POR QUE RECONCILIAÇÃO NO PROCESSO, E NÃO UM GANCHO NO NASCIMENTO ───────────────────────────┐
 * │ O nascimento (create / liberar / liberar em lote) tem comportamento VALIDADO que esta frente  │
 * │ NÃO altera (§A.14): o lote BARRA o par sem régua de propósito (teste                           │
 * │ `admissoes.liberar-lote.spec.ts`), e a liberação individual deixa nascer sem checklist         │
 * │ (regra 5, `temRegua`). Reconciliar DEPOIS, por varredura, cumpre a regra do diretor SEM tocar  │
 * │ nenhum desses caminhos: nada no `AdmissoesService` muda, nenhum teste validado quebra.         │
 * │                                                                                                │
 * │ É o padrão desta casa para varredura periódica (`DeParaClienteSchedulerService`,               │
 * │ `RetencaoCandidatosService`, `ExpurgoService`): agendador no processo, sem rota interna nova e  │
 * │ sem cron na VM (que não tem sessão para alcançar a rota atrás do guard).                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ IDEMPOTENTE, NÃO-DESTRUTIVO, NÃO SOBRESCREVE (a mesma semântica do `aplicarPadraoNosPendentes`) ┐
 * │ O ALVO é só o par com ZERO linha de régua (`notExists` sobre `regua_documental` do par), então  │
 * │ régua editada à mão (padrão OU custom, inclusive um par só com FACULTATIVO) fica INTOCADA. O    │
 * │ insert ainda vai `onConflictDoNothing`, e a materialização é a do `ReguaCompletudeService`      │
 * │ (`onConflictDoNothing` por (admissão, tipo)): o estado de documento que JÁ existe, inclusive    │
 * │ ENTREGUE / validado, é preservado. Rodar N vezes converge e não reabre nada.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As QUATRO condições do agendador são as mesmas da casa (ver `DeParaClienteSchedulerService`):
 *  1. kill-switch por env (`REGUA_RECONCILIACAO=off`) nasce INERTE e diz isso UMA vez, no boot;
 *  2. a primeira passada é ATRASADA (não roda no `onModuleInit`, que sobe junto do resto);
 *  3. uma passada NÃO atropela a outra (trava de processo, pulos contados);
 *  4. falha NÃO derruba o processo (captura; promessa rejeitada sem catch mata o Node 20 e viraria
 *     crash-loop levando junto Esteira/Admissões/Clicksign).
 *
 * §A.6: o log é CONTAGEM e nada mais (pares, linhas de régua, admissões materializadas, pulos). Nunca
 * CPF, nome, cliente ou cargo.
 */
@Injectable()
export class ReconciliacaoReguaScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ReconciliacaoRegua");
  private timerDaPrimeira?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  /** Trava de concorrência de PROCESSO (o backend é um processo só hoje). */
  private rodando = false;
  /** Passadas puladas por já haver uma viva. Número, nunca linha (§A.6). */
  private puladas = 0;

  /** Cadência folgada: o alvo normalmente é vazio (nada a fazer), então 10 min é barato e pronto. */
  static readonly INTERVALO_MS = 10 * 60 * 1000;
  /** Atraso da primeira passada: os três serviços sobem juntos; 2 min é folga para o boot assentar. */
  static readonly ATRASO_DA_PRIMEIRA_MS = 2 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly completude: ReguaCompletudeService,
  ) {}

  onModuleInit(): void {
    if (process.env.REGUA_RECONCILIACAO === "off") {
      this.logger.log(
        "Reconciliação da régua padrão INERTE: REGUA_RECONCILIACAO=off. Nenhuma varredura é agendada e nada é escrito.",
      );
      return;
    }
    this.timerDaPrimeira = setTimeout(
      () => this.passada(),
      ReconciliacaoReguaScheduler.ATRASO_DA_PRIMEIRA_MS,
    );
    this.timerDaPrimeira.unref?.();
    this.timer = setInterval(() => this.passada(), ReconciliacaoReguaScheduler.INTERVALO_MS);
    this.timer.unref?.();
    this.logger.log(
      "Reconciliação da régua padrão agendada (cadência 10 min, primeira passada em 2 min).",
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
        `Reconciliação da régua padrão PULADA: a passada anterior ainda está rodando ` +
          `(${this.puladas} pulada(s) desde a subida).`,
      );
      return;
    }
    this.rodando = true;
    void this.reconciliar()
      .then((r) => {
        if (r.admissoesMaterializadas > 0 || r.linhasRegua > 0) {
          this.logger.log(
            `Reconciliação da régua padrão: ${r.pares} par(es) sem régua, ` +
              `${r.linhasRegua} linha(s) de régua criada(s), ` +
              `${r.admissoesMaterializadas} admissão(ões) materializada(s).`,
          );
        }
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Falha na reconciliação da régua padrão: ${err instanceof Error ? err.message : String(err)}. ` +
            "Nada foi apagado, e a próxima passada tenta de novo.",
        );
      })
      .finally(() => {
        this.rodando = false;
      });
  }

  /**
   * O MIOLO, separado do agendador para ser testável. Aplica a régua padrão nos pares VIVOS sem régua
   * e materializa os documentos, reusando `CODIGOS_REGUA_PADRAO` e `sincronizarDocumentosDaRegua`.
   */
  async reconciliar(): Promise<{
    pares: number;
    linhasRegua: number;
    admissoesMaterializadas: number;
  }> {
    // Admissões VIVAS com cliente+cargo e com ZERO régua no par (qualquer exigência: não tocar custom).
    const alvo = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
      })
      .from(admissoes)
      .where(
        and(
          inArray(admissoes.farolGlobal, ["EM_ADMISSAO", "BANCO_AGUARDAR"]),
          isNotNull(admissoes.codCliente),
          isNotNull(admissoes.cargoId),
          notExists(
            this.db
              .select({ um: sql`1` })
              .from(reguaDocumental)
              .where(
                and(
                  eq(reguaDocumental.codCliente, admissoes.codCliente),
                  eq(reguaDocumental.cargoId, admissoes.cargoId),
                ),
              ),
          ),
        ),
      );

    if (alvo.length === 0) return { pares: 0, linhasRegua: 0, admissoesMaterializadas: 0 };

    const tipos = await this.db
      .select({ id: tiposDocumento.id })
      .from(tiposDocumento)
      .where(inArray(tiposDocumento.codigo, [...CODIGOS_REGUA_PADRAO]));

    const pares = [
      ...new Map(
        alvo
          .filter((a): a is { id: string; codCliente: string; cargoId: string } =>
            Boolean(a.codCliente && a.cargoId),
          )
          .map((a) => [`${a.codCliente}|${a.cargoId}`, { codCliente: a.codCliente, cargoId: a.cargoId }]),
      ).values(),
    ];

    let linhasRegua = 0;
    if (tipos.length > 0 && pares.length > 0) {
      const valores = pares.flatMap((p) =>
        tipos.map((t) => ({
          codCliente: p.codCliente,
          cargoId: p.cargoId,
          tipoDocumentoId: t.id,
          exigencia: "OBRIGATORIO" as const,
        })),
      );
      const inseridas = await this.db
        .insert(reguaDocumental)
        .values(valores)
        .onConflictDoNothing()
        .returning({ codCliente: reguaDocumental.codCliente });
      linhasRegua = inseridas.length;
    }

    // Materializa os documentos em cada admissão viva, pelo método autoritativo (vínculo/porDocumento,
    // onConflictDoNothing, preserva estado existente).
    for (const a of alvo) await this.completude.sincronizarDocumentosDaRegua(a.id);

    return { pares: pares.length, linhasRegua, admissoesMaterializadas: alvo.length };
  }
}
