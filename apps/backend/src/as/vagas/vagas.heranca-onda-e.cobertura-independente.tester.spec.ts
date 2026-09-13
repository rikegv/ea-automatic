import { getTableColumns, getTableName, is, sql, Table } from "drizzle-orm";
import { PgDialect, PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { VagasService } from "./vagas.service";

/**
 * ─ ONDA E, O CORAÇÃO: A VAGA HERDA DO CLIENTE, E PODE SOBREPOR ─────────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` JUNTO com a construção (§A.40 regra 2), A
 * PARTIR DO REQUISITO. Quem escreve aqui não escreve o `VagasService`.
 *
 * ┌─ O REQUISITO, EM UMA LINHA, E É SÓ ELE QUE ESTE ARQUIVO MEDE ────────────────────────────────┐
 * │ `vagas.segmento_id` e `vagas.comercial_id` são NULÁVEIS. NULO = HERDA do cliente.            │
 * │ PREENCHIDO = SOBREPÕE. A leitura resolve por `coalesce(vaga.x, cliente.x)`.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ISTO NÃO PODE SER UM TESTE DE SQL RENDERIZADO, que seria o caminho fácil ───────────┐
 * │ Afirmar "a consulta contém a palavra coalesce" passaria verde em TRÊS implementações erradas: │
 * │   . `coalesce(cliente.x, vaga.x)`, com os argumentos TROCADOS, em que a sobreposição da vaga  │
 * │     é silenciosamente ignorada e toda vaga passa a mostrar o valor do cliente;                │
 * │   . o `coalesce` no ID e o JOIN DO RÓTULO em `vagas.segmento_id` sozinho, em que o id vem     │
 * │     certo e o NOME vem VAZIO justamente nas vagas que herdam, que são a maioria;              │
 * │   . o join com `and(eq(seg.ativo, true))` dentro, que apaga o rótulo da vaga viva no dia em   │
 * │     que o catálogo for inativado (o precedente da "etapa fantasma", 10/09).                   │
 * │ E ficaria VERMELHO numa implementação CERTA que resolvesse a herança em JavaScript.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O QUE ESTE ARQUIVO FAZ NO LUGAR: UM BANCO DE MENTIRA QUE OBEDECE À CONSULTA DE VERDADE ──────
 *
 * O `VagasService` REAL roda contra um `db` de mentira que NÃO devolve linhas prontas. Ele lê a
 * seleção e os `join` que o serviço montou, RENDERIZA cada expressão com o `PgDialect` de verdade, e
 * CALCULA o valor de cada coluna como o Postgres calcularia, sobre um cenário declarado (a vaga tem
 * tal segmento, o cliente tem tal outro). O `coalesce` é avaliado de verdade, na ORDEM em que os
 * argumentos foram escritos, e o `join` é resolvido de verdade contra um catálogo de duas linhas.
 *
 * ENTÃO A ASSERÇÃO É SOBRE O QUE SAI, e não sobre como foi escrito: qualquer implementação que
 * responda certo passa, inclusive uma que resolva em JavaScript, e as três erradas de cima caem.
 *
 * §A.6: os nomes de comercial usados aqui são INVENTADOS ("Ana Exemplo", "Bruno Exemplo"), porque
 * `as_comerciais` guarda nome de PESSOA e teste não é lugar de nome real. Nenhum CPF, nenhum
 * candidato, nenhum dado de produção entra neste arquivo.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// O BANCO DE MENTIRA QUE CALCULA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const dialeto = new PgDialect();

/** O SQL de UMA expressão da seleção ou de UMA condição de join, como o banco a receberia. */
function render(expr: unknown): string {
  // `sql`${x}`` embrulha tanto Column quanto SQL, e é o que permite renderizar os dois pelo mesmo
  // caminho: a seleção mistura colunas cruas e expressões montadas à mão.
  return dialeto.sqlToQuery(sql`${expr}` as never).sql;
}

/** Os `"tabela"."coluna"` citados por uma expressão, NA ORDEM em que aparecem. */
function tokens(sqlTexto: string): string[] {
  return [...sqlTexto.matchAll(/"([\w$]+)"\."([\w$]+)"/g)].map((m) => `${m[1]}.${m[2]}`);
}

/** O CENÁRIO: o que a vaga tem, o que o cliente tem, e se o catálogo está ativo. */
interface Cenario {
  /** `null` = a vaga NÃO sobrepõe (herda). */
  vagaSegmento: number | null;
  vagaComercial: number | null;
  /** `null` = o cliente não tem o campo preenchido. `"sem-cliente"` = a vaga não tem cliente. */
  clienteSegmento: number | null | "sem-cliente";
  clienteComercial: number | null | "sem-cliente";
  /** Ids do catálogo que estão INATIVOS (o rótulo tem de continuar resolvendo). */
  inativos?: number[];
}

const CATALOGOS: Record<string, Map<number, Record<string, unknown>>> = {
  as_segmentos: new Map([
    [7, { id: 7, codigo: "VAREJO", rotulo: "Varejo", ordem: 1 }],
    [9, { id: 9, codigo: "SAUDE", rotulo: "Saúde", ordem: 2 }],
    [11, { id: 11, codigo: "INDUSTRIA", rotulo: "Indústria", ordem: 3 }],
  ]),
  as_comerciais: new Map([
    [3, { id: 3, codigo: "ANA_EXEMPLO", rotulo: "Ana Exemplo", ordem: 1 }],
    [5, { id: 5, codigo: "BRUNO_EXEMPLO", rotulo: "Bruno Exemplo", ordem: 2 }],
  ]),
  // O CONTROLE: catálogos que JÁ existem e JÁ funcionam, resolvidos pelo mesmo maquinário.
  as_linhas_servico: new Map([[1, { id: 1, codigo: "ALTO_VOLUME", rotulo: "Alto Volume", ordem: 1 }]]),
  as_cidades: new Map([[3550308, { id: 3550308, nome: "São Paulo", uf: "SP" }]]),
};

/** O valor de uma coluna das tabelas BASE (`vagas`, `clientes`, `cargos`, `usuarios`). */
function valorBase(tabela: string, coluna: string, c: Cenario): unknown {
  if (tabela === "vagas") {
    switch (coluna) {
      case "segmento_id":
        return c.vagaSegmento;
      case "comercial_id":
        return c.vagaComercial;
      case "id":
        return "vaga-1";
      case "codigo":
        return "PS-001";
      case "cod_cliente":
        return c.clienteSegmento === "sem-cliente" ? null : "57269";
      case "linha_servico_id":
        return 1;
      case "cidade_id":
        return 3550308;
      case "status":
        return "ABERTA";
      case "sazonalidade":
        return "PONTUAL";
      case "posicoes_oficiais":
        return 1;
      case "posicoes_banco":
        return 0;
      case "criado_em":
        return new Date("2026-09-12T12:00:00.000Z");
      default:
        return null;
    }
  }
  if (tabela === "clientes") {
    // VAGA SEM CLIENTE: o `leftJoin` não casa, e TODA coluna de `clientes` vem nula. É o que
    // acontece de verdade com o rascunho e com a vaga antiga sem vínculo.
    if (c.clienteSegmento === "sem-cliente") return null;
    switch (coluna) {
      case "segmento_id":
        return c.clienteSegmento;
      case "comercial_id":
        return c.clienteComercial === "sem-cliente" ? null : c.clienteComercial;
      case "cod_cliente":
        return "57269";
      case "nome_operacao":
        return "CIA DAS LETRAS";
      case "razao_social":
        return "EDITORA EXEMPLO S.A.";
      default:
        return null;
    }
  }
  return null;
}

/**
 * O BANCO DE MENTIRA. Devolve UMA linha para a primeira consulta (a listagem) e VAZIO para as
 * demais (benefícios, ocupação e rastro de meta, que já sabem responder vazio).
 */
function bancoQueCalcula(c: Cenario) {
  interface Consulta {
    selecao: Record<string, unknown>;
    joins: { tabela: unknown; cond: unknown }[];
  }
  const consultas: Consulta[] = [];

  function novaConsulta(selecao: unknown): Record<string, unknown> {
    const atual: Consulta = { selecao: (selecao ?? {}) as Record<string, unknown>, joins: [] };
    consultas.push(atual);
    const cadeia: Record<string, unknown> = {};
    for (const m of ["from", "where", "groupBy", "orderBy", "limit", "offset", "innerJoin"]) {
      cadeia[m] = () => cadeia;
    }
    cadeia.leftJoin = (tabela: unknown, cond: unknown) => {
      atual.joins.push({ tabela, cond });
      return cadeia;
    };
    cadeia.innerJoin = (tabela: unknown, cond: unknown) => {
      atual.joins.push({ tabela, cond });
      return cadeia;
    };
    cadeia.then = (resolve: (v: unknown) => unknown) =>
      resolve(consultas.length === 1 ? [linhaDaConsulta(atual, c)] : []);
    return cadeia;
  }

  return {
    db: { select: (sel: unknown) => novaConsulta(sel), selectDistinct: (sel: unknown) => novaConsulta(sel) },
    consultas,
  };
}

/** A linha que o "banco" devolve: cada chave da seleção, calculada sobre o cenário. */
function linhaDaConsulta(consulta: { selecao: Record<string, unknown>; joins: { tabela: unknown; cond: unknown }[] }, c: Cenario): Record<string, unknown> {
  const porAlias = resolverJoins(consulta.joins, c);
  const linha: Record<string, unknown> = {};
  for (const [chave, expr] of Object.entries(consulta.selecao)) {
    linha[chave] = is(expr, Table) ? objetoDaTabela(expr, c) : valorDaExpressao(expr, porAlias, c);
  }
  return linha;
}

/** `alias -> linha do catálogo casada por aquele join` (ou `null`, quando o join não casa). */
function resolverJoins(
  joins: { tabela: unknown; cond: unknown }[],
  c: Cenario,
): Map<string, Record<string, unknown> | null> {
  const porAlias = new Map<string, Record<string, unknown> | null>();
  for (const { tabela, cond } of joins) {
    if (!is(tabela, Table)) continue;
    const alias = getTableName(tabela);
    // O NOME REAL DA TABELA POR TRÁS DO ALIAS. `alias(asSegmentos, "segmento_vaga")` renderiza
    // `"segmento_vaga"."rotulo"` na consulta, e é o nome REAL que diz de qual catálogo ela é.
    // O símbolo é o do drizzle (`Symbol.for("drizzle:OriginalName")`), lido direto porque
    // `Table.Symbol` não está no tipo público.
    const real =
      (tabela as unknown as Record<symbol, string>)[Symbol.for("drizzle:OriginalName")] ?? alias;
    const catalogo = CATALOGOS[real];
    // TABELA QUE NÃO É CATÁLOGO (`clientes`, `cargos`, `usuarios`) NÃO ENTRA NO ÍNDICE: as colunas
    // dela são resolvidas por `valorBase`, com o valor do cenário. Registrá-la aqui como "não
    // casou" apagaria o nome do cliente, e o controle do harness pegou exatamente isso.
    if (!catalogo) continue;
    const texto = render(cond);
    // A CHAVE DO JOIN: o primeiro token NÃO-NULO que não seja a coluna da própria tabela juntada.
    // É exatamente a semântica do `coalesce`, e é ela que separa a implementação certa da que
    // inverte os argumentos.
    const doOutroLado = tokens(texto).filter((t) => !t.startsWith(`${alias}.`));
    let id: unknown = null;
    for (const t of doOutroLado) {
      const [tab, col] = t.split(".");
      const v = valorBase(tab!, col!, c);
      if (v !== null && v !== undefined) {
        id = v;
        break;
      }
    }
    const linha = typeof id === "number" ? (catalogo.get(id) ?? null) : null;
    // O JOIN QUE FILTRA POR `ativo` some com a linha inativa, e o rótulo da vaga viva vira vazio.
    // É o defeito que este `if` existe para tornar VISÍVEL, e não para tolerar.
    const filtraAtivo = new RegExp(`"${alias}"\\."(ativo|ativa)"`).test(texto);
    const inativo = linha && (c.inativos ?? []).includes(linha.id as number);
    porAlias.set(alias, filtraAtivo && inativo ? null : linha);
  }
  return porAlias;
}

/** Uma expressão da seleção, avaliada: `coalesce` é a ordem dos tokens, o primeiro não-nulo vence. */
function valorDaExpressao(
  expr: unknown,
  porAlias: Map<string, Record<string, unknown> | null>,
  c: Cenario,
): unknown {
  let texto: string;
  try {
    texto = render(expr);
  } catch {
    return null;
  }
  // `count(*)`, `now()` e afins não citam coluna nenhuma: não é papel deste banco fingir isso.
  for (const t of tokens(texto)) {
    const [tab, col] = t.split(".") as [string, string];
    const v = porAlias.has(tab)
      ? ((porAlias.get(tab) ?? {})[camel(col)] ?? (porAlias.get(tab) ?? {})[col] ?? null)
      : valorBase(tab, col, c);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** `nome_operacao` -> `nomeOperacao`, para o catálogo do teste ser escrito uma vez só. */
function camel(coluna: string): string {
  return coluna.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
}

/** A seleção `{ v: vagas }` devolve a LINHA INTEIRA da tabela, com as chaves do drizzle. */
function objetoDaTabela(tabela: unknown, c: Cenario): Record<string, unknown> {
  const nome = getTableName(tabela as never);
  const linha: Record<string, unknown> = {};
  for (const [chave, coluna] of Object.entries(getTableColumns(tabela as never))) {
    linha[chave] = valorBase(nome, (coluna as { name: string }).name, c);
  }
  return linha;
}

/**
 * OS SERVIÇOS INJETADOS, dublados por um objeto que responde a QUALQUER método.
 *
 * POR QUE UM `Proxy` E NÃO UM DUBLÊ ESCRITO: a construção pode injetar um `SegmentosService` novo no
 * construtor, e um dublê nominal quebraria o harness por uma dependência que o requisito não fixa.
 * O `Proxy` responde a tudo: mapa de rótulos para quem pedir um mapa, lista para quem pedir lista.
 */
function servicoQualquer(): unknown {
  const mapa = new Map<number, string>([
    [7, "Varejo"],
    [9, "Saúde"],
    [11, "Indústria"],
    [3, "Ana Exemplo"],
    [5, "Bruno Exemplo"],
  ]);
  const catalogo = [
    { id: 7, codigo: "VAREJO", rotulo: "Varejo", ordem: 1, ativo: true },
    { id: 9, codigo: "SAUDE", rotulo: "Saúde", ordem: 2, ativo: true },
  ];
  return new Proxy(
    {},
    {
      get: (_alvo, prop) => {
        const nome = String(prop);
        if (nome === "then") return undefined;
        return () =>
          /rotulo|mapa|porId|indice/i.test(nome) ? Promise.resolve(mapa) : Promise.resolve(catalogo);
      },
    },
  );
}

/** A listagem, rodada de verdade contra o banco que calcula. */
async function listarNoCenario(c: Cenario): Promise<Record<string, unknown>> {
  const { db } = bancoQueCalcula(c);
  /*
   * FOLGA PARA DEPENDÊNCIA NOVA NO CONSTRUTOR: argumento a mais é inofensivo em JavaScript, e
   * dependência a menos derrubaria o harness por motivo errado (uma frente que injete um
   * `SegmentosService` aqui não pode virar vermelho de teste). O `cast` do construtor é o que deixa
   * isso dizível em TypeScript sem mexer no serviço.
   */
  const Ctor = VagasService as unknown as new (...args: unknown[]) => VagasService;
  const svc = new Ctor(
    db,
    servicoQualquer(),
    servicoQualquer(),
    servicoQualquer(),
    servicoQualquer(),
  );
  const itens = (await svc.list()) as unknown as Record<string, unknown>[];
  expect(itens.length, "o harness devolveu zero vagas: o banco de mentira parou de servir a linha").toBe(1);
  return itens[0]!;
}

/**
 * ─ A LEITURA DO CAMPO NO ITEM, TOLERANTE À FORMA, E ISSO É DELIBERADO ─────────────────────────
 *
 * O contrato compartilhado é do COORDENADOR (§A.39), e a forma exata (`segmento: AsValorHerdado` ou
 * o par `segmentoId`/`segmentoRotulo`) é escolha dele. O REQUISITO não é a forma: é o VALOR
 * RESOLVIDO chegar na tela. Este leitor aceita as duas formas e falha com a lista das chaves quando
 * não acha nenhuma, que é um vermelho que se lê.
 */
function campoResolvido(item: Record<string, unknown>, radical: RegExp) {
  const chaves = Object.keys(item).filter((k) => radical.test(k));
  if (chaves.length === 0) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: o item da listagem não tem NENHUM campo casando ${radical}. ` +
        `Chaves devolvidas: ${JSON.stringify(Object.keys(item))}`,
    );
  }
  for (const k of chaves) {
    const v = item[k];
    if (v && typeof v === "object" && ("id" in v || "rotulo" in v)) {
      const o = v as Record<string, unknown>;
      return { id: (o.id ?? null) as number | null, rotulo: (o.rotulo ?? null) as string | null, origem: o.origem as string | undefined, chaves };
    }
  }
  const chaveId = chaves.find((k) => /id$/i.test(k));
  const chaveRotulo = chaves.find((k) => /rotulo|nome|label/i.test(k));
  return {
    id: (chaveId ? (item[chaveId] as number | null) : null) ?? null,
    rotulo: (chaveRotulo ? (item[chaveRotulo] as string | null) : null) ?? null,
    origem: undefined as string | undefined,
    chaves,
  };
}

const segmentoDe = (i: Record<string, unknown>) => campoResolvido(i, /^segmento/i);
const comercialDe = (i: Record<string, unknown>) => campoResolvido(i, /^comercial/i);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0. O CONTROLE DO PRÓPRIO HARNESS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * SEM ESTE BLOCO, TODO VERMELHO ABAIXO É AMBÍGUO. Um banco de mentira quebrado (renderização
 * falhando, join não resolvido, seleção lida errado) produz exatamente a mesma tela de falhas que
 * "a construção ainda não fez". O controle mede o maquinário contra a ONDA C, que já está pronta e
 * já usa join de catálogo: se o rótulo da LINHA DE SERVIÇO e o nome da CIDADE saem certos, o
 * maquinário responde, e o vermelho do resto é do requisito.
 */
describe("controle: o banco que calcula resolve os joins que JÁ existem (Onda C)", () => {
  const BASE: Cenario = {
    vagaSegmento: null,
    vagaComercial: null,
    clienteSegmento: 7,
    clienteComercial: 3,
  };

  it("a listagem devolve uma vaga, com o id e o código da linha", async () => {
    const item = await listarNoCenario(BASE);
    expect(item.id).toBe("vaga-1");
    expect(item.codigo).toBe("PS-001");
  });

  it("o rótulo da LINHA DE SERVIÇO sai do join, resolvido", async () => {
    expect((await listarNoCenario(BASE)).linhaServicoRotulo).toBe("Alto Volume");
  });

  it("o nome e a UF da CIDADE saem do join, resolvidos", async () => {
    const item = await listarNoCenario(BASE);
    expect(item.cidadeNome).toBe("São Paulo");
    expect(item.cidadeUf).toBe("SP");
  });

  it("o nome do cliente sai do join com `clientes`", async () => {
    expect((await listarNoCenario(BASE)).clienteNome).toBe("CIA DAS LETRAS");
  });

  it("vaga SEM cliente devolve nome de cliente nulo, e não explode", async () => {
    const item = await listarNoCenario({
      vagaSegmento: null,
      vagaComercial: null,
      clienteSegmento: "sem-cliente",
      clienteComercial: "sem-cliente",
    });
    expect(item.clienteNome).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A HERANÇA: NULO NA VAGA SIGNIFICA USAR O DO CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a vaga SEM sobreposição HERDA o do cliente", () => {
  const HERDA: Cenario = {
    vagaSegmento: null,
    vagaComercial: null,
    clienteSegmento: 7,
    clienteComercial: 3,
  };

  it("o SEGMENTO resolvido é o do cliente, com id e rótulo", async () => {
    const s = segmentoDe(await listarNoCenario(HERDA));
    expect(s.id, `campos lidos: ${s.chaves.join(", ")}`).toBe(7);
    // O RÓTULO É A METADE QUE SE ESQUECE: o id resolvido com o join preso em `vagas.segmento_id`
    // devolve o número certo e o NOME VAZIO, justamente nas vagas que herdam, que são a maioria.
    expect(s.rotulo, "o rótulo da vaga que HERDA veio vazio: o join não alcança o cliente").toBe("Varejo");
  });

  it("o COMERCIAL resolvido é o do cliente, com id e rótulo", async () => {
    const co = comercialDe(await listarNoCenario(HERDA));
    expect(co.id, `campos lidos: ${co.chaves.join(", ")}`).toBe(3);
    expect(co.rotulo).toBe("Ana Exemplo");
  });

  /**
   * A ORIGEM É O QUE A TELA USA para dizer se a vaga segue o padrão do cliente ou foge dele. Ela é
   * contrato do coordenador (`AsValorHerdado`), e está num caso SEPARADO de propósito: se ela for
   * retirada do contrato, é ESTE caso que fica vermelho, e não os dois de cima, que medem o
   * requisito do diretor.
   */
  it("a origem do valor herdado é HERDADO", async () => {
    const item = await listarNoCenario(HERDA);
    expect(segmentoDe(item).origem).toBe("HERDADO");
    expect(comercialDe(item).origem).toBe("HERDADO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A SOBREPOSIÇÃO: PREENCHIDO NA VAGA VENCE O CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a vaga COM sobreposição vence o cliente", () => {
  const SOBREPOE: Cenario = {
    vagaSegmento: 9,
    vagaComercial: 5,
    clienteSegmento: 7,
    clienteComercial: 3,
  };

  /**
   * ─ O CASO QUE PEGA O `coalesce` COM OS ARGUMENTOS TROCADOS ───────────────────────────────────
   * `coalesce(cliente.x, vaga.x)` compila, roda, devolve um número e um rótulo, e está ERRADO: a
   * sobreposição da vaga passa a ser ignorada em silêncio. O único jeito de ver isso é ter os DOIS
   * lados preenchidos com valores DIFERENTES, que é o que este cenário faz.
   */
  it("o SEGMENTO resolvido é o da VAGA, não o do cliente", async () => {
    const s = segmentoDe(await listarNoCenario(SOBREPOE));
    expect(s.id, "o coalesce está invertido: o cliente venceu a vaga").toBe(9);
    expect(s.rotulo).toBe("Saúde");
  });

  it("o COMERCIAL resolvido é o da VAGA, não o do cliente", async () => {
    const co = comercialDe(await listarNoCenario(SOBREPOE));
    expect(co.id, "o coalesce está invertido: o cliente venceu a vaga").toBe(5);
    expect(co.rotulo).toBe("Bruno Exemplo");
  });

  it("a origem do valor sobreposto é SOBREPOSTO", async () => {
    const item = await listarNoCenario(SOBREPOE);
    expect(segmentoDe(item).origem).toBe("SOBREPOSTO");
    expect(comercialDe(item).origem).toBe("SOBREPOSTO");
  });

  /**
   * ─ A VAGA SOBREPÕE **E O CLIENTE MUDA DEPOIS** ───────────────────────────────────────────────
   * É o caso que o autor tende a não escrever, porque parece o mesmo de cima. Não é: com a herança
   * VIVA, trocar o segmento do cliente reescreve TODAS as vagas que herdam, e a pergunta que fica é
   * se ela reescreve também as que SOBREPUSERAM. Não pode. Sobrepor é dizer "esta aqui é diferente",
   * e a diferença não pode evaporar porque alguém corrigiu o cadastro do cliente.
   */
  it("o cliente mudando depois NÃO reescreve a vaga que sobrepôs", async () => {
    const s = segmentoDe(
      await listarNoCenario({
        vagaSegmento: 9,
        vagaComercial: 5,
        clienteSegmento: 11, // o cliente mudou de Varejo para Indústria depois da abertura
        clienteComercial: 3,
      }),
    );
    expect(s.id, "a troca no cliente atropelou a sobreposição da vaga").toBe(9);
    expect(s.rotulo).toBe("Saúde");
  });

  /**
   * O GÊMEO DO DE CIMA, pelo outro lado: a vaga que HERDA acompanha a troca. É a definição de
   * herança viva, e é a metade que uma implementação com CÓPIA NO NASCIMENTO reprovaria.
   */
  it("o cliente mudando depois REESCREVE a vaga que herda (herança viva)", async () => {
    const s = segmentoDe(
      await listarNoCenario({
        vagaSegmento: null,
        vagaComercial: null,
        clienteSegmento: 11,
        clienteComercial: 5,
      }),
    );
    expect(s.id).toBe(11);
    expect(s.rotulo).toBe("Indústria");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. AS AUSÊNCIAS: NINGUÉM TEM O VALOR, E A VAGA NEM CLIENTE TEM
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("quando não há o que herdar, o resolvido é NULO (e a tela escreve 'não informado')", () => {
  /**
   * O CLIENTE SEM SEGMENTO é o caso NORMAL no dia seguinte à subida: os dois campos nascem vazios em
   * TODOS os 232 clientes, e ninguém preencheu nada ainda. O `coalesce` devolve nulo, e nulo TEM DE
   * CHEGAR como nulo: inventar string vazia, "0" ou o glifo de traço aqui faria a tela escrever
   * qualquer coisa menos o "não informado" que a §A.11 manda.
   */
  it("cliente SEM segmento e vaga SEM sobreposição devolve id e rótulo nulos", async () => {
    const s = segmentoDe(
      await listarNoCenario({
        vagaSegmento: null,
        vagaComercial: null,
        clienteSegmento: null,
        clienteComercial: null,
      }),
    );
    expect(s.id).toBeNull();
    expect(s.rotulo, "nulo virou texto: a tela perde o 'não informado' da §A.11").toBeNull();
  });

  it("a origem, quando não há valor nenhum, é AUSENTE", async () => {
    const item = await listarNoCenario({
      vagaSegmento: null,
      vagaComercial: null,
      clienteSegmento: null,
      clienteComercial: null,
    });
    expect(segmentoDe(item).origem).toBe("AUSENTE");
    expect(comercialDe(item).origem).toBe("AUSENTE");
  });

  /**
   * ─ A VAGA SEM CLIENTE ────────────────────────────────────────────────────────────────────────
   * Impossível para vaga NOVA desde a Onda D, e possível de sobra no rascunho e na base antiga. O
   * `leftJoin` não casa, TODA coluna de `clientes` vem nula, e o `coalesce` tem de aguentar isso sem
   * explodir e sem inventar. Um `innerJoin` aqui sumiria com a vaga da listagem inteira, que é o
   * defeito que a própria listagem já documenta e que esta onda não pode reintroduzir pelo join novo.
   */
  it("vaga SEM cliente e SEM sobreposição devolve nulo, e a vaga continua na lista", async () => {
    const item = await listarNoCenario({
      vagaSegmento: null,
      vagaComercial: null,
      clienteSegmento: "sem-cliente",
      clienteComercial: "sem-cliente",
    });
    expect(item.id, "a vaga sem cliente sumiu da listagem").toBe("vaga-1");
    expect(segmentoDe(item).id).toBeNull();
    expect(comercialDe(item).id).toBeNull();
  });

  it("vaga SEM cliente mas COM sobreposição devolve o valor da vaga", async () => {
    const item = await listarNoCenario({
      vagaSegmento: 9,
      vagaComercial: 5,
      clienteSegmento: "sem-cliente",
      clienteComercial: "sem-cliente",
    });
    expect(segmentoDe(item).id).toBe(9);
    expect(segmentoDe(item).rotulo).toBe("Saúde");
    expect(comercialDe(item).id).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. O CATÁLOGO INATIVADO: O PRECEDENTE DA "ETAPA FANTASMA" (10/09)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("inativar no catálogo NÃO pode apagar o rótulo da vaga que já aponta para ele", () => {
  /**
   * ─ O DEFEITO, E ELE JÁ ACONTECEU NESTA CASA ──────────────────────────────────────────────────
   * Inativação é EXCLUSÃO LÓGICA: a linha sai do SELETOR e continua respondendo pelo histórico. Um
   * join escrito com `and(eq(segmento.ativo, true))` dentro (que parece higiene, e é uma linha a
   * mais que qualquer um escreve sem pensar) apaga o rótulo de TODA vaga viva que aponta para o
   * segmento no instante em que alguém o inativa, e ninguém liga uma coisa à outra depois.
   *
   * O banco de mentira OBEDECE a esse filtro de propósito: se ele estiver na consulta, o rótulo vem
   * nulo e este caso fica VERMELHO. É a única forma de a diferença aparecer antes da operação.
   */
  it("o SEGMENTO inativado continua devolvendo o rótulo na vaga que sobrepõe", async () => {
    const s = segmentoDe(
      await listarNoCenario({
        vagaSegmento: 9,
        vagaComercial: null,
        clienteSegmento: 7,
        clienteComercial: 3,
        inativos: [9],
      }),
    );
    expect(s.id).toBe(9);
    expect(s.rotulo, "o join filtra por `ativo` e apagou o rótulo da vaga viva").toBe("Saúde");
  });

  it("o SEGMENTO inativado NO CLIENTE continua devolvendo o rótulo na vaga que herda", async () => {
    const s = segmentoDe(
      await listarNoCenario({
        vagaSegmento: null,
        vagaComercial: null,
        clienteSegmento: 7,
        clienteComercial: 3,
        inativos: [7],
      }),
    );
    expect(s.id).toBe(7);
    expect(s.rotulo).toBe("Varejo");
  });

  it("o COMERCIAL inativado continua devolvendo o nome na vaga que herda", async () => {
    const co = comercialDe(
      await listarNoCenario({
        vagaSegmento: null,
        vagaComercial: null,
        clienteSegmento: 7,
        clienteComercial: 3,
        inativos: [3],
      }),
    );
    expect(co.id).toBe(3);
    expect(co.rotulo).toBe("Ana Exemplo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. A ARMADILHA DO FILTRO: A COLUNA CRUA NÃO PODE SER O QUE CHEGA NA TELA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o que a listagem entrega é o valor RESOLVIDO, nunca a coluna crua", () => {
  /**
   * ─ O DEFEITO MAIS PROVÁVEL DA ONDA INTEIRA, e ele nasce AQUI, não na tela ─────────────────────
   *
   * O filtro da Central de Vagas roda no cliente, sobre o item que esta listagem entrega. Se o item
   * carregar a COLUNA CRUA (`segmentoId` = null na vaga que herda), o filtro por "Varejo" perde
   * TODAS as vagas que herdam, que são a maioria esmagadora, e a tela mostra uma lista curta que
   * parece certa. Ninguém percebe, porque não há erro: há resposta a menos.
   *
   * A TRAVA É ESTA: nenhum campo de segmento/comercial do item pode valer NULO num cenário em que o
   * valor RESOLVIDO existe. O item pode carregar a coluna crua ao lado, para responder "quais vagas
   * SOBREPÕEM", mas então ela tem de ter um nome que diga isso (`segmentoProprioId`,
   * `segmentoSobrepostoId`), e não o nome que a tela vai pegar sem pensar.
   */
  it("nenhum campo de SEGMENTO do item vem nulo quando o valor herdado existe", async () => {
    const item = await listarNoCenario({
      vagaSegmento: null,
      vagaComercial: null,
      clienteSegmento: 7,
      clienteComercial: 3,
    });
    // O CAMPO RESOLVIDO TEM DE EXISTIR ANTES: sem esta linha o caso passaria VAZIO enquanto a onda
    // não estivesse construída (nenhuma chave casa, o laço não roda, verde), e verde vazio é a pior
    // forma de falso positivo, porque só some no dia em que já não protege nada.
    expect(segmentoDe(item).id).toBe(7);
    const suspeitos = Object.keys(item).filter((k) => /^segmento(Id|Rotulo)?$/i.test(k));
    for (const k of suspeitos) {
      expect(
        item[k],
        `\`${k}\` é a COLUNA CRUA: vale nulo na vaga que herda, e o filtro escrito contra ele perde a maioria das vagas. Renomeie para deixar claro que é a sobreposição.`,
      ).not.toBeNull();
    }
  });

  it("nenhum campo de COMERCIAL do item vem nulo quando o valor herdado existe", async () => {
    const item = await listarNoCenario({
      vagaSegmento: null,
      vagaComercial: null,
      clienteSegmento: 7,
      clienteComercial: 3,
    });
    expect(comercialDe(item).id).toBe(3);
    const suspeitos = Object.keys(item).filter((k) => /^comercial(Id|Rotulo)?$/i.test(k));
    for (const k of suspeitos) {
      expect(item[k], `\`${k}\` é a COLUNA CRUA e vale nulo na vaga que herda`).not.toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. O CONTRATO DO BANCO: AS COLUNAS, A NULABILIDADE E O QUE ACONTECE AO APAGAR
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** A tabela exportada pelo schema com aquele nome REAL, seja qual for o nome da constante. */
function tabelaPorNome(nome: string): PgTable | null {
  for (const exportado of Object.values(schema)) {
    if (is(exportado, PgTable) && getTableName(exportado) === nome) return exportado;
  }
  return null;
}

function exigirTabela(nome: string): PgTable {
  const t = tabelaPorNome(nome);
  if (!t) {
    const tabelas = Object.values(schema)
      .filter((e) => is(e, PgTable))
      .map((e) => getTableName(e as never));
    throw new Error(`CONTRATO NÃO ATENDIDO: não existe a tabela "${nome}". Existem: ${JSON.stringify(tabelas)}`);
  }
  return t;
}

function coluna(tabela: PgTable, nome: string) {
  return getTableConfig(tabela).columns.find((c) => c.name === nome) ?? null;
}

describe.each([
  ["as_segmentos", "segmento_id"],
  ["as_comerciais", "comercial_id"],
])("o catálogo %s", (tabelaCatalogo, colunaFk) => {
  it("existe, com as colunas que todo catálogo desta casa tem", () => {
    const t = exigirTabela(tabelaCatalogo);
    for (const c of ["id", "rotulo", "ordem", "ativo"]) {
      expect(coluna(t, c), `falta a coluna ${c} em ${tabelaCatalogo}`).not.toBeNull();
    }
  });

  it("`ativo` é obrigatório: inativar é exclusão LÓGICA, e nulo não é resposta", () => {
    expect(coluna(exigirTabela(tabelaCatalogo), "ativo")?.notNull).toBe(true);
  });

  /**
   * NULÁVEL NOS DOIS LADOS, e por motivos DIFERENTES, que é por isso que os dois casos existem:
   * no CLIENTE, nulo é "ainda não preencheram" (o campo é OPCIONAL, e cliente sem segmento continua
   * salvando); na VAGA, nulo é a PRÓPRIA REGRA da herança. Um `notNull` em qualquer um dos dois
   * mataria metade da onda.
   */
  it(`clientes.${colunaFk} existe e é NULÁVEL (o campo é opcional)`, () => {
    const c = coluna(exigirTabela("clientes"), colunaFk);
    expect(c, `falta clientes.${colunaFk}`).not.toBeNull();
    expect(c?.notNull, "cliente sem segmento/comercial precisa continuar salvando").toBe(false);
  });

  it(`vagas.${colunaFk} existe e é NULÁVEL (nulo É a herança)`, () => {
    const c = coluna(exigirTabela("vagas"), colunaFk);
    expect(c, `falta vagas.${colunaFk}`).not.toBeNull();
    expect(c?.notNull, "obrigatório na vaga mataria a herança: nulo é o que significa herdar").toBe(false);
  });

  /**
   * O `DELETE` NÃO PODE CASCATEAR NEM ZERAR. `cascade` apagaria VAGAS (ou CLIENTES) ao apagar um
   * segmento; `set null` transformaria uma sobreposição em herança silenciosa, e a vaga passaria a
   * mostrar o valor do cliente sem ninguém ter mudado nada, que é o defeito mais difícil de
   * enxergar desta onda inteira. `restrict` é o par da exclusão lógica, e é o que `linha_servico_id`
   * e `cidade_id` já fazem.
   */
  it.each([["vagas"], ["clientes"]])(
    `%s.${colunaFk} apaga com RESTRICT, nunca cascade nem set null`,
    (tab) => {
      const fks = getTableConfig(exigirTabela(tab)).foreignKeys.filter((fk) =>
        fk.reference().columns.some((c) => c.name === colunaFk),
      );
      expect(
        fks.length,
        `nenhuma FK em ${tab}.${colunaFk}: sem FK, o id órfão vira rótulo vazio e ninguém descobre`,
      ).toBeGreaterThan(0);
      for (const fk of fks) {
        expect(fk.onDelete ?? "no action", `${tab}.${colunaFk}`).toMatch(/restrict|no action/i);
      }
    },
  );
});

/**
 * ─ O SEGMENTO SEGUE O MOLDE INTEIRO: `codigo` IMUTÁVEL E ÚNICO ─────────────────────────────────
 *
 * É catálogo de PROCESSO, e o código derivado do rótulo é o que deixa o histórico legível e impede
 * dois "Varejo" convivendo.
 */
describe("as_segmentos segue o molde de as_linhas_servico, com código", () => {
  it("tem `codigo`, obrigatório e UNIQUE", () => {
    const cfg = getTableConfig(exigirTabela("as_segmentos"));
    const codigo = cfg.columns.find((c) => c.name === "codigo");
    expect(codigo, "falta as_segmentos.codigo").toBeDefined();
    expect(codigo?.notNull, "o código precisa ser obrigatório").toBe(true);
    const temUnique =
      codigo?.isUnique === true ||
      cfg.uniqueConstraints.some((u) => u.columns.some((c) => c.name === "codigo"));
    expect(temUnique, "sem UNIQUE, dois segmentos com o mesmo código convivem").toBe(true);
  });
});

/**
 * ─ O COMERCIAL **NÃO** SEGUE O MOLDE NESTES DOIS PONTOS, e a diferença é a §A.6 ────────────────
 *
 * ┌─ POR QUE NÃO TEM `codigo` (achado da auditoria do mapa) ────────────────────────────────────┐
 * │ O molde DERIVA o código do rótulo na criação e NUNCA mais o muda. Com nome de pessoa, isso   │
 * │ gravaria "ANA_EXEMPLO" numa chave IMUTÁVEL que nenhuma tela corrige, e a LGPD dá direito à   │
 * │ RETIFICAÇÃO: casamento, nome social, erro de digitação. Renomear passaria a corrigir o       │
 * │ rótulo e deixar o nome antigo preso no código, para sempre, em toda exportação futura.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE NÃO TEM UNIQUE NO NOME ────────────────────────────────────────────────────────────┐
 * │ DUAS RAZÕES, e as duas doem. HOMÔNIMO É CASO VÁLIDO: duas pessoas chamadas "Ana Silva" no    │
 * │ comercial não podem ser uma só, e o unique recusaria a segunda. E a MENSAGEM DE RECUSA       │
 * │ VAZARIA NOME: "já existe uma comercial com esse nome (inativa)" conta, para quem só tentou   │
 * │ cadastrar alguém, que uma ex-funcionária de mesmo nome passou por aqui.                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("as_comerciais NÃO copia o molde onde o molde não serve para nome de pessoa", () => {
  it("NÃO tem coluna `codigo` (código imutável derivado de nome de pessoa é irretificável)", () => {
    expect(
      coluna(exigirTabela("as_comerciais"), "codigo"),
      "as_comerciais tem `codigo`: nome de pessoa preso numa chave que nenhuma tela corrige",
    ).toBeNull();
  });

  it("`rotulo` NÃO é unique: dois homônimos no comercial entram os dois", () => {
    const cfg = getTableConfig(exigirTabela("as_comerciais"));
    const rotulo = cfg.columns.find((c) => c.name === "rotulo");
    const temUnique =
      rotulo?.isUnique === true ||
      cfg.uniqueConstraints.some((u) => u.columns.some((c) => c.name === "rotulo"));
    expect(
      temUnique,
      "unique no nome recusa o segundo homônimo E faz a recusa contar que existe alguém de mesmo nome",
    ).toBe(false);
  });

  it("guarda o NOME e mais nada: sem e-mail, sem telefone, sem CPF (§A.6 minimização)", () => {
    const nomes = getTableConfig(exigirTabela("as_comerciais")).columns.map((c) => c.name);
    for (const proibida of ["email", "e_mail", "telefone", "celular", "cpf", "usuario_id"]) {
      expect(nomes, `as_comerciais.${proibida} é dado pessoal a mais, sem uso declarado`).not.toContain(
        proibida,
      );
    }
  });
});

/**
 * ─ REGRESSÃO: A ONDA C NÃO PODE ENCOLHER ──────────────────────────────────────────────────────
 * Este bloco nasce VERDE de propósito. `vagas` e `clientes` são tabelas centrais e a onda escreve
 * nas duas; coluna vizinha que some numa edição à mão é o modo de falha que ele existe para pegar.
 */
describe("regressão: as colunas da Onda C continuam onde estavam", () => {
  it.each([
    ["vagas", "linha_servico_id"],
    ["vagas", "cidade_id"],
    ["vagas", "cod_cliente"],
    ["clientes", "cod_cliente"],
    ["clientes", "tipo_marcacao"],
  ])("%s.%s continua existindo", (tab, col) => {
    expect(coluna(exigirTabela(tab), col), `${tab}.${col} sumiu`).not.toBeNull();
  });

  it("as_linhas_servico e as_cidades continuam no schema", () => {
    expect(tabelaPorNome("as_linhas_servico")).not.toBeNull();
    expect(tabelaPorNome("as_cidades")).not.toBeNull();
  });
});
