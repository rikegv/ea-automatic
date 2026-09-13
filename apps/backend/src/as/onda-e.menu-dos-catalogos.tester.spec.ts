import "reflect-metadata";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  menuDaOperacao,
} from "../domain/menus";
import { AsModule } from "./as.module";
import { SegmentosService } from "./segmentos/segmentos.service";
import { VagasService } from "./vagas/vagas.service";

/**
 * ─ ONDA E: O MENU DOS DOIS CATÁLOGOS, HANDLER A HANDLER, E A LISTA FECHADA DO COMERCIAL ────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` a partir do REQUISITO e dos ACHADOS da
 * auditoria do mapa. É o molde de `etapas-funil-menu.spec.ts` (e do `linhas-servico-menu.spec.ts`,
 * escrito nesta mesma onda para pagar a dívida de prova do molde), com UMA diferença deliberada.
 *
 * ┌─ A DIFERENÇA: O COMERCIAL NÃO TEM LEITURA ABERTA, E ISSO INVERTE METADE DO MOLDE ────────────┐
 * │ Nos quatro catálogos vizinhos a leitura fica FORA da reivindicação de propósito, e o         │
 * │ `MenuGuard` libera o que ninguém reivindica: qualquer sessão válida lê a lista. Para etapa,  │
 * │ status e linha de serviço isso é certo, são nomes de processo.                                │
 * │                                                                                              │
 * │ `as_comerciais` GUARDA NOME DE PESSOA. Copiar o molde inteiro (que é o gesto natural de quem │
 * │ constrói dois catálogos iguais no mesmo dia) entregaria a folha do time comercial a QUALQUER │
 * │ sessão autenticada, inclusive aos COMUM da Admissão, que não têm nada com A&S. E nada         │
 * │ falharia: a tela funciona, o teste do molde passa, e ninguém lê aquela rota de novo.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O QUE ESTE ARQUIVO AFIRMA, NAS DUAS CAMADAS QUE NÃO DEPENDEM UMA DA OUTRA ───────────────────
 *   1. o MENU (quem vê o card, e qual operação ele governa);
 *   2. o PAPEL (`@Roles` na CLASSE, que é a autoridade fail-closed);
 *   3. e, para o comercial, de ONDE a lista sai quando não há rota aberta.
 *
 * §A.6: nenhum nome real. Os nomes de comercial usados nos dublês são inventados.
 */

type Classe = new (...args: never[]) => object;

function controllersDoModulo(): Classe[] {
  const lista = Reflect.getMetadata("controllers", AsModule) as unknown;
  return Array.isArray(lista) ? (lista as Classe[]) : [];
}

function rotaDe(c: Classe): string {
  const bruto = Reflect.getMetadata("path", c) as unknown;
  return typeof bruto === "string" ? bruto.replace(/^\/+/, "").replace(/\/+$/, "") : "";
}

function handlersDe(c: Classe): string[] {
  const proto = c.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

const CONTROLLERS = controllersDoModulo();

/**
 * A CLASSE PELO NOME, e o nome não é chute: `domain/menus.ts` JÁ reivindica
 * `SegmentosAdminController.*` e `ComerciaisAdminController.*`, então o nome virou contrato no
 * instante em que o menu foi registrado. Uma classe com outro nome deixaria a reivindicação
 * apontando para o vazio, e o menu governaria coisa nenhuma: é isso que o vermelho aqui diz.
 */
function classePorNome(nome: string): Classe {
  const achada = CONTROLLERS.find((c) => c.name === nome);
  if (!achada) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: o AsModule não declara a controller \`${nome}\`, e \`domain/menus.ts\` ` +
        `já reivindica \`${nome}.*\`. Controllers do módulo: ${JSON.stringify(CONTROLLERS.map((c) => c.name))}`,
    );
  }
  return achada;
}

const CATALOGOS = [
  { nome: "segmento", admin: "SegmentosAdminController", menu: "as-segmentos" },
  { nome: "comercial", admin: "ComerciaisAdminController", menu: "as-comerciais" },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A ESCRITA: REIVINDICADA PELO MENU **E** FECHADA PELO PAPEL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe.each(CATALOGOS)("a administração do catálogo de $nome", ({ admin, menu }) => {
  it("TODA operação de escrita resolve para o menu certo", () => {
    const c = classePorNome(admin);
    const ops = handlersDe(c);
    expect(ops.length, "controller sem handler passaria neste teste por não ter o que afirmar").toBeGreaterThan(0);
    for (const op of ops) {
      expect(menuDaOperacao(admin, op), `${admin}.${op}`).toBe(menu);
    }
  });

  /**
   * A AUTORIDADE, e ela está na CLASSE de propósito: assim rota nova nasce fechada, em vez de
   * depender de alguém lembrar do decorator no método. O menu é a camada de UX; o `@Roles` é a
   * trava. O MASTER atravessa o `MenuGuard` por PERTENCER À ÁREA (e há MASTER na área AS em
   * produção), então sem o `@Roles` ele renomearia o catálogo inteiro.
   */
  it('é @Roles("SUPER_ADMIN") na CLASSE, cobrindo inclusive rota que ainda não existe', () => {
    expect(Reflect.getMetadata(ROLES_KEY, classePorNome(admin))).toEqual(["SUPER_ADMIN"]);
  });

  it("o menu existe, nasce só para o SUPER_ADMIN e não é concedível a COMUM (§A.23)", () => {
    const def = MENUS.find((m) => m.codigo === menu);
    expect(def, "o menu precisa existir no registro para ser selecionável na tela de liberação").toBeDefined();
    expect(def?.areas, 'sem `areas: ["AS"]` o menu nasce em ADM e some para o time de A&S').toEqual(["AS"]);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has(menu)).toBe(true);
    expect(MENUS_BLOQUEADOS_COMUM.has(menu)).toBe(true);
  });

  it("só este menu reivindica esta administração", () => {
    const reivindicam = MENUS.filter((m) =>
      m.operacoes.some((op) => op.startsWith(`${admin}.`)),
    ).map((m) => m.codigo);
    expect(reivindicam).toEqual([menu]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A LEITURA DO SEGMENTO É ABERTA (e precisa ser)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a leitura do catálogo de segmento é aberta, como a das linhas de serviço", () => {
  /**
   * FECHÁ-LA DARIA 403 NO SELETOR de quem cadastra cliente e no filtro da Central, sem erro visível
   * na tela: o seletor abriria VAZIO. É o incidente que a casa já pagou uma vez, e o motivo de a
   * régua ser "LER catálogo de processo é dado de TRABALHO e continua ABERTO".
   */
  it("existe uma controller de leitura em `as/segmentos`", () => {
    const leitura = CONTROLLERS.find((c) => rotaDe(c) === "as/segmentos");
    expect(leitura, `rotas: ${JSON.stringify(CONTROLLERS.map(rotaDe))}`).toBeDefined();
  });

  it("nenhum handler dela é reivindicado por menu, e nenhum tem @Roles", () => {
    const leitura = CONTROLLERS.find((c) => rotaDe(c) === "as/segmentos");
    expect(leitura).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, leitura!)).toBeUndefined();
    const proto = leitura!.prototype as unknown as Record<string, object>;
    for (const op of handlersDe(leitura!)) {
      expect(menuDaOperacao(leitura!.name, op), `${leitura!.name}.${op}`).toBeNull();
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `${leitura!.name}.${op}`).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O COMERCIAL: NENHUMA SUPERFÍCIE ABERTA DEVOLVE NOME DE PESSOA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("nenhuma rota ABERTA do módulo devolve a lista de comerciais (§A.6)", () => {
  /**
   * A VARREDURA É SOBRE O MÓDULO INTEIRO, e não sobre uma rota que eu adivinhe: o defeito não é
   * "existe `as/comerciais`", é "existe QUALQUER classe não reivindicada que devolva esses nomes".
   * O leitor procura por rota e por nome de classe, e cobra que o que casar esteja reivindicado por
   * menu ou fechado por `@Roles`.
   *
   * O PONTO CEGO, DECLARADO: ele reconhece a superfície pelo NOME (rota ou classe). Uma controller
   * chamada `CarteiraController` que devolvesse os mesmos nomes passaria batido aqui. É o limite de
   * uma varredura estrutural, e é por isso que a auditoria adversarial do `seguranca` não é
   * substituída por este arquivo.
   */
  it("toda classe que cheira a comercial está reivindicada por menu ou tem @Roles", () => {
    const suspeitas = CONTROLLERS.filter(
      (c) => /comercia/i.test(rotaDe(c)) || /Comercia/i.test(c.name),
    );
    const abertas: string[] = [];
    for (const c of suspeitas) {
      const temRolesNaClasse = Reflect.getMetadata(ROLES_KEY, c) !== undefined;
      if (temRolesNaClasse) continue;
      const proto = c.prototype as unknown as Record<string, object>;
      for (const op of handlersDe(c)) {
        const reivindicado = menuDaOperacao(c.name, op) !== null;
        const roles = Reflect.getMetadata(ROLES_KEY, proto[op]) !== undefined;
        if (!reivindicado && !roles) abertas.push(`${c.name}.${op}`);
      }
    }
    expect(
      abertas,
      "estes handlers devolvem NOME DE PESSOA a qualquer sessão autenticada: o MenuGuard libera o que ninguém reivindica",
    ).toEqual([]);
  });

  /**
   * O CONTRAPESO DO CASO ACIMA, e sem ele o de cima passa VAZIO enquanto nada existir. Se não há
   * rota aberta, a lista que o filtro da Central De Vagas precisa TEM de vir de algum lugar, e o
   * lugar é `VagasService.opcoes()`, já governado por `VagasController.*` (menu `as-vagas`).
   * Sem isso, o filtro de comercial abriria sem opção nenhuma, que é o mesmo que não existir.
   */
  it("a lista de comerciais chega pelo `opcoes()` da Central De Vagas, que já é gatado", async () => {
    const payload = await opcoesComCatalogos();
    expect(
      Object.keys(payload),
      "nenhuma chave de comercial no payload de opções: o filtro da Central nasceria vazio",
    ).toContain("comerciais");
  });

  /**
   * ─ A OUTRA PORTA DE NOMES, E ELA MORA FORA DO `AsModule` ─────────────────────────────────────
   *
   * O seletor do cadastro de CLIENTE também precisa da lista de comerciais, e ela é servida por
   * `ClientesController.comerciais`, no módulo de administração. A varredura de cima NÃO alcança
   * aquele módulo (ela lê os controllers do `AsModule`), e era esse o ponto cego declarado ali.
   * Este caso o fecha nominalmente.
   *
   * A REIVINDICAÇÃO TEM DE SER NOMINAL, e não um coringa `ClientesController.*`: o `list` da MESMA
   * controller fica de fora de propósito (o consultor precisa da lista de clientes na Liberação e no
   * wizard), e o coringa o fecharia junto, com 403 na operação diária dele.
   */
  it("a lista de comerciais do cadastro de cliente é reivindicada NOMINALMENTE", () => {
    expect(
      menuDaOperacao("ClientesController", "comerciais"),
      "handler que menu nenhum reivindica é ABERTO por construção: a folha do comercial sairia para qualquer sessão",
    ).not.toBeNull();
    expect(
      menuDaOperacao("ClientesController", "list"),
      "a lista de CLIENTES não pode ser fechada junto: o consultor a usa no wizard e na Liberação",
    ).toBeNull();
  });

  it("`VagasController` continua reivindicado pelo menu `as-vagas`", () => {
    const reivindicam = MENUS.filter((m) =>
      m.operacoes.some((op) => op.startsWith("VagasController.")),
    ).map((m) => m.codigo);
    expect(reivindicam, "se ninguém reivindica o VagasController, `opcoes()` fica aberta").toContain(
      "as-vagas",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. O CATÁLOGO DO FILTRO INCLUI O INATIVO **EM USO** (§A.37)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ O BANCO DE MENTIRA DESTE BLOCO: RESPONDE POR TABELA, E NÃO POR ORDEM DE CHAMADA ─────────────
 *
 * `opcoes()` dispara as leituras em `Promise.all`, e um dublê que responda por POSIÇÃO quebra no dia
 * em que a construção acrescentar uma consulta no meio: o teste fica vermelho por motivo errado.
 * Este responde pela TABELA do `from()`, então a ordem pode mudar à vontade.
 *
 * ELE HONRA O `where` DE FORMA CRUA, e isso é o que separa medir de fingir: se a cláusula falar de
 * `ativo` e não tiver `or`/`in (select`/`exists`, ele filtra só os ATIVOS. Uma consulta ingênua
 * (`where ativo = true`) perde o inativo em uso, e o caso abaixo fica VERMELHO, que é o ponto. Uma
 * consulta que una os ativos com os em uso passa.
 *
 * O LIMITE, DECLARADO: ele não interpreta a subconsulta de verdade. Uma consulta com `or` que
 * estivesse errada por outro motivo passaria aqui.
 */
function bancoPorTabela(linhasPorTabela: Record<string, unknown[]>) {
  function cadeia() {
    let tabela = "";
    let clausula = "";
    const c: Record<string, unknown> = {};
    for (const m of ["innerJoin", "leftJoin", "groupBy", "orderBy", "limit", "offset"]) {
      c[m] = () => c;
    }
    c.from = (t: unknown) => {
      try {
        tabela = getTableName(t as never);
      } catch {
        tabela = "";
      }
      return c;
    };
    c.where = (cond: unknown) => {
      try {
        clausula = new PgDialect().sqlToQuery(cond as never).sql;
      } catch {
        clausula = "";
      }
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => {
      let linhas = (linhasPorTabela[tabela] ?? []) as Record<string, unknown>[];
      if (/ativo/i.test(clausula) && !/\bor\b|in\s*\(\s*select|exists/i.test(clausula)) {
        linhas = linhas.filter((l) => l.ativo !== false);
      }
      return resolve(linhas);
    };
    return c;
  }

  return {
    select: () => cadeia(),
    selectDistinct: () => cadeia(),
    // `selectDistinctOn` é usado pela consulta do solicitante herdado. Sem ele, o dublê derruba a
    // chamada inteira com um erro que NÃO é o requisito desta onda.
    selectDistinctOn: () => cadeia(),
  };
}

const SEGMENTOS_DO_BANCO = [
  { id: 7, codigo: "VAREJO", rotulo: "Varejo", ordem: 1, ativo: true },
  // O INATIVO EM USO: saiu de circulação, e AINDA existe vaga e cliente apontando para ele.
  { id: 9, codigo: "SAUDE", rotulo: "Saúde", ordem: 2, ativo: false },
];
const COMERCIAIS_DO_BANCO = [
  { id: 3, rotulo: "Ana Exemplo", ordem: 1, ativo: true },
  { id: 5, rotulo: "Bruno Exemplo", ordem: 2, ativo: false },
];

async function opcoesComCatalogos(): Promise<Record<string, unknown>> {
  const db = bancoPorTabela({
    as_segmentos: SEGMENTOS_DO_BANCO,
    as_comerciais: COMERCIAIS_DO_BANCO,
  });
  const stub = new Proxy(
    {},
    { get: (_a, p) => (String(p) === "then" ? undefined : () => Promise.resolve([])) },
  );
  // FOLGA PARA DEPENDÊNCIA NOVA NO CONSTRUTOR (ver o mesmo recurso no harness da herança).
  const Ctor = VagasService as unknown as new (...args: unknown[]) => VagasService;
  const svc = new Ctor(db, stub, stub, stub, stub);
  return (await svc.opcoes()) as unknown as Record<string, unknown>;
}

describe("o catálogo que enche os dois filtros inclui o INATIVO EM USO (§A.37)", () => {
  /**
   * ─ POR QUE O INATIVO PRECISA APARECER NO FILTRO ───────────────────────────────────────────────
   *
   * Inativar tira do SELETOR de cadastro novo, e NÃO apaga o passado: existe cliente e existe vaga
   * apontando para o segmento inativado. Um filtro que ofereça só os ATIVOS torna essas vagas
   * INVISÍVEIS para quem filtra, e a pergunta que o filtro criou ("cadê as vagas do segmento que
   * saiu de circulação?") passa a não ter resposta na tela. É metade do valor do filtro.
   *
   * É A MESMA RÉGUA que o filtro de Status da Central já segue, escrita na própria tela: "o status
   * INATIVO continua na lista de propósito: se houver vaga parada nele, é por ele que se procura".
   */
  /**
   * ─ O SEGMENTO TEM DE ONDE TIRAR OS INATIVOS: a leitura ABERTA aceita o pedido explícito ───────
   * É o molde das linhas de serviço (`?incluirInativas=1`), e é a fonte que a tela usa para a ficha
   * da vaga antiga e para o filtro. Os dois lados são afirmados: o padrão ESCONDE (cadastro novo não
   * oferece o que saiu de circulação) e o pedido explícito TRAZ.
   */
  it("o catálogo de segmentos esconde o inativo por padrão e o devolve quando pedido", async () => {
    const db = bancoPorTabela({ as_segmentos: SEGMENTOS_DO_BANCO });
    const svc = new SegmentosService(db as never);
    expect((await svc.listar()).map((s) => s.id), "o inativo não pode aparecer no cadastro novo").toEqual([7]);
    // CADA CHAMADA PRECISA DE UM SERVIÇO NOVO: o molde tem cache de 60s, e reusar a instância aqui
    // mediria o cache, não a consulta.
    const svc2 = new SegmentosService(bancoPorTabela({ as_segmentos: SEGMENTOS_DO_BANCO }) as never);
    expect(
      (await svc2.listar(true)).map((s) => s.id),
      "sem os inativos, a ficha da vaga antiga e o filtro perdem o segmento fora de circulação",
    ).toContain(9);
  });

  /**
   * ─ O COMERCIAL NÃO TEM ESSA SAÍDA, E A LISTA DO FILTRO É A DO `opcoes()` ──────────────────────
   *
   * A leitura do comercial NÃO é aberta (§A.6), e o `listar(incluirInativos)` dele mora na
   * controller de ADMINISTRAÇÃO, atrás de `@Roles("SUPER_ADMIN")`. Então quem opera a Central De
   * Vagas (COMUM e MASTER) tem UMA fonte só para o filtro: `VagasService.opcoes()`.
   *
   * ELE OFERECE SÓ OS ATIVOS, e isso só é correto porque a INATIVAÇÃO RECUSA o comercial em uso:
   * inativo implica zero cliente e zero vaga apontando, então nenhuma vaga fica fora do filtro. As
   * duas metades se sustentam UMA NA OUTRA, e é essa dependência que é fácil de quebrar sem ver
   * (basta afrouxar a trava da inativação num dia em que ninguém lembre deste filtro).
   *
   * A INVARIANTE ESTÁ TRAVADA EM `onda-e.catalogos-servico.tester.spec.ts` ("inativo EM USO nunca
   * fica invisível ao filtro"), que mede as duas pontas juntas. Aqui fica só a metade local: a
   * lista existe e não vem vazia.
   */
  it("a lista de comerciais do filtro vem preenchida (e só com os ativos, ver acima)", async () => {
    const payload = await opcoesComCatalogos();
    const comerciais = (payload.comerciais ?? []) as { id: number; rotulo: string }[];
    expect(comerciais.map((c) => c.id), "filtro sem opção é o mesmo que filtro nenhum").toContain(3);
  });

  /**
   * ─ REGRESSÃO DA ONDA D: O PAYLOAD DE OPÇÕES NÃO PODE ENCOLHER ────────────────────────────────
   * `opcoes()` é lido pela trilha de abertura INTEIRA. Acrescentar duas listas a ele é mexer num
   * retorno que cinco passos do wizard consomem, e chave que some daqui vira seletor vazio lá.
   */
  it("as chaves que a Onda D já devolvia continuam todas lá", async () => {
    const payload = await opcoesComCatalogos();
    for (const chave of [
      "cargos",
      "clientes",
      "beneficios",
      "motivos",
      "escalas",
      "consultores",
    ]) {
      expect(Object.keys(payload), `a chave \`${chave}\` sumiu do payload de opções`).toContain(chave);
    }
  });
});
