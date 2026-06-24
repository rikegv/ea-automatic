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
    const [row] = await this.db
      .update(cargos)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(cargos.id, id))
      .returning();
    if (!row) throw new NotFoundException("Cargo não encontrado");
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db.delete(cargos).where(eq(cargos.id, id)).returning();
    if (!row) throw new NotFoundException("Cargo não encontrado");
    return { ok: true };
  }
}
