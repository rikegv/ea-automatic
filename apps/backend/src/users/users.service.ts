import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { asc, eq } from "drizzle-orm";
import type { CriarUsuarioResposta, ResetSenhaResposta, UsuarioListItem } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { usuarios } from "../db/schema";
import { gerarSenhaTemporaria } from "./senha-temporaria.util";
import type { AtualizarUsuarioDto, CriarUsuarioDto } from "./users.dto";

/** Projeção pública de usuário — NUNCA inclui senhaHash (§A.6). */
const LIST_COLUMNS = {
  id: usuarios.id,
  nome: usuarios.nome,
  email: usuarios.email,
  papel: usuarios.papel,
  ativo: usuarios.ativo,
  criadoEm: usuarios.criadoEm,
} as const;

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  findByEmail(email: string) {
    return this.db.query.usuarios.findFirst({ where: eq(usuarios.email, email) });
  }

  findById(id: string) {
    return this.db.query.usuarios.findFirst({ where: eq(usuarios.id, id) });
  }

  // ── Administração de usuários (OST-EA-GESTAO-USUARIOS — Master/Super Admin) ──────────────

  /** Lista todos os usuários (sem senhaHash). */
  async listar(): Promise<UsuarioListItem[]> {
    const rows = await this.db.select(LIST_COLUMNS).from(usuarios).orderBy(asc(usuarios.nome));
    return rows.map(toListItem);
  }

  /**
   * Cria um usuário com senha temporária forte. Retorna a senha em claro APENAS aqui (nunca logada,
   * nunca persistida — só o hash argon2). E-mail duplicado → 409.
   */
  async criar(dto: CriarUsuarioDto): Promise<CriarUsuarioResposta> {
    const email = dto.email.trim().toLowerCase();
    const existente = await this.findByEmail(email);
    if (existente) throw new ConflictException("E-mail já cadastrado");

    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await argon2.hash(senhaTemporaria);
    const [row] = await this.db
      .insert(usuarios)
      .values({
        nome: dto.nome.trim(),
        email,
        senhaHash,
        papel: dto.papel,
        ativo: true,
        senhaTemporaria: true,
      })
      .returning(LIST_COLUMNS);

    return { usuario: toListItem(row), senhaTemporaria };
  }

  /**
   * Atualiza nome/email/papel/ativo. Cobre o "Desativar" (soft-delete: `ativo=false`, nunca remove
   * do banco) e a reativação. Um usuário NÃO pode se auto-desativar (evita travar o próprio acesso).
   */
  async atualizar(
    id: string,
    dto: AtualizarUsuarioDto,
    solicitanteId: string,
  ): Promise<UsuarioListItem> {
    const alvo = await this.findById(id);
    if (!alvo) throw new NotFoundException("Usuário não encontrado");

    if (dto.ativo === false && id === solicitanteId) {
      throw new BadRequestException("Você não pode desativar a si mesmo");
    }

    // Governança: ninguém altera o PRÓPRIO papel (evita auto-promoção a SUPER_ADMIN). A mudança de
    // papel de um usuário só pode ser feita por OUTRO usuário (Super Admin), nunca sobre si mesmo.
    if (dto.papel !== undefined && id === solicitanteId && dto.papel !== alvo.papel) {
      throw new ForbiddenException(
        "Você não pode alterar o próprio papel; solicite a outro Super Admin",
      );
    }

    const patch: Partial<typeof usuarios.$inferInsert> = { atualizadoEm: new Date() };
    if (dto.nome !== undefined) patch.nome = dto.nome.trim();
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== alvo.email) {
        const outro = await this.findByEmail(email);
        if (outro) throw new ConflictException("E-mail já cadastrado");
      }
      patch.email = email;
    }
    if (dto.papel !== undefined) patch.papel = dto.papel;
    if (dto.ativo !== undefined) patch.ativo = dto.ativo;

    const [row] = await this.db
      .update(usuarios)
      .set(patch)
      .where(eq(usuarios.id, id))
      .returning(LIST_COLUMNS);
    return toListItem(row);
  }

  /**
   * Reseta a senha: gera nova senha temporária forte, grava o hash e marca senhaTemporaria=true
   * (força a troca no próximo acesso). Retorna a senha em claro só nesta resposta.
   */
  async resetarSenha(id: string): Promise<ResetSenhaResposta> {
    const alvo = await this.findById(id);
    if (!alvo) throw new NotFoundException("Usuário não encontrado");

    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await argon2.hash(senhaTemporaria);
    await this.db
      .update(usuarios)
      .set({ senhaHash, senhaTemporaria: true, atualizadoEm: new Date() })
      .where(eq(usuarios.id, id));
    return { senhaTemporaria };
  }

  /**
   * Troca de senha pelo próprio usuário (primeiro acesso ou voluntária). Verifica a senha atual,
   * exige nova diferente, grava o hash e limpa a flag senhaTemporaria.
   */
  async trocarSenha(id: string, senhaAtual: string, novaSenha: string): Promise<void> {
    const u = await this.findById(id);
    if (!u) throw new NotFoundException("Usuário não encontrado");
    const ok = await argon2.verify(u.senhaHash, senhaAtual);
    if (!ok) throw new BadRequestException("Senha atual incorreta");
    if (senhaAtual === novaSenha) {
      throw new BadRequestException("A nova senha deve ser diferente da atual");
    }
    const senhaHash = await argon2.hash(novaSenha);
    await this.db
      .update(usuarios)
      .set({ senhaHash, senhaTemporaria: false, atualizadoEm: new Date() })
      .where(eq(usuarios.id, id));
  }
}

function toListItem(row: {
  id: string;
  nome: string;
  email: string;
  papel: UsuarioListItem["papel"];
  ativo: boolean;
  criadoEm: Date;
}): UsuarioListItem {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    ativo: row.ativo,
    criadoEm: row.criadoEm.toISOString(),
  };
}
