import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { cargos } from "../../db/schema";
import type { CreateCargoDto, UpdateCargoDto } from "./cargos.dto";

@Injectable()
export class CargosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list() {
    return this.db.select().from(cargos).orderBy(cargos.nome);
  }

  async create(dto: CreateCargoDto) {
    const existing = await this.db.query.cargos.findFirst({ where: eq(cargos.nome, dto.nome) });
    if (existing) throw new ConflictException("Cargo já cadastrado");
    const [row] = await this.db.insert(cargos).values(dto).returning();
    return row;
  }

  async update(id: string, dto: UpdateCargoDto) {
    // Renomear para um nome já existente colidiria com o unique de `nome` (500 cru). Antecipamos com
    // um 409 claro: o diretor vai renomear cargos para corrigir grafias e pode esbarrar em duplicata.
    if (dto.nome !== undefined) {
      const existing = await this.db.query.cargos.findFirst({ where: eq(cargos.nome, dto.nome) });
      if (existing && existing.id !== id)
        throw new ConflictException("Já existe um cargo com esse nome.");
    }
    const [row] = await this.db
      .update(cargos)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(cargos.id, id))
      .returning();
    if (!row) throw new NotFoundException("Cargo não encontrado");
    return row;
  }

  /**
   * INATIVA o cargo (ativo=false). NUNCA exclusão física, NUNCA cascata: os vínculos (admissões, régua)
   * são preservados; o cargo apenas sai das opções selecionáveis (o catálogo do wizard já filtra
   * ativo=true). Mesmo padrão da tela de clientes; reversível via `reativar`.
   */
  async inativar(id: string) {
    const [row] = await this.db
      .update(cargos)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(cargos.id, id))
      .returning({ id: cargos.id });
    if (!row) throw new NotFoundException("Cargo não encontrado");
    return { ok: true, ativo: false };
  }

  /** Reativa o cargo (volta às opções selecionáveis). */
  async reativar(id: string) {
    const [row] = await this.db
      .update(cargos)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(cargos.id, id))
      .returning({ id: cargos.id });
    if (!row) throw new NotFoundException("Cargo não encontrado");
    return { ok: true, ativo: true };
  }
}
