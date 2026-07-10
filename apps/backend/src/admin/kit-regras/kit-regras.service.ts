import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { kitRegraDocumento, kitTipo } from "../../db/schema";
import type { AtualizarKitRegraDto, CriarKitRegraDto } from "./kit-regras.dto";

/**
 * Documentos de um KIT (OST). Dicionário de TÍTULOS + ordem, escopado por kit_tipo_id. O motor
 * (etapas seguintes) lê a lista do KIT selecionado no upload. CRUD só de Master/Super Admin.
 */
@Injectable()
export class KitRegrasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Documentos de um kit, na ordem cadastrada. */
  async list(kitTipoId: string) {
    if (!kitTipoId?.trim()) throw new BadRequestException("kitTipoId é obrigatório");
    return this.db
      .select()
      .from(kitRegraDocumento)
      .where(eq(kitRegraDocumento.kitTipoId, kitTipoId))
      .orderBy(asc(kitRegraDocumento.ordem), asc(kitRegraDocumento.titulo));
  }

  /** Cria um título no fim da lista do kit (ordem = maior do kit + 1). Único dentro do kit. */
  async criar(dto: CriarKitRegraDto) {
    const titulo = dto.titulo?.trim();
    if (!titulo) throw new BadRequestException("Título é obrigatório");
    const kit = await this.db.query.kitTipo.findFirst({ where: eq(kitTipo.id, dto.kitTipoId) });
    if (!kit) throw new NotFoundException("Kit não encontrado");
    await this.assertTituloLivre(dto.kitTipoId, titulo);
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${kitRegraDocumento.ordem}), 0)::int` })
      .from(kitRegraDocumento)
      .where(eq(kitRegraDocumento.kitTipoId, dto.kitTipoId));
    const [row] = await this.db
      .insert(kitRegraDocumento)
      .values({ kitTipoId: dto.kitTipoId, titulo, ordem: (max ?? 0) + 1, ativo: true })
      .returning();
    return row;
  }

  /** Edita título e/ou ativo de um documento. Título continua único dentro do kit. */
  async atualizar(id: string, dto: AtualizarKitRegraDto) {
    const atual = await this.db.query.kitRegraDocumento.findFirst({
      where: eq(kitRegraDocumento.id, id),
    });
    if (!atual) throw new NotFoundException("Documento do kit não encontrado");
    const patch: Partial<typeof kitRegraDocumento.$inferInsert> = { atualizadoEm: new Date() };
    if (dto.titulo !== undefined) {
      const titulo = dto.titulo.trim();
      if (!titulo) throw new BadRequestException("Título é obrigatório");
      if (titulo.toLowerCase() !== atual.titulo.toLowerCase()) {
        await this.assertTituloLivre(atual.kitTipoId, titulo);
      }
      patch.titulo = titulo;
    }
    if (dto.ativo !== undefined) patch.ativo = dto.ativo;
    const [row] = await this.db
      .update(kitRegraDocumento)
      .set(patch)
      .where(eq(kitRegraDocumento.id, id))
      .returning();
    return row;
  }

  /** Remove um documento do kit. */
  async remover(id: string) {
    const [row] = await this.db
      .delete(kitRegraDocumento)
      .where(eq(kitRegraDocumento.id, id))
      .returning({ id: kitRegraDocumento.id });
    if (!row) throw new NotFoundException("Documento do kit não encontrado");
    return { ok: true };
  }

  /** Reordena (drag-and-drop) os documentos de um kit: `ordem` = posição na lista `ids`. */
  async reordenar(ids: string[]) {
    if (!ids.length) return [];
    // Todos os ids têm de ser do mesmo kit (evita reordenar entre kits por engano).
    const linhas = await this.db
      .select({ id: kitRegraDocumento.id, kitTipoId: kitRegraDocumento.kitTipoId })
      .from(kitRegraDocumento)
      .where(inArray(kitRegraDocumento.id, ids));
    const kits = new Set(linhas.map((l) => l.kitTipoId));
    if (kits.size !== 1 || linhas.length !== ids.length) {
      throw new BadRequestException("Reordenação inválida: os documentos devem ser do mesmo kit.");
    }
    const kitTipoId = [...kits][0];
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(kitRegraDocumento)
          .set({ ordem: i + 1, atualizadoEm: new Date() })
          .where(eq(kitRegraDocumento.id, ids[i]));
      }
    });
    return this.list(kitTipoId);
  }

  private async assertTituloLivre(kitTipoId: string, titulo: string) {
    const existe = await this.db
      .select({ id: kitRegraDocumento.id })
      .from(kitRegraDocumento)
      .where(
        and(
          eq(kitRegraDocumento.kitTipoId, kitTipoId),
          sql`lower(${kitRegraDocumento.titulo}) = lower(${titulo})`,
        ),
      )
      .limit(1);
    if (existe.length) throw new ConflictException("Já existe esse título neste kit.");
  }
}
