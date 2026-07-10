import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { reguaDocumental } from "../../db/schema";
import type { UpsertReguaDto } from "./regua.dto";

@Injectable()
export class ReguaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Régua atual de um par (cliente + cargo) — coração da auditoria/checklist (§A.3). */
  list(codCliente: string, cargoId: string) {
    return this.db
      .select()
      .from(reguaDocumental)
      .where(
        and(eq(reguaDocumental.codCliente, codCliente), eq(reguaDocumental.cargoId, cargoId)),
      );
  }

  /** Upsert por (cod_cliente + cargo + tipo_documento) — define a exigência de cada documento. */
  async upsert(dto: UpsertReguaDto) {
    for (const item of dto.itens) {
      await this.db
        .insert(reguaDocumental)
        .values({
          codCliente: dto.codCliente,
          cargoId: dto.cargoId,
          tipoDocumentoId: item.tipoDocumentoId,
          exigencia: item.exigencia,
        })
        .onConflictDoUpdate({
          target: [
            reguaDocumental.codCliente,
            reguaDocumental.cargoId,
            reguaDocumental.tipoDocumentoId,
          ],
          set: { exigencia: item.exigencia, atualizadoEm: new Date() },
        });
    }
    return this.list(dto.codCliente, dto.cargoId);
  }

  async remove(codCliente: string, cargoId: string, tipoDocumentoId: string) {
    await this.db
      .delete(reguaDocumental)
      .where(
        and(
          eq(reguaDocumental.codCliente, codCliente),
          eq(reguaDocumental.cargoId, cargoId),
          eq(reguaDocumental.tipoDocumentoId, tipoDocumentoId),
        ),
      );
    return { ok: true };
  }

  /**
   * Inativa a régua de um cliente (§A.12, CRUD do painel "Com régua"): remove TODAS as linhas de
   * régua do cliente, devolvendo-o à lista "sem régua". Ação da administração (Master/Super Admin).
   */
  async removeCliente(codCliente: string) {
    await this.db
      .delete(reguaDocumental)
      .where(eq(reguaDocumental.codCliente, codCliente));
    return { ok: true };
  }
}
