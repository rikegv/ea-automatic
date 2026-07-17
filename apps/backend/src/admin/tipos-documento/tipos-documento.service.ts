import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { tiposDocumento } from "../../db/schema";
import type { CreateTipoDocumentoDto, UpdateTipoDocumentoDto } from "./tipos-documento.dto";

/**
 * `codigo` é a chave técnica (unique) e o formulário pede só o nome, então derivamos: sem acento,
 * caixa alta, o que não for alfanumérico vira "_". Mantém o formato dos 21 tipos do seed
 * (ex.: "Carteira de trabalho" -> "CARTEIRA_DE_TRABALHO").
 */
export function derivarCodigo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

@Injectable()
export class TiposDocumentoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Visão de gestão: ativos E inativos (a tela da régua separa por filtro). */
  list() {
    return this.db.select().from(tiposDocumento).orderBy(asc(tiposDocumento.nome));
  }

  async create(dto: CreateTipoDocumentoDto) {
    const nome = dto.nome.trim();
    const codigo = derivarCodigo(nome);
    if (!codigo) {
      throw new BadRequestException("Informe um nome com ao menos uma letra ou número.");
    }
    await this.garantirNomeLivre(nome);
    const colisaoCodigo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, codigo),
    });
    if (colisaoCodigo) {
      throw new ConflictException(
        `Já existe um documento equivalente a esse nome: "${colisaoCodigo.nome}".`,
      );
    }
    const [row] = await this.db.insert(tiposDocumento).values({ codigo, nome }).returning();
    return row;
  }

  async update(id: string, dto: UpdateTipoDocumentoDto) {
    const nome = dto.nome.trim();
    if (!nome) throw new BadRequestException("O nome não pode ficar vazio.");
    await this.garantirNomeLivre(nome, id);
    // O `codigo` NÃO é regerado ao renomear: ele é a identidade técnica que o resto do sistema já
    // usa para achar o documento (ex.: TERMO_BANCO no Gerenciador). Renomear corrige a grafia
    // exibida, não troca o documento de identidade.
    const [row] = await this.db
      .update(tiposDocumento)
      .set({ nome })
      .where(eq(tiposDocumento.id, id))
      .returning();
    if (!row) throw new NotFoundException("Documento não encontrado");
    return row;
  }

  /**
   * INATIVA (ativo=false). Nunca exclusão física (§A.6): as réguas já cadastradas e os documentos
   * de admissões antigas referenciam este id e são preservados. Reversível via `reativar`.
   */
  async inativar(id: string) {
    const [row] = await this.db
      .update(tiposDocumento)
      .set({ ativo: false })
      .where(eq(tiposDocumento.id, id))
      .returning({ id: tiposDocumento.id });
    if (!row) throw new NotFoundException("Documento não encontrado");
    return { ok: true, ativo: false };
  }

  /** Reativa o documento (volta à lista de ativos da régua). */
  async reativar(id: string) {
    const [row] = await this.db
      .update(tiposDocumento)
      .set({ ativo: true })
      .where(eq(tiposDocumento.id, id))
      .returning({ id: tiposDocumento.id });
    if (!row) throw new NotFoundException("Documento não encontrado");
    return { ok: true, ativo: true };
  }

  /**
   * O nome é a identidade visível do documento, e o modal de Auditoria da Esteira resolve documento
   * por NOME (mapa nome -> id). Nome duplicado colidiria silenciosamente lá. O schema só garante
   * unique no `codigo`, então a trava de nome mora aqui.
   */
  private async garantirNomeLivre(nome: string, ignorarId?: string) {
    const existente = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.nome, nome),
    });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException("Já existe um documento com esse nome.");
    }
  }
}
