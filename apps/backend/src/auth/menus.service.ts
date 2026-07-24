import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { menus, usuarioMenus } from "../db/schema";
import { MENUS, MENUS_BLOQUEADOS_COMUM, TODOS_CODIGOS_MENU } from "../domain/menus";

/**
 * Leitura da permissão de MENU de um usuário (OST permissão de menu).
 *
 * PONTO ÚNICO consumido pelo `MenuGuard` (autorização por requisição) e pelo `/auth/me` (visão da
 * tela). MASTER/SUPER_ADMIN não passam por aqui: quem trata o bypass é o chamador, para nunca
 * depender de dado de tabela e nunca poder se trancar fora.
 */
@Injectable()
export class MenusService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Códigos de menu que o usuário tem. Conjunto para busca O(1) no guard. */
  async codigosDoUsuario(usuarioId: string): Promise<Set<string>> {
    const linhas = await this.db
      .select({ codigo: usuarioMenus.menuCodigo })
      .from(usuarioMenus)
      .where(eq(usuarioMenus.usuarioId, usuarioId));
    return new Set(linhas.map((l) => l.codigo));
  }

  /** Catálogo de menus ATIVOS, na ordem, lido da tabela (fonte de verdade da tela de configuração). */
  async catalogo() {
    const linhas = await this.db
      .select({
        codigo: menus.codigo,
        rotulo: menus.rotulo,
        href: menus.href,
        grupo: menus.grupo,
        ordem: menus.ordem,
      })
      .from(menus)
      .where(eq(menus.ativo, true))
      .orderBy(menus.ordem);
    // Fallback defensivo: se a tabela ainda não foi semeada, usa o registro em código, para a tela
    // nunca aparecer vazia num ambiente recém-migrado.
    if (linhas.length === 0) {
      return MENUS.map(({ codigo, rotulo, href, grupo, ordem }) => ({
        codigo,
        rotulo,
        href,
        grupo,
        ordem,
      }));
    }
    return linhas;
  }

  /**
   * Substitui a associação do usuário pelo conjunto informado (usado pela tela de configuração e pela
   * criação de usuário). Devolve os códigos EFETIVAMENTE aplicados.
   *
   * `papel` do alvo: quando NÃO é admin, filtra fora os menus bloqueados para COMUM (Diagnóstico e
   * Usuários, `@Roles` admin-only), que só apareceriam na barra e seriam barrados no backend. Sem
   * `papel` informado, mantém o comportamento antigo (não filtra) por segurança.
   */
  async definirMenusDoUsuario(
    usuarioId: string,
    codigos: string[],
    papel?: string,
  ): Promise<string[]> {
    const ehAdmin = papel === "MASTER" || papel === "SUPER_ADMIN";
    // Só códigos que existem no registro entram (ignora lixo do cliente, sem quebrar); e, para
    // não-admin, remove os bloqueados para COMUM.
    const validos = codigos.filter(
      (c) => TODOS_CODIGOS_MENU.includes(c) && (ehAdmin || !MENUS_BLOQUEADOS_COMUM.has(c)),
    );
    await this.db.transaction(async (tx) => {
      await tx.delete(usuarioMenus).where(eq(usuarioMenus.usuarioId, usuarioId));
      if (validos.length > 0) {
        await tx
          .insert(usuarioMenus)
          .values(validos.map((menuCodigo) => ({ usuarioId, menuCodigo })));
      }
    });
    return validos;
  }
}
