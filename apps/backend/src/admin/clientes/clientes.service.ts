import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { clientes } from "../../db/schema";
import type { CreateClienteDto, UpdateClienteDto } from "./clientes.dto";

@Injectable()
export class ClientesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list() {
    return this.db.select().from(clientes).orderBy(clientes.razaoSocial);
  }

  async create(dto: CreateClienteDto) {
    const existing = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, dto.codCliente),
    });
    if (existing) throw new ConflictException("cod_cliente já cadastrado");
    const [row] = await this.db.insert(clientes).values(dto).returning();
    return row;
  }

  async update(codCliente: string, dto: UpdateClienteDto) {
    const [row] = await this.db
      .update(clientes)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(clientes.codCliente, codCliente))
      .returning();
    if (!row) throw new NotFoundException("Cliente não encontrado");
    return row;
  }

  async remove(codCliente: string) {
    const [row] = await this.db
      .delete(clientes)
      .where(eq(clientes.codCliente, codCliente))
      .returning();
    if (!row) throw new NotFoundException("Cliente não encontrado");
    return { ok: true };
  }
}
