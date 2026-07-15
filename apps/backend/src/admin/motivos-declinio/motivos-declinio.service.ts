import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { motivosDeclinio } from "../../db/schema";
import type { CreateMotivoDeclinioDto, UpdateMotivoDeclinioDto } from "./motivos-declinio.dto";

// Catálogo de motivos de declínio (Fase 2). Mesmo padrão do catálogo de Cargos: soft-delete por
// `ativo` (NUNCA exclusão física nem cascata), 409 anti-colisão de nome, inativar/reativar.
@Injectable()
export class MotivosDeclinioService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list() {
    return this.db.select().from(motivosDeclinio).orderBy(motivosDeclinio.nome);
  }

  async create(dto: CreateMotivoDeclinioDto) {
    const existing = await this.db.query.motivosDeclinio.findFirst({
      where: eq(motivosDeclinio.nome, dto.nome),
    });
    if (existing) throw new ConflictException("Motivo já cadastrado");
    const [row] = await this.db.insert(motivosDeclinio).values(dto).returning();
    return row;
  }

  async update(id: string, dto: UpdateMotivoDeclinioDto) {
    // Renomear para um nome já existente colidiria com o unique de `nome` (500 cru): antecipamos com
    // um 409 claro (o diretor renomeia para corrigir grafias e pode esbarrar em duplicata).
    if (dto.nome !== undefined) {
      const existing = await this.db.query.motivosDeclinio.findFirst({
        where: eq(motivosDeclinio.nome, dto.nome),
      });
      if (existing && existing.id !== id)
        throw new ConflictException("Já existe um motivo com esse nome.");
    }
    const [row] = await this.db
      .update(motivosDeclinio)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(motivosDeclinio.id, id))
      .returning();
    if (!row) throw new NotFoundException("Motivo não encontrado");
    return row;
  }

  /**
   * INATIVA o motivo (ativo=false). NUNCA exclusão física, NUNCA cascata: as admissões que já apontam
   * para o motivo preservam o vínculo; o motivo só sai das opções selecionáveis. Reversível.
   */
  async inativar(id: string) {
    const [row] = await this.db
      .update(motivosDeclinio)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(motivosDeclinio.id, id))
      .returning({ id: motivosDeclinio.id });
    if (!row) throw new NotFoundException("Motivo não encontrado");
    return { ok: true, ativo: false };
  }

  /** Reativa o motivo (volta às opções selecionáveis). */
  async reativar(id: string) {
    const [row] = await this.db
      .update(motivosDeclinio)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(motivosDeclinio.id, id))
      .returning({ id: motivosDeclinio.id });
    if (!row) throw new NotFoundException("Motivo não encontrado");
    return { ok: true, ativo: true };
  }
}
