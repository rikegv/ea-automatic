import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import type { Area } from "@ea/shared-types";
import { menus, usuarioAreas, usuarioMenus } from "../db/schema";
import {
  AREAS_DE_NASCIMENTO,
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  TODOS_CODIGOS_MENU,
  planejarSelecaoDeMenus,
} from "../domain/menus";
import { MenuAreasService } from "./menu-areas.service";

/**
 * Leitura da permissão de MENU de um usuário (OST permissão de menu).
 *
 * PONTO ÚNICO consumido pelo `MenuGuard` (autorização por requisição) e pelo `/auth/me` (visão da
 * tela). MASTER/SUPER_ADMIN não passam por aqui: quem trata o bypass é o chamador, para nunca
 * depender de dado de tabela e nunca poder se trancar fora.
 */
@Injectable()
export class MenusService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly menuAreas: MenuAreasService,
  ) {}

  /** Códigos de menu que o usuário tem. Conjunto para busca O(1) no guard. */
  async codigosDoUsuario(usuarioId: string): Promise<Set<string>> {
    const linhas = await this.db
      .select({ codigo: usuarioMenus.menuCodigo })
      .from(usuarioMenus)
      .where(eq(usuarioMenus.usuarioId, usuarioId));
    return new Set(linhas.map((l) => l.codigo));
  }

  /**
   * ÁREAS do usuário (segmentação do módulo de A&S).
   *
   * LIDA DO BANCO, NUNCA DO JWT, e essa é uma decisão consciente: o `req.user` é montado a partir do
   * payload do token, que é imutável até o refresh. Área no token significaria "o diretor mudou a
   * área e o usuário só sente ao relogar", que é o tipo de comportamento que vira chamado. Do banco,
   * a mudança vale já na requisição seguinte.
   *
   * Conjunto vazio é FAIL-CLOSED: sem área, o usuário não enxerga menu nenhum além do Início. O
   * backfill atômico da migration garante que ninguém real esteja nesse estado.
   */
  async areasDoUsuario(usuarioId: string): Promise<Set<Area>> {
    const linhas = await this.db
      .select({ area: usuarioAreas.area })
      .from(usuarioAreas)
      .where(eq(usuarioAreas.usuarioId, usuarioId));
    return new Set(linhas.map((l) => l.area));
  }

  /**
   * Menus E áreas do usuário numa ida só ao banco.
   *
   * UMA IDA E NÃO DUAS porque é o que o `MenuGuard` consome a cada operação gatada. O MASTER, que
   * antes saía do guard antes de qualquer consulta, passou a depender da área; fazer duas consultas
   * onde uma resolve dobraria esse custo novo sem necessidade.
   */
  async permissaoDoUsuario(usuarioId: string): Promise<{ codigos: Set<string>; areas: Set<Area> }> {
    const [codigos, areas] = await Promise.all([
      this.codigosDoUsuario(usuarioId),
      this.areasDoUsuario(usuarioId),
    ]);
    return { codigos, areas };
  }

  /** Substitui as áreas do usuário pelo conjunto informado. Vazio é válido (fail-closed). */
  async definirAreasDoUsuario(usuarioId: string, areas: Area[]): Promise<Area[]> {
    // Deduplica e descarta lixo do cliente: a chave da tabela é (usuário + área), então repetido
    // estouraria a PK em vez de ser ignorado.
    const validos = [...new Set(areas)].filter((a): a is Area => a === "ADM" || a === "AS");
    await this.db.transaction(async (tx) => {
      await tx.delete(usuarioAreas).where(eq(usuarioAreas.usuarioId, usuarioId));
      if (validos.length > 0) {
        await tx.insert(usuarioAreas).values(validos.map((area) => ({ usuarioId, area })));
      }
    });
    return validos;
  }

  /**
   * Catálogo de menus ATIVOS, na ordem, lido da tabela (fonte de verdade da tela de configuração).
   *
   * AS ÁREAS TAMBÉM VÊM DA TABELA agora, na mesma consulta. Antes elas eram anexadas a partir do
   * registro em código; a fonte da autorização mudou de lugar e este é um dos consumidores. A tela de
   * permissão do usuário usa esse campo para desabilitar o menu que está fora da área da pessoa, e ela
   * precisa refletir o que o guard vai decidir, não o que o código dizia na hora do build.
   */
  async catalogo() {
    const linhas = await this.db
      .select({
        codigo: menus.codigo,
        rotulo: menus.rotulo,
        href: menus.href,
        grupo: menus.grupo,
        ordem: menus.ordem,
        areas: menus.areas,
      })
      .from(menus)
      .where(eq(menus.ativo, true))
      .orderBy(menus.ordem);
    // Fallback defensivo: se a tabela ainda não foi semeada, usa o registro em código, para a tela
    // nunca aparecer vazia num ambiente recém-migrado.
    // Fallback para base recém-migrada, ainda sem convergência: usa o registro em código com a área de
    // NASCIMENTO, só para a tela não aparecer vazia. Em operação normal este ramo nunca roda.
    if (linhas.length === 0) {
      return MENUS.map(({ codigo, rotulo, href, grupo, ordem }) => ({
        codigo,
        rotulo,
        href,
        grupo,
        ordem,
        areas: AREAS_DE_NASCIMENTO.get(codigo) ?? ["ADM"],
      }));
    }
    return linhas.map((m) => ({ ...m, areas: (m.areas ?? []) as Area[] }));
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
    areas?: Area[],
  ): Promise<string[]> {
    const ehAdmin = papel === "MASTER" || papel === "SUPER_ADMIN";
    // Só códigos que existem no registro entram (ignora lixo do cliente, sem quebrar); e, para
    // não-admin, remove os bloqueados para COMUM.
    //
    // O RECORTE POR ÁREA entra junto: marcar para alguém um menu fora da área dele gravaria uma linha
    // que o guard nunca honraria, e a tela mostraria uma caixa marcada que não corresponde a acesso
    // nenhum. Sem `areas` (chamada antiga), não filtra: preserva o comportamento anterior.
    const porPapel = codigos.filter(
      (c) =>
        TODOS_CODIGOS_MENU.includes(c) &&
        (ehAdmin || !MENUS_BLOQUEADOS_COMUM.has(c)) &&
        // EXCLUSIVO DO SUPER_ADMIN (hoje, a tela de Usuários): gravar a marcação para outro papel
        // criaria uma caixa marcada que o `/auth/me` filtra em seguida, ou seja, a tela prometeria
        // um acesso que nunca chega. Recusar aqui mantém marcação e visibilidade dizendo o mesmo.
        (papel === "SUPER_ADMIN" || !MENUS_SOMENTE_SUPER_ADMIN.has(c)),
    );
    // O TETO DE ÁREA sai da TABELA (fonte viva), e não mais de um mapa de código.
    const validos =
      papel === "SUPER_ADMIN" || !areas ? porPapel : await this.menuAreas.filtrar(porPapel, areas);
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
    areas?: Area[],
  ): Promise<{ aplicados: string[]; preservados: string[] }> {
    const ehAdmin = papel === "MASTER" || papel === "SUPER_ADMIN";
    // Mesmo recorte do `definirMenusDoUsuario`: formato válido, bloqueio do COMUM e o teto da ÁREA.
    // O SUPER_ADMIN escapa do recorte de área porque está acima da segmentação.
    const permitido = (c: string) =>
      TODOS_CODIGOS_MENU.includes(c) &&
      (ehAdmin || !MENUS_BLOQUEADOS_COMUM.has(c)) &&
      (papel === "SUPER_ADMIN" || !MENUS_SOMENTE_SUPER_ADMIN.has(c));

    const porPapel = selecionados.filter(permitido);
    // Mesmo teto do `definirMenusDoUsuario`, pela mesma fonte viva.
    const validos =
      papel === "SUPER_ADMIN" || !areas ? porPapel : await this.menuAreas.filtrar(porPapel, areas);
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
