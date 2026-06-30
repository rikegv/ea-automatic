import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { regrasAuditoria, tiposDocumento } from "../../db/schema";
import type { CreateRegraDto, UpdateRegraDto } from "./regras.dto";

/**
 * CRUD das regras de auditoria (critério de validade da IA por tipo de documento — Fase 4 / §A.9).
 * Restrito a Master/Super Admin no controller. Espelha o template de admin/regua.
 */
@Injectable()
export class RegrasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Lista regras, opcionalmente filtradas por tipo de documento. */
  list(tipoDocumentoId?: string) {
    const q = this.db.select().from(regrasAuditoria);
    if (tipoDocumentoId) {
      return q.where(eq(regrasAuditoria.tipoDocumentoId, tipoDocumentoId)).orderBy(
        asc(regrasAuditoria.criadoEm),
      );
    }
    return q.orderBy(asc(regrasAuditoria.tipoDocumentoId), asc(regrasAuditoria.criadoEm));
  }

  async create(dto: CreateRegraDto) {
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.id, dto.tipoDocumentoId),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento não encontrado");

    const [row] = await this.db
      .insert(regrasAuditoria)
      .values({
        tipoDocumentoId: dto.tipoDocumentoId,
        descricaoRegra: dto.descricaoRegra.trim(),
        ativo: dto.ativo ?? true,
      })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateRegraDto) {
    const [row] = await this.db
      .update(regrasAuditoria)
      .set({
        ...(dto.descricaoRegra !== undefined ? { descricaoRegra: dto.descricaoRegra.trim() } : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(regrasAuditoria.id, id))
      .returning();
    if (!row) throw new NotFoundException("Regra não encontrada");
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db
      .delete(regrasAuditoria)
      .where(eq(regrasAuditoria.id, id))
      .returning({ id: regrasAuditoria.id });
    if (!row) throw new NotFoundException("Regra não encontrada");
    return { ok: true, id: row.id };
  }
}
