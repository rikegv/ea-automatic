import "reflect-metadata";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { BeneficiosFilaService } from "./beneficios-fila.service";

/**
 * A FILA DE BENEFÍCIOS (§A.17 etapa 4).
 *
 * O que estes testes travam, em ordem de importância:
 *
 *  1. As QUATRO colunas principais são sempre as mesmas e sempre existem na linha, mesmo quando a
 *     pessoa não tem nenhuma delas. Coluna que aparece e some conforme o pacote faria a tabela
 *     dançar entre as linhas.
 *  2. O casamento é pela SIGLA do catálogo, e o que não é um dos quatro cai no "+N". O catálogo é
 *     vivo (renomeia e cria), então a degradação tem de ser segura: some da coluna, nunca da tela.
 *  3. IMPORTADA mostra o texto SÓ quando não há pacote estruturado. Mostrar os dois faria a linha
 *     dizer a mesma coisa de dois jeitos.
 *
 * Fake do Drizzle por FILA DE RESULTADOS: a leitura dispara duas consultas em ordem conhecida (as
 * admissões da fila, depois o pacote de todas elas).
 */

type Row = Record<string, unknown>;

const CATALOGO: Row[] = [
  { id: "id-vt", nome: "VT (Vale-Transporte)" },
  { id: "id-vr", nome: "VR (Vale-Refeição)" },
  { id: "id-va", nome: "VA (Vale-Alimentação)" },
  { id: "id-am", nome: "AM (Assistência Médica)" },
  { id: "id-cesta", nome: "Cesta básica" },
];

/**
 * O serviço dispara as leituras em ordem conhecida: catálogo, depois (linhas, contagem, clientes) em
 * paralelo, depois o pacote das linhas da página. O fake devolve nessa ordem e GUARDA os `where`
 * renderizados, que é como os testes de filtro conferem o que foi para o banco.
 */
function montar(linhas: Row[], pacotes: Row[] = []) {
  const fila: unknown[][] = [
    CATALOGO,
    linhas,
    [{ n: linhas.length }],
    [{ codCliente: "57269", nomeOperacao: "CIA DAS LETRAS", razaoSocial: "EDITORA SCHWARCZ S.A." }],
    pacotes,
  ];
  let i = 0;
  const wheres: unknown[] = [];

  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "groupBy", "orderBy", "limit", "offset"]) {
    chain[m] = () => chain;
  }
  chain.where = (cond: unknown) => {
    wheres.push(cond);
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(fila[Math.min(i++, fila.length - 1)]);

  const db = { select: vi.fn(() => chain), selectDistinct: vi.fn(() => chain) };
  return { svc: new BeneficiosFilaService(db as never), wheres };
}

/** Atalho para os testes que não conferem filtro, só o formato da linha. */
const montarSvc = (linhas: Row[], pacotes: Row[] = []) => montar(linhas, pacotes).svc;

/** O SQL que foi de fato para o banco, para os testes de filtro conferirem a condição montada. */
const sqlDoWhere = (cond: unknown) =>
  new PgDialect().sqlToQuery(cond as never).sql.replace(/\s+/g, " ");

const PESSOA: Row = {
  admissaoId: "adm-1",
  candidato: "MARIA DA SILVA",
  dataAdmissao: "2026-09-01",
  codCliente: "57269",
  clienteRazaoSocial: "EDITORA SCHWARCZ S.A.",
  clienteNomeOperacao: "CIA DAS LETRAS",
  entrouEm: "2026-08-12T10:00:00.000Z",
  beneficiosTexto: null,
};

const b = (admissaoId: string, nome: string, valor: string | null = null) => ({
  admissaoId,
  nome,
  valor,
});

describe("as quatro colunas principais", () => {
  it("existem sempre, mesmo para quem não tem nenhuma", async () => {
    const r = await montarSvc([PESSOA]).listar();

    expect(r.principais).toEqual(["VT", "VR", "VA", "AM"]);
    expect(r.items[0].principais).toEqual({ VT: false, VR: false, VA: false, AM: false });
  });

  it("marcam pela SIGLA do catálogo", async () => {
    const r = await montarSvc(
      [PESSOA],
      [b("adm-1", "VT (Vale-Transporte)"), b("adm-1", "AM (Assistência Médica)")],
    ).listar();

    expect(r.items[0].principais).toEqual({ VT: true, VR: false, VA: false, AM: true });
  });

  it("o que não é um dos quatro cai no +N, com o valor quando existe", async () => {
    const r = await montarSvc(
      [PESSOA],
      [b("adm-1", "VR (Vale-Refeição)"), b("adm-1", "Cesta básica", "180.00")],
    ).listar();

    expect(r.items[0].principais.VR).toBe(true);
    expect(r.items[0].outros).toEqual([{ nome: "Cesta básica", valor: "180.00" }]);
  });

  /**
   * O catálogo é VIVO: a tela de Benefícios do admin renomeia. Se alguém renomear a ponto de perder a
   * sigla, o benefício não pode SUMIR da tela; ele cai no "+N", que é a degradação segura.
   */
  it("benefício renomeado sem a sigla vira +N em vez de sumir", async () => {
    const r = await montarSvc([PESSOA], [b("adm-1", "Vale Transporte")]).listar();

    expect(r.items[0].principais.VT).toBe(false);
    expect(r.items[0].outros.map((o) => o.nome)).toContain("Vale Transporte");
  });
});

describe("a admissão IMPORTADA", () => {
  it("mostra o texto achatado quando não tem pacote estruturado", async () => {
    const r = await montarSvc([{ ...PESSOA, beneficiosTexto: "VT, VR e cesta" }]).listar();

    expect(r.items[0].textoImportado).toBe("VT, VR e cesta");
  });

  it("com pacote estruturado, o texto NÃO aparece (a linha não diz a mesma coisa duas vezes)", async () => {
    const r = await montarSvc(
      [{ ...PESSOA, beneficiosTexto: "VT, VR e cesta" }],
      [b("adm-1", "VT (Vale-Transporte)")],
    ).listar();

    expect(r.items[0].textoImportado).toBeNull();
    expect(r.items[0].principais.VT).toBe(true);
  });
});

describe("a linha da fila", () => {
  it("leva o código do cliente junto do nome de operação", async () => {
    const r = await montarSvc([PESSOA]).listar();

    expect(r.items[0].codCliente).toBe("57269");
    expect(r.items[0].cliente).toBe("CIA DAS LETRAS");
  });

  it("cliente sem nome de operação cai na razão social", async () => {
    const r = await montarSvc([{ ...PESSOA, clienteNomeOperacao: null }]).listar();
    expect(r.items[0].cliente).toBe("EDITORA SCHWARCZ S.A.");
  });

  it("o pacote de uma admissão não vaza para a outra", async () => {
    const r = await montarSvc(
      [PESSOA, { ...PESSOA, admissaoId: "adm-2", candidato: "JOAO SOUZA" }],
      [b("adm-1", "VT (Vale-Transporte)"), b("adm-2", "VA (Vale-Alimentação)")],
    ).listar();

    expect(r.items[0].principais).toMatchObject({ VT: true, VA: false });
    expect(r.items[1].principais).toMatchObject({ VT: false, VA: true });
    expect(r.total).toBe(2);
  });
});

/**
 * BUSCA E FILTROS (etapa 1). O que importa aqui é que o recorte vai para o BANCO, e não que a tela
 * filtre um punhado de linhas já carregadas: com ~1.600 pessoas na fila, filtrar no cliente mostraria
 * o recorte só da página aberta, que é ordem e contagem mentirosas.
 */
describe("busca e filtros", () => {
  it("a fila parte de quem tem o CADASTRO CONCLUÍDO, e declínio fica de fora (§A.16)", async () => {
    const ctx = montar([PESSOA]);
    await ctx.svc.listar();

    const where = sqlDoWhere(ctx.wheres[0]);
    expect(where).toContain("CADASTRO_CONTRATO");
    expect(where).toContain("concluida = true");
    expect(where).toContain("DECLINOU");
  });

  it("a busca procura por nome do candidato E por cliente", async () => {
    const ctx = montar([PESSOA]);
    await ctx.svc.listar({ q: "maria" });

    const where = sqlDoWhere(ctx.wheres[0]);
    expect(where).toContain("ILIKE");
    expect(where.match(/ILIKE/g)?.length, "nome, código, operação e razão social").toBe(4);
  });

  it("COM e SEM viram EXISTS e NOT EXISTS sobre o benefício do catálogo", async () => {
    const ctx = montar([PESSOA]);
    await ctx.svc.listar({ com: ["VT"], sem: ["VR"] });

    const where = sqlDoWhere(ctx.wheres[0]);
    expect(where).toContain("EXISTS (select 1 from admissao_beneficio");
    expect(where).toContain("NOT EXISTS (select 1 from admissao_beneficio");
  });

  /** Sigla que não existe no catálogo é IGNORADA, e não vira consulta sem sentido nem erro. */
  it("sigla desconhecida no filtro é ignorada", async () => {
    const ctx = montar([PESSOA]);
    await ctx.svc.listar({ com: ["XX"] });

    expect(sqlDoWhere(ctx.wheres[0])).not.toContain("admissao_beneficio");
  });

  it("o filtro de pacote separa quem tem estruturado de quem só tem texto", async () => {
    const estruturado = montar([PESSOA]);
    await estruturado.svc.listar({ pacote: "ESTRUTURADO" });
    expect(sqlDoWhere(estruturado.wheres[0])).toMatch(/(?<!NOT )EXISTS \(select 1 from admissao_beneficio ab where ab.admissao_id/);

    const importado = montar([PESSOA]);
    await importado.svc.listar({ pacote: "IMPORTADO" });
    expect(sqlDoWhere(importado.wheres[0])).toContain("NOT EXISTS (select 1 from admissao_beneficio");
  });

  it("a página é limitada e a resposta diz onde está", async () => {
    const r = await montarSvc([PESSOA]).listar({ page: 2, pageSize: 25 });

    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(25);
    expect(r.totalPages).toBeGreaterThanOrEqual(1);
  });

  /**
   * O SELETOR DE CLIENTE sai da fila INTEIRA, não do recorte filtrado: um filtro que só oferece o que
   * já está selecionado vira uma porta que se fecha sozinha.
   */
  it("os clientes do seletor não dependem do filtro aplicado", async () => {
    const ctx = montar([PESSOA]);
    const r = await ctx.svc.listar({ codCliente: ["57269"] });

    expect(r.clientes).toEqual([{ codCliente: "57269", nome: "CIA DAS LETRAS" }]);
    // A consulta dos clientes usa só a condição da fila, sem os filtros da tela.
    const whereClientes = sqlDoWhere(ctx.wheres[2]);
    expect(whereClientes).not.toContain("57269");
  });
});

/**
 * ORDENAÇÃO NO BANCO (leva 2). A fila é paginada no servidor, então ordenar na tela ordenaria só a
 * página aberta e mostraria ordem falsa. O que estes testes travam é que a coluna pedida vira
 * `order by` de verdade, e que chave desconhecida não vira ordem inventada nem erro.
 */
describe("ordenação servida pelo banco", () => {
  const ordemDe = async (filtros: Parameters<BeneficiosFilaService["listar"]>[0]) => {
    const ordens: unknown[] = [];
    const fila: unknown[][] = [CATALOGO, [PESSOA], [{ n: 1 }], [], []];
    let i = 0;
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "leftJoin", "groupBy", "where", "limit", "offset"]) {
      chain[m] = () => chain;
    }
    chain.orderBy = (...args: unknown[]) => {
      ordens.push(args);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) => resolve(fila[Math.min(i++, fila.length - 1)]);
    const db = { select: vi.fn(() => chain), selectDistinct: vi.fn(() => chain) };
    await new BeneficiosFilaService(db as never).listar(filtros);
    return new PgDialect().sqlToQuery((ordens[0] as never[])[0]).sql.replace(/\s+/g, " ");
  };

  it("ordena pelo NOME do candidato quando é o pedido", async () => {
    expect(await ordemDe({ ordenarPor: "candidato", direcao: "asc" })).toContain("nome");
  });

  it("ordena pela DATA de admissão", async () => {
    expect(await ordemDe({ ordenarPor: "dataAdmissao", direcao: "desc" })).toContain("data_admissao");
  });

  it("um benefício ordena pela PRESENÇA dele, que é o que a coluna pergunta", async () => {
    const sql = await ordemDe({ ordenarPor: "VR", direcao: "desc" });
    expect(sql.toLowerCase()).toContain("exists");
    expect(sql).toContain("admissao_beneficio");
  });

  /** A coluna do farol dos benefícios: a seta ordena pelo mesmo enum que a pill mostra. */
  it("STATUS ordena pelo estágio do pacote", async () => {
    expect(await ordemDe({ ordenarPor: "status", direcao: "asc" })).toContain(
      "status_cadastro_beneficio",
    );
  });

  it("OUTROS ordena pela quantidade fora dos quatro, que é o número do +N", async () => {
    const sql = await ordemDe({ ordenarPor: "outros", direcao: "desc" });
    expect(sql).toContain("count(*)");
    expect(sql).toContain("not in");
  });

  /** Coluna fora da lista fechada cai na ordem padrão: nada de injeção nem de tela derrubada. */
  it("chave desconhecida cai na ordem padrão (entrada na fila)", async () => {
    const sql = await ordemDe({ ordenarPor: "'; drop table admissoes; --" });
    expect(sql).toContain("coalesce");
    expect(sql).not.toContain("drop table");
  });

  it("sem pedido nenhum, a ordem padrão é a entrada na fila", async () => {
    expect(await ordemDe({})).toContain("coalesce");
  });
});

/**
 * O VALOR DE CADA PRINCIPAL entra na linha para o modal que abre ao clicar na célula. Vem da consulta
 * que já existia (o pacote sempre trouxe `valor`), e não de uma leitura nova.
 */
describe("valores dos quatro principais", () => {
  it("a linha leva o valor de cada um, e nulo quando não há", async () => {
    const r = await montarSvc(
      [PESSOA],
      [b("adm-1", "VR (Vale-Refeição)", "44.00"), b("adm-1", "VT (Vale-Transporte)")],
    ).listar();

    expect(r.items[0].valores.VR).toBe("44.00");
    expect(r.items[0].valores.VT, "tem o benefício, ainda sem valor").toBeNull();
    expect(r.items[0].valores.AM, "não tem o benefício").toBeNull();
  });
});

/**
 * CAMADA DE PAGAMENTO POR CLIENTE (§A.17 etapa 4, onda 1).
 *
 * Dois campos com naturezas opostas de propósito, e o teste guarda a diferença:
 *  - PERIODICIDADE é só informativa. Sai do cadastro do cliente e chega à linha como está, sem
 *    cálculo nenhum. Foi o diretor que cortou o cálculo daqui.
 *  - DATA DO 1º CRÉDITO é o único cálculo, e conta o PRÓPRIO DIA da admissão: 13/08 num cliente de
 *    5 dias credita em 17/08 (13, 14, 15, 16, 17), não em 18/08. Zero e um caem na própria data.
 *
 * A expressão é declarada UMA vez e serve exibição e ordenação, então o teste de SQL abaixo é o que
 * impede a seta de ordenar por um critério diferente do que a célula mostra.
 */
describe("camada de pagamento por cliente", () => {
  it("a periodicidade chega à linha como está, sem cálculo", async () => {
    const r = await montarSvc([{ ...PESSOA, periodicidade: "CADA_15_DIAS" }]).listar();
    expect(r.items[0].periodicidade).toBe("CADA_15_DIAS");
  });

  it("cliente sem regra cadastrada devolve nulo, e a tela decide o texto", async () => {
    const r = await montarSvc([{ ...PESSOA, periodicidade: null, primeiroCredito: null }]).listar();
    expect(r.items[0].periodicidade).toBeNull();
    expect(r.items[0].primeiroCredito).toBeNull();
  });

  it("a data do 1º crédito chega à linha", async () => {
    const r = await montarSvc([{ ...PESSOA, primeiroCredito: "2026-08-17" }]).listar();
    expect(r.items[0].primeiroCredito).toBe("2026-08-17");
  });

  /**
   * A REGRA NO SQL, que é onde ela realmente vive. Sem isto, o cálculo só seria conferido pelo que o
   * fake devolve, ou seja, não seria conferido.
   */
  it("o SQL conta o próprio dia da admissão e nunca inventa data", async () => {
    const { svc, wheres } = montar([PESSOA]);
    await svc.listar({ ordenarPor: "primeiroCredito", direcao: "asc" });
    // A expressão da ordenação é a MESMA da exibição; renderizada, tem de carregar a regra inteira.
    const rendered = sqlDoWhere(
      (BeneficiosFilaService as unknown as { PRIMEIRO_CREDITO: unknown }).PRIMEIRO_CREDITO,
    );
    // `- 1` é o que faz o dia da admissão contar; `greatest(..., 0)` é o piso de "mesmo dia".
    expect(rendered).toContain("- 1");
    expect(rendered).toContain("greatest");
    // Sem data de admissão ou sem regra do cliente, o resultado é NULO, nunca uma data chutada.
    expect(rendered).toContain("is null");
    expect(wheres.length).toBeGreaterThan(0);
  });
});
