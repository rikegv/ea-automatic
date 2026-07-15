import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, ne } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { tarifasTransporte } from "../../db/schema";
import type { CreateTarifaDto, UpdateTarifaDto } from "./tarifas.dto";

/**
 * Catálogo de tarifas de transporte (fundação do VT Online, §A.17). Mesmo padrão dos catálogos de
 * Cargo e Motivo de declínio: soft-delete por `ativo` (NUNCA exclusão física), 409 anti-colisão.
 *
 * Chave de negócio: (cidade + tipo_transporte). O banco garante com o unique
 * `uq_tarifa_cidade_transporte`; aqui antecipamos a colisão com um 409 e mensagem clara, para o
 * admin não ver um 500 cru do driver.
 *
 * `valor` é numeric(10,2): o driver devolve string ("6.10"). Convertemos para number na borda, para
 * a tela receber JSON numérico e não precisar parsear. Gratuidade é 0, valor real de tarifa.
 * Sem dado pessoal (§A.6): tarifa pública.
 */
type TarifaRow = typeof tarifasTransporte.$inferSelect;

@Injectable()
export class TarifasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** numeric(10,2) chega como string do driver; a API expõe number. */
  private toApi(row: TarifaRow) {
    return { ...row, valor: Number(row.valor) };
  }

  async list() {
    const rows = await this.db
      .select()
      .from(tarifasTransporte)
      .orderBy(asc(tarifasTransporte.cidade), asc(tarifasTransporte.tipoTransporte));
    return rows.map((r) => this.toApi(r));
  }

  /** 409 quando já existe tarifa para o par (cidade + transporte), inclusive se estiver inativa. */
  private async garantirParLivre(cidade: string, tipoTransporte: string, ignorarId?: string) {
    const conflito = await this.db.query.tarifasTransporte.findFirst({
      where: ignorarId
        ? and(
            eq(tarifasTransporte.cidade, cidade),
            eq(tarifasTransporte.tipoTransporte, tipoTransporte),
            ne(tarifasTransporte.id, ignorarId),
          )
        : and(
            eq(tarifasTransporte.cidade, cidade),
            eq(tarifasTransporte.tipoTransporte, tipoTransporte),
          ),
    });
    if (conflito) throw new ConflictException("Já existe tarifa para essa cidade e transporte");
  }

  async create(dto: CreateTarifaDto) {
    const cidade = dto.cidade.trim();
    const tipoTransporte = dto.tipoTransporte.trim();
    await this.garantirParLivre(cidade, tipoTransporte);
    const [row] = await this.db
      .insert(tarifasTransporte)
      .values({
        cidade,
        tipoTransporte,
        valor: dto.valor.toFixed(2),
        observacao: dto.observacao?.trim() ? dto.observacao.trim() : null,
      })
      .returning();
    return this.toApi(row);
  }

  async update(id: string, dto: UpdateTarifaDto) {
    const atual = await this.db.query.tarifasTransporte.findFirst({
      where: eq(tarifasTransporte.id, id),
    });
    if (!atual) throw new NotFoundException("Tarifa não encontrada");

    // Só checa colisão quando o par muda; o par final é o que vier no dto, ou o que já está gravado.
    const cidade = dto.cidade?.trim() ?? atual.cidade;
    const tipoTransporte = dto.tipoTransporte?.trim() ?? atual.tipoTransporte;
    if (cidade !== atual.cidade || tipoTransporte !== atual.tipoTransporte) {
      await this.garantirParLivre(cidade, tipoTransporte, id);
    }

    const [row] = await this.db
      .update(tarifasTransporte)
      .set({
        cidade,
        tipoTransporte,
        ...(dto.valor !== undefined ? { valor: dto.valor.toFixed(2) } : {}),
        ...(dto.observacao !== undefined
          ? { observacao: dto.observacao.trim() ? dto.observacao.trim() : null }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(tarifasTransporte.id, id))
      .returning();
    return this.toApi(row);
  }

  /**
   * INATIVA a tarifa (ativo=false). NUNCA exclusão física: o formulário de VT (OST seguinte) deixa
   * de sugerir a tarifa, mas o histórico de quem já a usou é preservado. Reversível.
   */
  async inativar(id: string) {
    const [row] = await this.db
      .update(tarifasTransporte)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(tarifasTransporte.id, id))
      .returning({ id: tarifasTransporte.id });
    if (!row) throw new NotFoundException("Tarifa não encontrada");
    return { ok: true, ativo: false };
  }

  /** Reativa a tarifa (volta a ser sugerida no formulário de VT). */
  async reativar(id: string) {
    const [row] = await this.db
      .update(tarifasTransporte)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(tarifasTransporte.id, id))
      .returning({ id: tarifasTransporte.id });
    if (!row) throw new NotFoundException("Tarifa não encontrada");
    return { ok: true, ativo: true };
  }
}
