import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Area } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { MenuGuard } from "../auth/guards/menu.guard";
import type { MenuAreasService } from "../auth/menu-areas.service";
import { MenusService } from "../auth/menus.service";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  baseDeMenusDoMaster,
  codigosPadraoDoPapel,
  masterPrecisaDeMarcacao,
  menuDaOperacao,
} from "../domain/menus";
import { ComerciaisAdminController } from "./comerciais/comerciais-admin.controller";
import { EtapasFunilAdminController } from "./etapas/etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas/etapas-funil.controller";
import { LinhasServicoAdminController } from "./linhas-servico/linhas-servico-admin.controller";
import { LinhasServicoController } from "./linhas-servico/linhas-servico.controller";
import { MotivosCancelamentoVagaAdminController } from "./motivos-cancelamento/motivos-cancelamento-admin.controller";
import { MotivosCancelamentoVagaController } from "./motivos-cancelamento/motivos-cancelamento.controller";
import { MotivosDescarteAdminController } from "./motivos-descarte/motivos-descarte-admin.controller";
import { MotivosDescarteController } from "./motivos-descarte/motivos-descarte.controller";
import { MotivosReenvioShortlistAdminController } from "./motivos-reenvio-shortlist/motivos-reenvio-shortlist-admin.controller";
import { MotivosReenvioShortlistController } from "./motivos-reenvio-shortlist/motivos-reenvio-shortlist.controller";
import { SegmentosAdminController } from "./segmentos/segmentos-admin.controller";
import { SegmentosController } from "./segmentos/segmentos.controller";
import { VagaStatusAdminController } from "./vaga-status/vaga-status-admin.controller";
import { VagaStatusController } from "./vaga-status/vaga-status.controller";

/**
 * ─ A FAMÍLIA INTEIRA DOS CATÁLOGOS DE CONFIGURAÇÃO DE A&S: CONCEDÍVEL, PESSOA A PESSOA ──────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` a partir do REQUISITO (decisão do diretor,
 * 27/09/2026) e ANTES do código existir (§A.40): "o Super Admin concede QUALQUER tela a QUALQUER
 * usuário; não existe mais tela de configuração que ele não possa conceder".
 *
 * ┌─ POR QUE ISTO É UMA VARREDURA DA FAMÍLIA, E NÃO SETE ARQUIVOS SOLTOS ───────────────────────┐
 * │ Sete casos escritos à mão provam os sete de hoje e NÃO provam o oitavo. O catálogo de A&S    │
 * │ cresceu cinco vezes em três ondas (etapas, cancelamento, descarte, reenvio, status, linhas,  │
 * │ segmentos, comerciais), e cada onda repetiu o mesmo desenho copiando o vizinho. A família é  │
 * │ DERIVADA do registro (`as-*` no grupo ADMIN), então o catálogo NOVO entra nesta varredura no │
 * │ instante em que é registrado, sem ninguém lembrar de acrescentar um arquivo.                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O TESTE QUE MAIS IMPORTA, E É O PERIGO ESPECÍFICO DESTA FRENTE ────────────────────────────┐
 * │ A frente TIRA o `@Roles("SUPER_ADMIN")` da escrita destes catálogos. O `MenuGuard` é         │
 * │ FAIL-OPEN para operação NÃO reivindicada (`menuDaOperacao` devolve `null` → passa). Logo,    │
 * │ tirar o `@Roles` de uma controller que o menu não reivindique ABRE a rota de administração a │
 * │ QUALQUER AUTENTICADO que saiba a URL, sem nenhum teste ficar vermelho: o antigo caía junto   │
 * │ com o decorator, e nenhum novo nasce para ocupar o lugar. As duas mudanças (tirar o papel,   │
 * │ manter a reivindicação) só fazem sentido JUNTAS, e este arquivo é quem as amarra para a      │
 * │ FAMÍLIA inteira, hoje e no próximo catálogo.                                                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOIS NÍVEIS DE ASSERÇÃO, de propósito: o DESENHO (metadado, registro, listas de papel) e a
 * PROPRIEDADE (o `MenuGuard` de verdade, instanciado e chamado; o `MenusService` de verdade,
 * gravando). Já houve teste verde afirmando decorador enquanto o sistema era contornável.
 *
 * §A.6: só códigos de menu, nomes de classe e ids sintéticos. Nenhum dado pessoal neste arquivo.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A FAMÍLIA, DERIVADA DO REGISTRO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * O RECORTE: menu de A&S (`as-`) que mora no grupo ADMIN, ou seja, uma tela que CONFIGURA uma lista
 * do módulo. É exatamente a definição que o diretor usou ("tela de configuração"), e é a que faz o
 * oitavo catálogo entrar sozinho.
 *
 * As telas OPERACIONAIS de A&S (`as-vagas`, `as-candidatos`, `as-vagas-revisao`) ficam de fora por
 * construção: elas não são grupo ADMIN, não perderam `@Roles` nenhum e não são assunto desta frente.
 */
const FAMILIA = MENUS.filter((m) => m.codigo.startsWith("as-") && m.grupo === "ADMIN");

/**
 * OS SETE DA FRENTE MAIS O MOLDE. `as-motivos-descarte` já chegou lá (foi o precedente que o diretor
 * mandou repetir) e entra na varredura como CONTROLE: se ele falhar junto com os outros, o defeito é
 * da varredura; se só ele passar, o defeito é da frente.
 */
const ESPERADOS = [
  "as-etapas",
  "as-status-vaga",
  "as-motivos-cancelamento",
  "as-linhas-servico",
  "as-segmentos",
  "as-comerciais",
  "as-motivos-reenvio",
  "as-motivos-descarte",
] as const;

/**
 * O REGISTRO DAS CLASSES. O `MenuGuard` resolve por NOME, então a varredura do guard é derivada do
 * registro de menus e não precisa da classe; o metadado do `@Roles`, sim. Este mapa é a única parte
 * escrita à mão, e o teste logo abaixo a transforma em FORÇA: catálogo novo na família sem entrada
 * aqui QUEBRA, com a mensagem dizendo o que fazer.
 */
type Classe = new (...args: never[]) => object;
const CLASSES: Record<string, { admin: Classe; leitura: Classe | null }> = {
  "as-etapas": { admin: EtapasFunilAdminController as never, leitura: EtapasFunilController as never },
  "as-status-vaga": { admin: VagaStatusAdminController as never, leitura: VagaStatusController as never },
  "as-motivos-cancelamento": {
    admin: MotivosCancelamentoVagaAdminController as never,
    leitura: MotivosCancelamentoVagaController as never,
  },
  "as-linhas-servico": {
    admin: LinhasServicoAdminController as never,
    leitura: LinhasServicoController as never,
  },
  "as-segmentos": { admin: SegmentosAdminController as never, leitura: SegmentosController as never },
  // SEM CONTROLLER DE LEITURA ABERTA, e a ausência é decisão de §A.6: este catálogo guarda NOME DE
  // PESSOA, e leitura aberta entregaria a folha do time comercial a qualquer sessão válida. Quem
  // precisa da lista a recebe por superfície já gatada.
  "as-comerciais": { admin: ComerciaisAdminController as never, leitura: null },
  "as-motivos-reenvio": {
    admin: MotivosReenvioShortlistAdminController as never,
    leitura: MotivosReenvioShortlistController as never,
  },
  "as-motivos-descarte": {
    admin: MotivosDescarteAdminController as never,
    leitura: MotivosDescarteController as never,
  },
};

function handlersDe(classe: Classe): string[] {
  const proto = classe.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof proto[n] === "function",
  );
}

/** A controller que o menu reivindica por CORINGA (`Classe.*`), lida do próprio registro. */
function controllerReivindicada(codigo: string): string[] {
  const def = MENUS.find((m) => m.codigo === codigo);
  return (def?.operacoes ?? []).filter((op) => op.endsWith(".*")).map((op) => op.slice(0, -2));
}

describe("a família dos catálogos de configuração de A&S está inteira e mapeada", () => {
  it("o recorte pega os OITO catálogos conhecidos (varredura vazia passaria calada)", () => {
    const codigos = FAMILIA.map((m) => m.codigo).sort();
    for (const c of ESPERADOS) {
      expect(codigos, `${c} saiu da família: o recorte "as-* no grupo ADMIN" mudou`).toContain(c);
    }
    expect(FAMILIA.length).toBeGreaterThanOrEqual(ESPERADOS.length);
  });

  it("toda a família tem classe registrada neste arquivo (catálogo novo entra ou quebra aqui)", () => {
    for (const m of FAMILIA) {
      expect(
        CLASSES[m.codigo],
        `o catálogo "${m.codigo}" entrou na família e não foi registrado em CLASSES: acrescente a controller de administração (e a de leitura, se houver) para ele ser varrido junto`,
      ).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. O DESENHO: SEM `@Roles`, MAS REIVINDICADO, E CONCEDÍVEL AOS DOIS PAPÉIS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe.each(FAMILIA.map((m) => m.codigo))("o catálogo %s: o desenho da autorização", (codigo) => {
  const admin = () => CLASSES[codigo].admin;
  const nomeAdmin = () => CLASSES[codigo].admin.name;

  /**
   * A REIVINDICAÇÃO, E É ELA QUE IMPEDE QUE TIRAR O `@Roles` VIRE ROTA ABERTA. Note o handler
   * INVENTADO: o coringa `Classe.*` tem de cobrir também a rota que ainda não existe, senão o
   * próximo `@Patch` nasce fora do guard.
   */
  it("a administração é REIVINDICADA por menu, inclusive em rota que ainda não existe", () => {
    const alvos = controllerReivindicada(codigo);
    expect(
      alvos,
      `o menu "${codigo}" precisa reivindicar a controller de administração por CORINGA (Classe.*); sem isso o MenuGuard é fail-open e a rota fica alcançável por qualquer autenticado`,
    ).toEqual([nomeAdmin()]);

    for (const op of handlersDe(admin())) {
      expect(menuDaOperacao(nomeAdmin(), op), `${nomeAdmin()}.${op}`).toBe(codigo);
    }
    expect(
      menuDaOperacao(nomeAdmin(), "rotaQueAindaNaoExiste"),
      "o coringa precisa cobrir rota futura",
    ).toBe(codigo);
  });

  it("a administração tem handlers (os laços acima não podem estar vazios)", () => {
    expect(handlersDe(admin()).length).toBeGreaterThan(0);
  });

  it("SÓ este menu reivindica esta administração (dois menus tornariam a autoridade coincidência)", () => {
    const reivindicam = MENUS.filter((m) =>
      m.operacoes.some((op) => op.startsWith(`${nomeAdmin()}.`)),
    ).map((m) => m.codigo);
    expect(reivindicam).toEqual([codigo]);
  });

  /**
   * O `@Roles` SAIU, e tem de sair da CLASSE e de TODO MÉTODO. Com o papel na classe, conceder o
   * menu entregaria uma PORTA TRANCADA: 403 já no CARREGAMENTO da tela, que lê o `GET` de
   * administração, e não só na hora de salvar.
   */
  it("a ESCRITA não tem mais @Roles na CLASSE: o papel deixou de ser a autoridade", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, admin()),
      `${nomeAdmin()} ainda tem @Roles na classe: o menu concedido abriria uma porta trancada`,
    ).toBeUndefined();
  });

  it("nenhum handler reintroduz @Roles por MÉTODO", () => {
    const proto = admin().prototype as Record<string, object>;
    for (const op of handlersDe(admin())) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `${nomeAdmin()}.${op}`).toBeUndefined();
    }
  });

  /**
   * AS TRÊS LISTAS DE PAPEL, cada uma respondendo uma pergunta diferente. Juntas fazem o menu
   * NASCER só para o SUPER_ADMIN (§A.23) e mesmo assim ser CONCEDÍVEL, pessoa a pessoa.
   */
  it("DENTRO de MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER: senão o MASTER entra pelo atalho de área", () => {
    expect(
      masterPrecisaDeMarcacao(codigo),
      `sem a entrada nominal, TODO MASTER da área AS ganha "${codigo}" sozinho e o diretor deixa de decidir individualmente`,
    ).toBe(true);
  });

  it("FORA de MENUS_SOMENTE_SUPER_ADMIN: senão a marcação é gravada e o /auth/me a descarta", () => {
    expect(MENUS_SOMENTE_SUPER_ADMIN.has(codigo)).toBe(false);
  });

  it("FORA de MENUS_BLOQUEADOS_COMUM: senão a concessão a um COMUM é descartada ao salvar", () => {
    expect(MENUS_BLOQUEADOS_COMUM.has(codigo)).toBe(false);
  });

  /** §A.23: registrar não é conceder. Ninguém NASCE com o menu, só o SUPER_ADMIN. */
  it("§A.23: nasce só para o SUPER_ADMIN, e nem MASTER nem COMUM o recebem por padrão", () => {
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toContain(codigo);
    expect(codigosPadraoDoPapel("MASTER")).not.toContain(codigo);
    expect(codigosPadraoDoPapel("COMUM")).not.toContain(codigo);
    // E, marcado, ele volta a aparecer para o MASTER: marcação e visibilidade dizem a mesma coisa.
    expect(baseDeMenusDoMaster([codigo])).toContain(codigo);
  });

  it('o menu é da área AS (sem `areas: ["AS"]` ele nasce em ADM e some para o time de A&S)', () => {
    expect(MENUS.find((m) => m.codigo === codigo)?.areas).toEqual(["AS"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A PROPRIEDADE: O `MenuGuard` DE VERDADE, INSTANCIADO E CHAMADO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const reflector = { getAllAndOverride: () => false } as unknown as Reflector;

function guardDe(codigos: string[], areasDoUsuario: Area[] = ["AS"]) {
  const menus = {
    permissaoDoUsuario: async () => ({
      codigos: new Set(codigos),
      areas: new Set(areasDoUsuario),
    }),
  } as unknown as MenusService;
  const menuAreas = {
    visivel: async (_codigo: string, doUsuario: Iterable<Area>) => [...doUsuario].includes("AS"),
  } as unknown as MenuAreasService;
  return new MenuGuard(reflector, menus, menuAreas);
}

function contexto(classe: string, handler: string, papel: string): never {
  return {
    getHandler: () => ({ name: handler }),
    getClass: () => ({ name: classe }),
    switchToHttp: () => ({ getRequest: () => ({ user: { id: "u1", papel } }) }),
  } as never;
}

/** Um par (menu, handler de escrita) por handler da família: a varredura roda no guard de verdade. */
const ESCRITAS = FAMILIA.flatMap((m) =>
  handlersDe(CLASSES[m.codigo].admin).map((handler) => ({
    codigo: m.codigo,
    classe: CLASSES[m.codigo].admin.name,
    handler,
  })),
);

describe("o guard de verdade: a marcação PASSA A VALER, para a família inteira", () => {
  it("a varredura tem casos (lista vazia passaria calada)", () => {
    expect(ESCRITAS.length).toBeGreaterThan(0);
  });

  it.each(ESCRITAS)("$codigo: o COMUM COM a marcação edita em $handler", async ({ codigo, classe, handler }) => {
    await expect(guardDe([codigo]).canActivate(contexto(classe, handler, "COMUM"))).resolves.toBe(
      true,
    );
  });

  it.each(ESCRITAS)("$codigo: o COMUM SEM a marcação é recusado em $handler", async ({ classe, handler }) => {
    await expect(
      guardDe(["as-vagas"]).canActivate(contexto(classe, handler, "COMUM")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(ESCRITAS)("$codigo: o MASTER COM a marcação edita em $handler", async ({ codigo, classe, handler }) => {
    await expect(guardDe([codigo]).canActivate(contexto(classe, handler, "MASTER"))).resolves.toBe(
      true,
    );
  });

  /**
   * O ATALHO DO MASTER CONTINUA FECHADO, e este é o caso que decide se a regra do diretor vale. Sem
   * a entrada nominal em `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, este teste resolve `true` sozinho:
   * o MASTER entra pelo bypass de ÁREA, e o catálogo deixa de ser CONCEDIDO para virar consequência
   * do papel. É o oposto exato do pedido.
   */
  it.each(ESCRITAS)("$codigo: o MASTER SEM marcação é RECUSADO em $handler", async ({ classe, handler }) => {
    await expect(
      guardDe([]).canActivate(contexto(classe, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** O contraste, sem o qual tudo acima seria satisfeito por uma rota que barra todo mundo. */
  it.each(ESCRITAS)("$codigo: o SUPER_ADMIN passa em $handler sem marcação", async ({ classe, handler }) => {
    await expect(
      guardDe([]).canActivate(contexto(classe, handler, "SUPER_ADMIN")),
    ).resolves.toBe(true);
  });

  /**
   * ─ O BURACO QUE ESTA FRENTE PODE ABRIR, PROVADO PELO AVESSO ────────────────────────────────
   *
   * AUTENTICADO SEM MENU NENHUM não alcança a administração. Se a reivindicação do coringa cair
   * junto com o `@Roles`, o `MenuGuard` devolve `null` em `menuDaOperacao` e PASSA: a rota de
   * configuração fica aberta a qualquer sessão válida, inclusive a um COMUM da Admissão que não tem
   * nada com A&S. Nenhum outro teste desta frente pegaria isso, porque todos os de cima concedem
   * algum menu ou negam por área.
   */
  it.each(ESCRITAS)("$codigo: AUTENTICADO SEM MENU não alcança $handler (fail-open do guard)", async ({ classe, handler }) => {
    await expect(
      guardDe([]).canActivate(contexto(classe, handler, "COMUM")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * O TETO DE ÁREA CONTINUA VALENDO, e ele é verificado ANTES da marcação: marcar para alguém da
   * Admissão um menu de A&S não concede nada.
   */
  it.each(ESCRITAS)("$codigo: marcado para quem é só da área ADM, não concede em $handler", async ({ codigo, classe, handler }) => {
    await expect(
      guardDe([codigo], ["ADM"]).canActivate(contexto(classe, handler, "COMUM")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A LEITURA CONTINUA ABERTA (o dropdown que a operação usa ao trabalhar)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const LEITURAS = FAMILIA.flatMap((m) => {
  const leitura = CLASSES[m.codigo]?.leitura;
  if (!leitura) return [];
  return handlersDe(leitura).map((handler) => ({
    codigo: m.codigo,
    classe: leitura.name,
    handler,
  }));
});

describe("a leitura do catálogo segue aberta: fechá-la junto pararia quem opera", () => {
  it("há leituras a varrer", () => {
    expect(LEITURAS.length).toBeGreaterThan(0);
  });

  it.each(LEITURAS)("$codigo: $classe.$handler NÃO é reivindicado por menu nenhum", ({ classe, handler }) => {
    expect(
      menuDaOperacao(classe, handler),
      `reivindicar ${classe} daria 403 no dropdown para o consultor COMUM, que é quem precisa da lista para trabalhar`,
    ).toBeNull();
  });

  it.each(LEITURAS)("$codigo: $classe.$handler não tem @Roles", ({ codigo, handler }) => {
    const leitura = CLASSES[codigo].leitura as Classe;
    expect(Reflect.getMetadata(ROLES_KEY, leitura)).toBeUndefined();
    const proto = leitura.prototype as Record<string, object>;
    expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toBeUndefined();
  });

  it.each(LEITURAS)("$codigo: o COMUM SEM menu nenhum lê em $handler", async ({ classe, handler }) => {
    await expect(guardDe([]).canActivate(contexto(classe, handler, "COMUM"))).resolves.toBe(true);
  });

  it.each(LEITURAS)("$codigo: o MASTER sem marcação também lê em $handler", async ({ classe, handler }) => {
    await expect(guardDe([]).canActivate(contexto(classe, handler, "MASTER"))).resolves.toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A GRAVAÇÃO NÃO PODE MAIS SER DESCARTADA EM SILÊNCIO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ┌─ O DEFEITO QUE ESTE BLOCO EXISTE PARA MATAR ────────────────────────────────────────────────┐
 * │ A tela oferecia a caixa, o diretor marcava, a tela salvava SEM RECLAMAR e o servidor          │
 * │ DESCARTAVA em silêncio (`MENUS_BLOQUEADOS_COMUM` / `MENUS_SOMENTE_SUPER_ADMIN` filtram antes  │
 * │ do INSERT). Ninguém via erro, e a pessoa simplesmente não recebia o acesso. É o "mostrar a    │
 * │ porta e trancá-la" acontecendo dentro da própria tela que existe para abrir portas.           │
 * │                                                                                               │
 * │ Aqui o `MenusService` é o DE VERDADE, com o banco fingido: o que se afirma é a LINHA GRAVADA, │
 * │ não a lista de constantes. Filtro novo que volte a descartar cai aqui, venha de onde vier.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÃO DUAS PORTAS QUE ESCREVEM `usuario_menus`, E A TELA USA A SEGUNDA (§A.40) ──────────────┐
 * │ `definirMenusDoUsuario` é a da CRIAÇÃO de usuário; `salvarSelecaoDaTela` é a que o           │
 * │ `PUT /admin/usuarios/:id/menus` chama, ou seja, a que o diretor aciona ao marcar a caixa.    │
 * │ As duas repetem o MESMO recorte de papel, em código duplicado (`permitido`, em               │
 * │ `auth/menus.service.ts`): consertar uma e esquecer a outra deixaria a concessão funcionando   │
 * │ em teste e descartada na tela, ou o contrário. Por isso a varredura cobre AS DUAS.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function servicoComBancoFingido(areaDoMenu: Area[] = ["AS"]) {
  const gravados: string[] = [];
  const tx = {
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: async (linhas: { menuCodigo: string }[]) => {
        gravados.push(...linhas.map((l) => l.menuCodigo));
      },
    }),
  };
  const db = {
    transaction: async (cb: (t: typeof tx) => Promise<void>) => cb(tx),
    /**
     * `codigosDoUsuario`: o usuário do cenário começa SEM menu nenhum, e a leitura reflete o que foi
     * gravado. Espelhar o INSERT aqui não é enfeite: `salvarSelecaoDaTela` devolve `aplicados`
     * RELENDO o banco, então um fake que sempre devolvesse vazio reprovaria código correto.
     */
    select: () => ({ from: () => ({ where: async () => gravados.map((codigo) => ({ codigo })) }) }),
  };
  const menuAreas = {
    // O TETO DE ÁREA da tabela, fingido: o menu só sobrevive se a área do usuário alcançar a do menu.
    filtrar: async (codigos: string[], areasDoUsuario: Area[]) =>
      areasDoUsuario.some((a) => areaDoMenu.includes(a)) ? codigos : [],
  } as unknown as MenuAreasService;
  const service = new MenusService(db as never, menuAreas);
  return { service, gravados };
}

describe("marcar e salvar RESULTA na linha gravada, para a família inteira", () => {
  it.each(FAMILIA.map((m) => m.codigo))("%s concedido a um COMUM é GRAVADO, não descartado", async (codigo) => {
    const { service, gravados } = servicoComBancoFingido();
    const aplicados = await service.definirMenusDoUsuario("u1", [codigo], "COMUM", ["AS"]);
    expect(
      aplicados,
      `"${codigo}" foi descartado em silêncio ao salvar para um COMUM: confira MENUS_BLOQUEADOS_COMUM e MENUS_SOMENTE_SUPER_ADMIN`,
    ).toContain(codigo);
    expect(gravados, "a linha precisa chegar ao INSERT, não só ao retorno").toContain(codigo);
  });

  it.each(FAMILIA.map((m) => m.codigo))("%s concedido a um MASTER é GRAVADO", async (codigo) => {
    const { service, gravados } = servicoComBancoFingido();
    const aplicados = await service.definirMenusDoUsuario("u1", [codigo], "MASTER", ["AS"]);
    expect(aplicados).toContain(codigo);
    expect(gravados).toContain(codigo);
  });

  /** O teto de área continua valendo no SALVAMENTO, e não só no guard. */
  it.each(FAMILIA.map((m) => m.codigo))("%s marcado para quem é só da ADM não grava nada", async (codigo) => {
    const { service, gravados } = servicoComBancoFingido();
    const aplicados = await service.definirMenusDoUsuario("u1", [codigo], "COMUM", ["ADM"]);
    expect(aplicados).not.toContain(codigo);
    expect(gravados).not.toContain(codigo);
  });
});

describe("a PORTA DA TELA (`salvarSelecaoDaTela`) grava a mesma coisa", () => {
  /** O escopo `conhecidos` é o catálogo que a tela exibiu; sem ele o backend recusa o salvamento. */
  const conhecidos = MENUS.map((m) => m.codigo);

  it.each(FAMILIA.map((m) => m.codigo))("%s marcado na tela para um COMUM é GRAVADO", async (codigo) => {
    const { service, gravados } = servicoComBancoFingido();
    const { aplicados } = await service.salvarSelecaoDaTela(
      "u1",
      [codigo],
      conhecidos,
      "COMUM",
      ["AS"],
    );
    expect(
      aplicados,
      `"${codigo}" foi descartado em silêncio na porta que a TELA usa: o recorte de papel de \`salvarSelecaoDaTela\` é duplicado do \`definirMenusDoUsuario\` e pode ter ficado para trás`,
    ).toContain(codigo);
    expect(gravados).toContain(codigo);
  });

  it.each(FAMILIA.map((m) => m.codigo))("%s marcado na tela para um MASTER é GRAVADO", async (codigo) => {
    const { service, gravados } = servicoComBancoFingido();
    const { aplicados } = await service.salvarSelecaoDaTela(
      "u1",
      [codigo],
      conhecidos,
      "MASTER",
      ["AS"],
    );
    expect(aplicados).toContain(codigo);
    expect(gravados).toContain(codigo);
  });

  it.each(FAMILIA.map((m) => m.codigo))("%s: o teto de área vale na porta da tela também (%s)", async (codigo) => {
    const { service, gravados } = servicoComBancoFingido();
    const { aplicados } = await service.salvarSelecaoDaTela(
      "u1",
      [codigo],
      conhecidos,
      "COMUM",
      ["ADM"],
    );
    expect(aplicados).not.toContain(codigo);
    expect(gravados).not.toContain(codigo);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. A RÉGUA QUE A TELA CONSOME: O SERVIDOR DIZ QUE A CAIXA É CONCEDÍVEL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A TELA DEIXOU DE TER OPINIÃO (ver `ConfigMenusModal`): a restrição DESCE DO SERVIDOR, por menu, e
 * a tela só desabilita o que vier restrito e escreve o motivo. Por isso a prova de que "a caixa
 * aparece habilitada" pertence AQUI, no catálogo: uma tela fiel a um servidor que mente continua
 * oferecendo caixa que o INSERT descarta, que é o defeito inteiro.
 *
 * `restricao` é DERIVADA das listas do domínio, nunca digitada: derivar é o que faz o catálogo novo
 * nascer com a resposta certa sem ninguém lembrar de atualizar a tela.
 */
function servicoDeCatalogo(codigos: string[]) {
  const linhas = codigos.map((codigo, i) => ({
    codigo,
    rotulo: codigo,
    href: `/admin/${codigo}`,
    grupo: "ADMIN",
    ordem: i,
    areas: ["AS"] as Area[],
  }));
  const db = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => linhas }) }) }),
  };
  return new MenusService(db as never, {} as unknown as MenuAreasService);
}

describe("o catálogo da tela de permissões classifica a restrição de concessão", () => {
  it.each(FAMILIA.map((m) => m.codigo))("%s desce como NENHUMA (a caixa aparece HABILITADA)", async (codigo) => {
    const itens = (await servicoDeCatalogo([codigo]).catalogo()) as Array<{
      codigo: string;
      restricao?: string;
    }>;
    const item = itens.find((m) => m.codigo === codigo);
    expect(item, "o menu precisa aparecer no catálogo da tela").toBeDefined();
    expect(
      item?.restricao,
      `o servidor precisa CLASSIFICAR "${codigo}" como concedível; sem o campo a tela cai no default e a régua volta a viver na tela`,
    ).toBe("NENHUMA");
  });

  /**
   * O CONTRASTE, sem o qual "tudo NENHUMA" passaria. As telas que CONCEDEM permissão continuam
   * exclusivas do SUPER_ADMIN, e o Diagnóstico continua fora do alcance do COMUM: esconder o que é
   * concedível e oferecer o que não é são o MESMO defeito com o sinal trocado.
   */
  it("os menus realmente restritos continuam classificados como tais", async () => {
    const itens = (await servicoDeCatalogo(["usuarios", "menu-areas", "diagnostico"]).catalogo()) as Array<{
      codigo: string;
      restricao?: string;
    }>;
    const por = (c: string) => itens.find((m) => m.codigo === c)?.restricao;
    expect(por("usuarios")).toBe("SO_SUPER_ADMIN");
    expect(por("menu-areas")).toBe("SO_SUPER_ADMIN");
    expect(por("diagnostico")).toBe("NAO_PARA_COMUM");
  });
});
