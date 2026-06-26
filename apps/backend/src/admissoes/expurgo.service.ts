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
import { dadosVagaFolha } from "../db/schema";

/**
 * Expurgo automático do CPF de substituição (W2 / §A.6 — minimização e descarte). Sweep periódico
 * in-process (sem fila/dep extra; padrão suficiente para uma purga por TTL — BullMQ fica reservado
 * à fila do Pandapé, Fase 5). Nula o CPF e o nome do substituído nas linhas cujo `substituicao_
 * expurgar_em` já venceu (TTL 48h após a assinatura — placeholder até a INT-4 existir).
 */
@Injectable()
export class ExpurgoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ExpurgoService");
  private timer?: NodeJS.Timeout;
  private static readonly INTERVALO_MS = 60 * 60 * 1000; // 1h

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  onModuleInit(): void {
    void this.expurgar();
    this.timer = setInterval(() => void this.expurgar(), ExpurgoService.INTERVALO_MS);
    this.timer.unref?.();
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
}
