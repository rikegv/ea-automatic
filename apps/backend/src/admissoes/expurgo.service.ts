import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, isNotNull, lte } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoDadosGi, dadosVagaFolha, portalConferencia } from "../db/schema";

/**
 * Expurgo automático por TTL (§A.6 — minimização e descarte). Sweep periódico in-process (sem
 * fila/dep extra; BullMQ fica reservado às filas do Pandapé/Clicksign). Cobre DUAS retenções:
 *  - o CPF de substituição (W2): nula CPF/nome do substituído nas linhas com `substituicao_
 *    expurgar_em` vencido (TTL 48h após a assinatura);
 *  - os DADOS DO GI (Portal→GI, peça 2 / B3): apaga as linhas de `admissao_dados_gi` com
 *    `expurgar_em` vencido — o EA não vira repositório permanente de RG e PIS (§A.6);
 *  - a CONFERÊNCIA do Portal (bugs de tela): apaga as linhas de `portal_conferencia` com
 *    `expurgar_em` vencido (TTL 48h) — o resultado da IA é efêmero, mesmo princípio da staging.
 */
@Injectable()
export class ExpurgoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ExpurgoService");
  private timer?: NodeJS.Timeout;
  private static readonly INTERVALO_MS = 60 * 60 * 1000; // 1h

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  onModuleInit(): void {
    void this.expurgarTudo();
    this.timer = setInterval(() => void this.expurgarTudo(), ExpurgoService.INTERVALO_MS);
    this.timer.unref?.();
  }

  /**
   * Roda as purgas por TTL num ciclo. Uma falhando NÃO impede a outra (C3): cada chamada vai no seu
   * próprio `try`, e uma exceção numa purga vira log de erro sem abortar as demais.
   */
  private async expurgarTudo(): Promise<void> {
    await this.tentar("substituicao", () => this.expurgar());
    await this.tentar("dados GI", () => this.expurgarDadosGi());
    await this.tentar("conferencia do portal", () => this.expurgarConferencia());
  }

  /** Isola cada purga: uma exceção vira log de erro (sem PII) e não derruba as outras (C3). */
  private async tentar(nome: string, purga: () => Promise<number>): Promise<void> {
    try {
      await purga();
    } catch (erro) {
      this.logger.error(`Falha no expurgo de ${nome} por TTL.`, erro as Error);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Descarta o CPF/nome do substituído nas linhas com TTL vencido. Retorna quantas linhas. */
  async expurgar(): Promise<number> {
    const linhas = await this.db
      .update(dadosVagaFolha)
      .set({ substituidoCpf: null, substituidoNome: null, substituicaoExpurgarEm: null })
      .where(
        and(
          isNotNull(dadosVagaFolha.substituidoCpf),
          lte(dadosVagaFolha.substituicaoExpurgarEm, new Date()),
        ),
      )
      .returning({ id: dadosVagaFolha.id });
    if (linhas.length > 0) {
      this.logger.log(`Expurgo de substituição: ${linhas.length} CPF(s) descartado(s) por TTL.`);
    }
    return linhas.length;
  }

  /**
   * Apaga as linhas de `admissao_dados_gi` com `expurgar_em` vencido (Portal→GI, peça 2 / B3).
   * Apaga a linha INTEIRA: todas as colunas de valor são PII do GI, e a linha é uma por admissão.
   * O rastro do aceite (`portal_dados_gi_aceites`, PII-free) sobrevive de propósito. §A.6: o log
   * leva só a contagem. Retorna quantas linhas. Idempotente.
   */
  async expurgarDadosGi(): Promise<number> {
    const linhas = await this.db
      .delete(admissaoDadosGi)
      .where(
        and(
          isNotNull(admissaoDadosGi.expurgarEm),
          lte(admissaoDadosGi.expurgarEm, new Date()),
        ),
      )
      .returning({ id: admissaoDadosGi.id });
    if (linhas.length > 0) {
      this.logger.log(`Expurgo de dados GI: ${linhas.length} linha(s) apagada(s) por TTL.`);
    }
    return linhas.length;
  }

  /**
   * Apaga as linhas de `portal_conferencia` com `expurgar_em` vencido (TTL 48h). O resultado da IA
   * (campos lidos + veredito) é DISPLAY-ONLY e efêmero: some 48h após a leitura, mesmo princípio da
   * staging. Apagar não afeta o teto de tentativas, que mora em `portal_credenciais.reprovado_em`
   * (C10). §A.6: o log leva só a contagem. Retorna quantas linhas. Idempotente.
   */
  async expurgarConferencia(): Promise<number> {
    const linhas = await this.db
      .delete(portalConferencia)
      .where(
        and(
          isNotNull(portalConferencia.expurgarEm),
          lte(portalConferencia.expurgarEm, new Date()),
        ),
      )
      .returning({ id: portalConferencia.id });
    if (linhas.length > 0) {
      this.logger.log(`Expurgo de conferencia do portal: ${linhas.length} linha(s) apagada(s) por TTL.`);
    }
    return linhas.length;
  }
}
