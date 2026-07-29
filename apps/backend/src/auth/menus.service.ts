import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { menus, usuarioMenus } from "../db/schema";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  TODOS_CODIGOS_MENU,
  planejarSelecaoDeMenus,
} from "../domain/menus";

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

  /**
   * SALVA A SELEÇÃO VINDA DA TELA sem apagar o que a tela não conhecia.
   *
   * Por que existe, separado do `definirMenusDoUsuario`: aquele SUBSTITUI o conjunto inteiro, o que é
   * correto para criar usuário (não há nada a preservar) e é justamente o defeito quando vem de uma
   * tela que pode estar desatualizada. Menu novo, nascido depois que a página carregou, não estava na
   * lista enviada e era apagado em silêncio. Aconteceu duas vezes, com o `assinaturas` e com o
   * `assinante-empresa`.
   *
   * Aqui a tela declara o ESCOPO que ela enxergava (`conhecidos`), e só dentro dele há remoção. O
   * plano em si é função pura (`planejarSelecaoDeMenus`), testada sem banco.
   *
   * Devolve o que ficou aplicado e o que foi PRESERVADO, para a trilha mostrar que houve preservação
   * em vez de a correção ser invisível.
   */
  async salvarSelecaoDaTela(
    usuarioId: string,
    selecionados: string[],
    conhecidos: string[],
    papel?: string,
  ): Promise<{ aplicados: string[]; preservados: string[] }> {
    const ehAdmin = papel === "MASTER" || papel === "SUPER_ADMIN";
    const permitido = (c: string) =>
      TODOS_CODIGOS_MENU.includes(c) && (ehAdmin || !MENUS_BLOQUEADOS_COMUM.has(c));

    const validos = selecionados.filter(permitido);
    const escopo = conhecidos.filter((c) => TODOS_CODIGOS_MENU.includes(c));
    const atuais = await this.codigosDoUsuario(usuarioId);

    const { inserir, remover, preservados } = planejarSelecaoDeMenus({
      atuais,
      selecionados: validos,
      conhecidos: escopo,
    });

    if (inserir.length > 0 || remover.length > 0) {
      await this.db.transaction(async (tx) => {
        if (remover.length > 0) {
          await tx
            .delete(usuarioMenus)
            .where(
              and(eq(usuarioMenus.usuarioId, usuarioId), inArray(usuarioMenus.menuCodigo, remover)),
            );
        }
        if (inserir.length > 0) {
          await tx
            .insert(usuarioMenus)
            .values(inserir.map((menuCodigo) => ({ usuarioId, menuCodigo })));
        }
      });
    }

    const aplicados = [...(await this.codigosDoUsuario(usuarioId))];
    return { aplicados, preservados };
  }
}
