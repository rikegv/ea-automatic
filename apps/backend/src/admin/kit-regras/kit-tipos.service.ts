import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { kitRegraDocumento, kitTipo } from "../../db/schema";
import type { AtualizarKitTipoDto, CriarKitTipoDto } from "./kit-regras.dto";

/**
 * Kits do Gerador de Kit por tipo de vínculo (OST). CRUD só de Master/Super Admin (guard no
 * controller). Cada kit tem seu próprio dicionário de títulos (kit_regra_documento).
 */
@Injectable()
export class KitTiposService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Lista os kits na ordem cadastrada, com a contagem de documentos de cada um. */
  async list() {
    const kits = await this.db
      .select()
      .from(kitTipo)
      .orderBy(asc(kitTipo.ordem), asc(kitTipo.nome));
    const contagens = await this.db
      .select({
        kitTipoId: kitRegraDocumento.kitTipoId,
        total: sql<number>`count(*)::int`,
      })
      .from(kitRegraDocumento)
      .groupBy(kitRegraDocumento.kitTipoId);
    const mapa = new Map(contagens.map((c) => [c.kitTipoId, c.total]));
    return kits.map((k) => ({ ...k, documentos: mapa.get(k.id) ?? 0 }));
  }

  /** Cria um kit no fim da lista (ordem = maior atual + 1). Nome único (case-insensitive). */
  async criar(dto: CriarKitTipoDto) {
    const nome = dto.nome?.trim();
    if (!nome) throw new BadRequestException("Nome do kit é obrigatório");
    await this.assertNomeLivre(nome);
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${kitTipo.ordem}), 0)::int` })
      .from(kitTipo);
    const [row] = await this.db
      .insert(kitTipo)
      .values({ nome, ordem: (max ?? 0) + 1, ativo: true })
      .returning();
    return { ...row, documentos: 0 };
  }

  /** Edita nome e/ou ativo do kit. */
  async atualizar(id: string, dto: AtualizarKitTipoDto) {
    const atual = await this.db.query.kitTipo.findFirst({ where: eq(kitTipo.id, id) });
    if (!atual) throw new NotFoundException("Kit não encontrado");
    const patch: Partial<typeof kitTipo.$inferInsert> = { atualizadoEm: new Date() };
    if (dto.nome !== undefined) {
      const nome = dto.nome.trim();
      if (!nome) throw new BadRequestException("Nome do kit é obrigatório");
      if (nome.toLowerCase() !== atual.nome.toLowerCase()) await this.assertNomeLivre(nome);
      patch.nome = nome;
    }
    if (dto.ativo !== undefined) patch.ativo = dto.ativo;
    const [row] = await this.db.update(kitTipo).set(patch).where(eq(kitTipo.id, id)).returning();
    return row;
  }

  /** Remove um kit (cascade apaga seus documentos). */
  async remover(id: string) {
    const [row] = await this.db
      .delete(kitTipo)
      .where(eq(kitTipo.id, id))
      .returning({ id: kitTipo.id });
    if (!row) throw new NotFoundException("Kit não encontrado");
    return { ok: true };
  }

  private async assertNomeLivre(nome: string) {
    const existe = await this.db
      .select({ id: kitTipo.id })
      .from(kitTipo)
      .where(sql`lower(${kitTipo.nome}) = lower(${nome})`)
      .limit(1);
    if (existe.length) throw new ConflictException("Já existe um kit com esse nome.");
  }
}
