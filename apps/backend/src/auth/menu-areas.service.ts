import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { eq, inArray, sql } from "drizzle-orm";
import { AREA, type Area } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { menus, usuarioAreas, usuarioMenus, usuarios } from "../db/schema";
import {
  AREA_PADRAO_DO_MENU,
  AREA_POR_CONTROLLER,
  MENU_SEMPRE_VISIVEL,
  menuDaOperacao,
  temIntersecao,
} from "../domain/menus";

/**
 * ÁREA DO MENU: a fonte da autorização por área, agora no BANCO.
 *
 * O QUE MUDOU E POR QUÊ. Até aqui a área de cada menu vivia em `domain/menus.ts`, o que significava
 * que marcar um menu para as duas áreas (o caso real é o dashboard de Alto Volume, que interessa aos
 * dois times) dependia da fábrica e de uma subida de versão. Agora a TABELA MANDA e o código diz
 * apenas com que áreas o menu NASCE. A tela do diretor escreve aqui.
 *
 * UMA FONTE, NÃO DUAS. Este serviço é o único lugar que responde "de que área é este menu HOJE". O
 * desenho recusado foi o de "tabela como exceção por cima do código", que teria duas verdades e
 * divergiria no primeiro caso em que alguém mexesse só num lado. Divergência em permissão não é
 * inconsistência de tela, é falha de segurança.
 *
 * CACHE EM MEMÓRIA, invalidado na escrita. Os guards consultam a área a cada operação gatada; ir ao
 * banco toda vez transformaria uma checagem de permissão numa consulta por requisição. O cache é
 * derrubado no `definir`, então a marcação do diretor vale NA HORA, sem restart. É o mesmo motivo de
 * a área do USUÁRIO ser lida do banco e não do JWT: trocar permissão e esperar relogar vira chamado.
 *
 * CARREGAMENTO PREGUIÇOSO, e não no `onModuleInit`: assim a ordem de inicialização entre este serviço
 * e o convergedor do catálogo (que insere menu novo) deixa de importar. Quem chegar primeiro carrega.
 *
 * §A.6: este serviço lê e escreve código de menu, rótulo de área e id de usuário. Nenhuma PII sai
 * daqui, com uma exceção consciente e restrita: o `impacto` devolve NOMES de usuários internos, para
 * o diretor ver quem perde acesso antes de salvar. É a mesma informação que a tela de Usuários já
 * mostra a quem tem acesso a ela, e as duas telas são exclusivas do SUPER_ADMIN.
 */
@Injectable()
export class MenuAreasService {
  private readonly logger = new Logger("MenuAreasService");
  /** `codigo -> áreas`. `null` = ainda não carregado (ver o carregamento preguiçoso). */
  private cache: Map<string, Area[]> | null = null;
  /** Carga em voo, para N requisições concorrentes no boot não dispararem N consultas. */
  private carregando: Promise<Map<string, Area[]>> | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Derruba o cache. Chamado após qualquer escrita que mude área de menu. */
  invalidar(): void {
    this.cache = null;
    this.carregando = null;
  }

  private async mapa(): Promise<Map<string, Area[]>> {
    if (this.cache) return this.cache;
    if (this.carregando) return this.carregando;
    this.carregando = (async () => {
      const linhas = await this.db
        .select({ codigo: menus.codigo, areas: menus.areas })
        .from(menus);
      const m = new Map<string, Area[]>();
      for (const l of linhas) m.set(l.codigo, (l.areas ?? []) as Area[]);
      this.cache = m;
      this.carregando = null;
      return m;
    })();
    return this.carregando;
  }

  /**
   * Áreas VIGENTES de um menu. Código desconhecido devolve lista VAZIA, e não o default ADM: menu que
   * não existe na tabela não é visto por ninguém (fail-closed). Conceder ADM a um código inventado
   * seria abrir acesso por digitação.
   */
  async areasDoMenu(codigo: string): Promise<Area[]> {
    return (await this.mapa()).get(codigo) ?? [];
  }

  /** O usuário, com estas áreas, enxerga este menu? É a regra de visibilidade inteira. */
  async visivel(codigo: string, areasDoUsuario: Iterable<Area>): Promise<boolean> {
    return temIntersecao(await this.areasDoMenu(codigo), areasDoUsuario);
  }

  /** Filtra códigos de menu pelas áreas do usuário. */
  async filtrar(codigos: Iterable<string>, areasDoUsuario: Iterable<Area>): Promise<string[]> {
    const mapa = await this.mapa();
    const doUsuario = new Set(areasDoUsuario);
    return [...codigos].filter((c) => temIntersecao(mapa.get(c) ?? [], doUsuario));
  }

  /**
   * Áreas que governam uma OPERAÇÃO, para o `RolesGuard`.
   *
   * ORDEM DE RESOLUÇÃO, do mais específico para o mais genérico:
   *   1. o menu que reivindica a operação, com a área VIGENTE da tabela (fonte única, quando existe);
   *   2. o mapa por controller (`AREA_POR_CONTROLLER`), para as superfícies que só o `@Roles` protege;
   *   3. ADM, o default.
   *
   * O PASSO 2 É A LIMITAÇÃO ACEITA PELO DIRETOR: as 8 operações órfãs (trocar cliente, corrigir CPF,
   * recusar e reativar liberação, deletar admissão, decidir liberação de não conformidade, remover
   * vínculo de cliente e os `add*` de catálogo) não pertencem a menu nenhum, então a tela não as
   * governa e elas seguem carimbadas ADM em código. Mudar isso exigiria reivindicá-las por menu, que
   * é frente própria.
   *
   * O DEFAULT SER ADM E NÃO "TODAS" mantém o sistema fail-closed para a área nova: uma controller de
   * A&S que alguém esqueça de registrar barra o time de A&S, e alguém reporta. O default oposto
   * liberaria a Admissão inteira para a área nova, em silêncio.
   */
  async areasDaOperacao(controller: string, handler: string): Promise<Area[]> {
    const codigoMenu = menuDaOperacao(controller, handler);
    if (codigoMenu) {
      const doMenu = await this.areasDoMenu(codigoMenu);
      // Menu reivindicante que sumiu da tabela cai no default, e não em vazio: a operação continua
      // existindo e barrar todo mundo quebraria a Admissão inteira por um menu removido do catálogo.
      return doMenu.length > 0 ? doMenu : AREA_PADRAO_DO_MENU;
    }
    return AREA_POR_CONTROLLER.get(controller) ?? AREA_PADRAO_DO_MENU;
  }

  /** Catálogo para a tela do diretor: menu, onde ele vive, e as áreas VIGENTES. */
  async listar() {
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
    return linhas.map((l) => ({
      ...l,
      areas: (l.areas ?? []) as Area[],
      /** O Início não pode ficar sem área (ver `definir`); a tela desabilita a última caixa dele. */
      protegido: MENU_SEMPRE_VISIVEL.has(l.codigo),
    }));
  }

  /**
   * QUEM DEIXA DE VER este menu se as áreas dele passarem a ser `novasAreas` (decisão do diretor:
   * mudar área tira acesso, e isso não pode ser feito às cegas).
   *
   * A REGRA DE QUEM VÊ, que é a mesma do `/auth/me`, aplicada duas vezes (antes e depois):
   *   - SUPER_ADMIN vê sempre, está acima da segmentação, e por isso nem entra na conta;
   *   - MASTER vê se tiver interseção de área (não depende de marcação);
   *   - COMUM vê se tiver interseção de área E o menu marcado.
   *
   * Só conta usuário ATIVO: quem está desativado não perde acesso que não usa, e listá-lo daria um
   * número assustador e falso.
   */
  async impacto(
    codigo: string,
    novasAreas: Area[],
  ): Promise<{ perdem: { id: string; nome: string; papel: string }[]; ganham: number }> {
    const atuais = await this.areasDoMenu(codigo);

    const pessoas = await this.db
      .select({ id: usuarios.id, nome: usuarios.nome, papel: usuarios.papel })
      .from(usuarios)
      .where(eq(usuarios.ativo, true));
    const areasPorUsuario = await this.db.select().from(usuarioAreas);
    const marcados = await this.db
      .select({ usuarioId: usuarioMenus.usuarioId })
      .from(usuarioMenus)
      .where(eq(usuarioMenus.menuCodigo, codigo));

    const areasDe = new Map<string, Area[]>();
    for (const a of areasPorUsuario) {
      areasDe.set(a.usuarioId, [...(areasDe.get(a.usuarioId) ?? []), a.area as Area]);
    }
    const temMarcado = new Set(marcados.map((m) => m.usuarioId));

    const ve = (u: { id: string; papel: string }, areasDoMenu: Area[]) => {
      if (u.papel === "SUPER_ADMIN") return true;
      if (!temIntersecao(areasDoMenu, areasDe.get(u.id) ?? [])) return false;
      return u.papel === "MASTER" || temMarcado.has(u.id);
    };

    const perdem = pessoas.filter((u) => u.papel !== "SUPER_ADMIN" && ve(u, atuais) && !ve(u, novasAreas));
    const ganham = pessoas.filter(
      (u) => u.papel !== "SUPER_ADMIN" && !ve(u, atuais) && ve(u, novasAreas),
    ).length;
    return { perdem: perdem.map((u) => ({ id: u.id, nome: u.nome, papel: u.papel })), ganham };
  }

  /**
   * Grava as áreas de UM menu e derruba o cache, para a mudança valer na requisição seguinte.
   *
   * AS DUAS RECUSAS, ambas decisão do diretor:
   *  - ÁREA VAZIA. Um menu sem área é uma tela que ninguém alcança, ou seja, uma funcionalidade morta
   *    que continua ocupando lugar na configuração de todo usuário. O banco também recusa (o check da
   *    migration), porque regra de acesso que vive só na aplicação é regra que um script contorna.
   *  - TIRAR A ÚLTIMA ÁREA DO INÍCIO. Ele é o `MENU_SEMPRE_VISIVEL`, a garantia de que ninguém encara
   *    uma barra lateral vazia. Deixá-lo fora de uma área entregaria àquele time um sistema sem um
   *    único item de menu, e a pessoa não teria nem por onde reportar o problema.
   */
  async definir(codigo: string, areas: Area[]): Promise<Area[]> {
    const validas = [...new Set(areas)].filter((a): a is Area => (AREA as readonly string[]).includes(a));
    if (validas.length === 0) {
      throw new BadRequestException(
        "Um menu precisa de pelo menos uma área. Sem área, ele deixa de existir para todo mundo.",
      );
    }
    if (MENU_SEMPRE_VISIVEL.has(codigo) && validas.length < AREA.length) {
      throw new BadRequestException(
        "O menu Início atende todas as áreas e não pode ser restrito: sem ele, uma área inteira ficaria sem nenhum item na barra lateral.",
      );
    }

    const [linha] = await this.db
      .update(menus)
      .set({ areas: validas })
      .where(eq(menus.codigo, codigo))
      .returning({ codigo: menus.codigo });
    if (!linha) throw new NotFoundException("Menu não encontrado.");

    this.invalidar();
    // §A.6: código do menu e áreas, sem PII. É trilha de mudança de permissão, então precisa existir.
    this.logger.log(`Áreas do menu "${codigo}" definidas como [${validas.join(", ")}].`);
    return validas;
  }

  /**
   * Semeia as áreas de menus recém-inseridos pelo convergedor. Chamado por ele, no boot.
   *
   * SÓ ONDE ESTÁ VAZIO, nunca por cima: se a linha já tem área, ela é do diretor e não se toca. É a
   * mesma disciplina do `onConflictDoUpdate` do convergedor, repetida aqui porque um dia alguém vai
   * querer "corrigir" este método e precisa esbarrar na razão escrita.
   */
  async semear(nascimento: Map<string, Area[]>): Promise<void> {
    const vazios = await this.db
      .select({ codigo: menus.codigo })
      .from(menus)
      .where(sql`coalesce(array_length(${menus.areas}, 1), 0) = 0`);
    if (vazios.length === 0) return;
    for (const { codigo } of vazios) {
      await this.db
        .update(menus)
        .set({ areas: nascimento.get(codigo) ?? AREA_PADRAO_DO_MENU })
        .where(eq(menus.codigo, codigo));
    }
    this.invalidar();
    this.logger.log(`Áreas semeadas para ${vazios.length} menu(s) sem carimbo.`);
  }

  /** Áreas de vários menus de uma vez, para telas que precisam do conjunto. */
  async areasDeVarios(codigos: string[]): Promise<Map<string, Area[]>> {
    if (codigos.length === 0) return new Map();
    const linhas = await this.db
      .select({ codigo: menus.codigo, areas: menus.areas })
      .from(menus)
      .where(inArray(menus.codigo, codigos));
    return new Map(linhas.map((l) => [l.codigo, (l.areas ?? []) as Area[]]));
  }
}
