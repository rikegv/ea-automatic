import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { DigaiRepositorio } from "./digai-repositorio";
import { catalogoDaRevisao } from "../ingestao-pandape/vaga-pendente-revisao.tester-fake";
import { IngestaoDeParaCliente } from "../ingestao-pandape/ingestao-depara-cliente.service";
import { novoResumo } from "../ingestao-pandape/ingestao-ciclo";

/**
 * O TESTE MAIS CARO DESTA FRENTE: O ENRIQUECIMENTO DA VAGA EM BRANCO NAO ENCOSTA EM CANDIDATURA.
 *
 * Arquivo do `tester` (secao A.38), escrito a partir do REQUISITO e em paralelo a construcao
 * (secao A.40, regra 2). Nao conserta codigo de producao: so assere.
 *
 * O QUE ESTA EM JOGO, medido em producao em 08/10/2026: 13 vagas em branco com 223 candidaturas de
 * 223 PESSOAS REAIS penduradas nelas. A FK `as_candidaturas -> vagas` e RESTRICT, entao o banco
 * recusa apagar a vaga, mas RESTRICT nao protege de um `update as_candidaturas`, nao protege de um
 * `delete from as_candidaturas` e nao protege de a candidatura ser movida para outra vaga. O
 * requisito e preencher COLUNA DA VAGA, e nada mais, entao a regua exequivel e esta: nenhuma
 * instrucao emitida pelo caminho do enriquecimento cita `as_candidaturas`.
 *
 * ESTE ARQUIVO MEDE EM DUAS CAMADAS, de proposito:
 *  1. COMPORTAMENTO: roda os dois caminhos que existem hoje (o espelho da vaga e o pre-preenchimento
 *     pela planilha) contra banco que so ANOTA, e varre as instrucoes compiladas.
 *  2. LISTA FECHADA SOBRE O FONTE: um canario. O codigo do enriquecimento ainda esta sendo escrito,
 *     entao a camada 1 nao alcanca o que ainda nao existe; a camada 2 alcanca, porque qualquer
 *     arquivo NOVO da pasta que mencione `as_candidaturas` fica vermelho sem ninguem lembrar de
 *     acrescentar teste. A lista nasce da MEDIDA de hoje, nao de uma suposicao.
 *
 * Secao A.6: todo dado aqui e sintetico. Nenhum CPF, nenhum nome de pessoa, nenhum e-mail. Os
 * numeros de vaga usados sao os da faixa de teste (9xxxxx) e os cinco orfaos medidos, que sao
 * numero de vaga e nao dado pessoal.
 */

const dialeto = new PgDialect();
const ID_DA_VAGA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NUMERO_DO_PANDAPE = "3498580";
const CARGO_ID = "99999999-9999-4999-8999-999999999999";

// ── O BANCO QUE SO ANOTA ───────────────────────────────────────────────────────────────────────

interface Instrucao {
  sql: string;
  params: unknown[];
}

/**
 * Banco fingido que ROTEIA por padrao e guarda a instrucao compilada.
 *
 * A LENTE QUE ESTE ARQUIVO APLICA EM SI MESMO: "algum duble responde igual para consultas
 * diferentes?". Aqui NAO: cada rota tem padrao proprio, e consulta que nao casa com rota nenhuma
 * devolve `[]` E fica anotada, entao um caminho novo nao e absorvido em silencio por uma resposta
 * generica. Um duble que respondesse a mesma coisa para o `select` do espelho e para o `select` do
 * de/para deixaria ramos inteiros inalcancaveis com o arquivo verde.
 */
function bancoQueAnota(rotas: { quando: RegExp; responder: (vez: number) => unknown[] }[]) {
  const instrucoes: Instrucao[] = [];
  const vezes = new Map<RegExp, number>();
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      const rota = rotas.find((r) => r.quando.test(c.sql));
      if (!rota) return Promise.resolve([]);
      const vez = (vezes.get(rota.quando) ?? 0) + 1;
      vezes.set(rota.quando, vez);
      return Promise.resolve(rota.responder(vez));
    },
  };
  return { db: db as never, instrucoes };
}

const texto = (instrucoes: Instrucao[]) => instrucoes.map((i) => i.sql).join("\n;\n");

function digai(db: never): DigaiRepositorio {
  return new DigaiRepositorio(db, catalogoDaRevisao().servico as never, null as never);
}

/** A linha completa do de/para, como o banco a devolve: todas as cinco colunas com valor. */
const linhaDaPlanilha = (over: Record<string, unknown> = {}) => ({
  codigo_externo: NUMERO_DO_PANDAPE,
  nome_cliente: "ALFA SERVICOS LTDA",
  cod_cliente: "CLI-TESTE-1",
  confirmado: false,
  codigo_no_catalogo: "CLI-TESTE-1",
  natureza_planilha: "EFETIVA",
  linha_servico_id_planilha: 3,
  cargo_id_planilha: CARGO_ID,
  data_abertura_planilha: "2026-02-01",
  data_limite_planilha: "2026-03-15",
  ...over,
});

// ── 1. O ESPELHO DA VAGA: OS DOIS RAMOS, E NENHUM TOCA CANDIDATURA ─────────────────────────────

describe("o espelho da vaga do Digai nao emite instrucao sobre candidatura", () => {
  it("no ramo que CRIA a vaga em branco, nenhuma instrucao cita as_candidaturas", async () => {
    const banco = bancoQueAnota([
      { quando: /select id from vagas where id_vacancy_pandape/i, responder: () => [] },
      { quando: /insert\s+into\s+vagas\b/i, responder: () => [{ id: ID_DA_VAGA }] },
    ]);

    const vaga = await digai(banco.db).espelharVaga(NUMERO_DO_PANDAPE);

    expect(vaga.id).toBe(ID_DA_VAGA);
    expect(
      texto(banco.instrucoes),
      "o nascimento da vaga espelhada emitiu instrucao sobre `as_candidaturas`. Sao 223 pessoas " +
        "penduradas nas 13 vagas em branco: o enriquecimento preenche COLUNA DA VAGA, e a " +
        "candidatura e escrita por um caminho proprio, com a sua propria regua.",
    ).not.toMatch(/as_candidaturas/i);
  });

  it("no ramo em que a vaga JA EXISTE, nada e escrito: nem na candidatura, nem na vaga", async () => {
    /*
     * ESTE E O CASO COMUM, e e o que a OST nao pede mas eu quero tranca-lo: o Pandape criou a vaga
     * ANTES, com codigo, nome e cargo, e o Digai so encontra. `espelharVaga` declara que nao
     * sobrescreve ("escrever qualquer coisa ali apagaria o que o Pandape ou uma pessoa colocou"),
     * e o enriquecimento nao pode transformar essa declaracao em mentira.
     */
    const banco = bancoQueAnota([
      {
        quando: /select id from vagas where id_vacancy_pandape/i,
        responder: () => [{ id: ID_DA_VAGA }],
      },
    ]);

    const vaga = await digai(banco.db).espelharVaga(NUMERO_DO_PANDAPE);
    const todas = texto(banco.instrucoes);

    expect(vaga.id).toBe(ID_DA_VAGA);
    expect(todas, "o reuso da vaga existente emitiu instrucao sobre candidatura").not.toMatch(
      /as_candidaturas/i,
    );
    expect(
      banco.instrucoes.filter((i) => /^\s*(update|insert|delete)/i.test(i.sql)),
      "a vaga que JA EXISTE recebeu escrita no caminho do espelho. Quando o Pandape ou uma pessoa " +
        "ja preencheu a vaga, o Digai so encontra e pendura a candidatura: escrever ali apaga " +
        "trabalho conferido. Se o enriquecimento precisar escrever, ele e OUTRO passo, com a " +
        "guarda de nulo na propria instrucao, e nao uma escrita solta dentro do espelho.",
    ).toEqual([]);
  });

  it("o espelho nao emite DELETE nem DDL sobre vaga em nenhum dos ramos", async () => {
    const banco = bancoQueAnota([
      { quando: /select id from vagas where id_vacancy_pandape/i, responder: () => [] },
      { quando: /insert\s+into\s+vagas\b/i, responder: () => [{ id: ID_DA_VAGA }] },
    ]);
    await digai(banco.db).espelharVaga(NUMERO_DO_PANDAPE);

    const todas = texto(banco.instrucoes);
    expect(todas, "ha DELETE no caminho do espelho").not.toMatch(/\bdelete\s+from\b/i);
    expect(todas, "ha DDL no caminho do espelho").not.toMatch(/\b(drop|truncate|alter)\b/i);
  });
});

// ── 2. O ENRIQUECIMENTO PELA PLANILHA: O SERVICO QUE O MAPA MANDA REUSAR ───────────────────────

describe("o enriquecimento pela planilha nao emite instrucao sobre candidatura", () => {
  it("a volta completa (proposta de cliente + pre-preenchimento) nao cita as_candidaturas", async () => {
    const banco = bancoQueAnota([
      {
        quando: /from as_depara_cliente_vaga/i,
        responder: () => [linhaDaPlanilha()],
      },
    ]);

    await new IngestaoDeParaCliente(banco.db).resolverERegistrar(
      ID_DA_VAGA,
      { idVacancy: Number(NUMERO_DO_PANDAPE), reference: null },
      novoResumo(),
    );

    const todas = texto(banco.instrucoes);
    expect(
      todas,
      "o servico de de/para, que o mapa manda REUSAR para enriquecer a vaga do Digai, emitiu " +
        "instrucao sobre `as_candidaturas`",
    ).not.toMatch(/as_candidaturas/i);
    expect(todas, "o enriquecimento pela planilha emitiu DELETE").not.toMatch(/\bdelete\s+from\b/i);
    expect(
      todas,
      "o enriquecimento pela planilha emitiu insert: ele PREENCHE a vaga que existe, nao cria linha",
    ).not.toMatch(/\binsert\s+into\b/i);
  });

  it("as escritas emitidas sao todas UPDATE na tabela vagas, e em nenhuma outra tabela", async () => {
    const banco = bancoQueAnota([
      { quando: /from as_depara_cliente_vaga/i, responder: () => [linhaDaPlanilha()] },
    ]);

    await new IngestaoDeParaCliente(banco.db).resolverERegistrar(
      ID_DA_VAGA,
      { idVacancy: Number(NUMERO_DO_PANDAPE), reference: null },
      novoResumo(),
    );

    const escritas = banco.instrucoes.filter((i) => /^\s*(update|insert|delete)/i.test(i.sql));
    expect(escritas.length, "a volta nao escreveu nada: o cenario deixou de exercitar a escrita").toBeGreaterThan(
      0,
    );
    for (const escrita of escritas) {
      expect(
        escrita.sql,
        `escrita fora da tabela vagas no caminho do enriquecimento: ${escrita.sql.slice(0, 120)}`,
      ).toMatch(/^\s*update\s+"?vagas"?\b/i);
    }
  });
});

// ── 3. O CANARIO DE LISTA FECHADA SOBRE O FONTE ────────────────────────────────────────────────

/** Todo arquivo de PRODUCAO da pasta (sem teste, sem duble), com o nome. */
function fontesDeProducao(pasta: string): { nome: string; conteudo: string }[] {
  const saida: { nome: string; conteudo: string }[] = [];
  const andar = (dir: string, prefixo: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho, `${prefixo}${nome}/`);
        continue;
      }
      if (!nome.endsWith(".ts")) continue;
      if (nome.includes(".spec.") || nome.includes("tester-fake") || nome.includes(".fake.")) continue;
      saida.push({ nome: `${prefixo}${nome}`, conteudo: readFileSync(caminho, "utf8") });
    }
  };
  andar(pasta, "");
  return saida;
}

/**
 * Linha de comentario fora: assercao de forma que le comentario produz vermelho falso, e isso ja
 * aconteceu nesta casa (tres falsos vermelhos numa frente). O que se mede e o codigo que executa.
 */
function semComentario(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("*/");
    })
    .join("\n");
}

/**
 * A LISTA FECHADA, medida em 08/10/2026 contra a pasta: so DOIS arquivos de producao mencionam
 * `as_candidaturas`, e os dois tem motivo (o repositorio escreve a candidatura; o servico de
 * importacao a chama pelo nome do metodo). Arquivo NOVO que mencionar a tabela fica vermelho.
 *
 * E canario, e nao proibicao: se a construcao precisar mencionar a tabela em arquivo novo, o
 * vermelho e o pedido de explicacao, que e exatamente o que se quer com 223 pessoas no caminho.
 */
const PODEM_MENCIONAR_CANDIDATURA: readonly string[] = [
  /* Escreve a candidatura (`garantirCandidatura`): e o escritor legitimo, e e um so. */
  "digai-repositorio.ts",
  /* Chama o escritor pelo nome do metodo: nao monta instrucao. */
  "digai-importacao.service.ts",
];

describe("canario: nenhum arquivo NOVO do Digai passa a mencionar as_candidaturas", () => {
  it("a lista de quem menciona a tabela e a lista fechada medida, sem acrescimo", () => {
    const fontes = fontesDeProducao(__dirname);
    expect(
      fontes.length,
      "a pasta do Digai nao tem fonte de producao: toda assercao de AUSENCIA passaria de graca",
    ).toBeGreaterThan(5);

    const mencionam = fontes
      .filter((f) => /as_candidaturas/i.test(semComentario(f.conteudo)))
      .map((f) => f.nome)
      .sort();
    const novos = mencionam.filter((n) => !PODEM_MENCIONAR_CANDIDATURA.includes(n));

    expect(
      novos,
      "arquivo de producao NOVO passou a mencionar `as_candidaturas` na pasta do Digai. O " +
        "requisito desta frente e preencher COLUNA DA VAGA: cliente, cargo, natureza, datas, nome, " +
        "cidade e posicoes. A candidatura nao entra nisso, e sao 223 pessoas reais penduradas nas " +
        "13 vagas em branco. Se a mencao for legitima, ela entra na lista com o motivo escrito.",
    ).toEqual([]);
  });

  it("nenhum arquivo de producao do Digai emite DELETE ou UPDATE de candidatura por vaga", () => {
    const fontes = fontesDeProducao(__dirname);
    const proibidas: string[] = [];
    for (const f of fontes) {
      const codigo = semComentario(f.conteudo);
      if (/delete\s+from\s+as_candidaturas/i.test(codigo)) proibidas.push(`${f.nome}: delete`);
      /*
       * `update as_candidaturas ... set vaga_id` e o jeito silencioso de 223 pessoas mudarem de
       * vaga: a FK fica satisfeita, nada falha, e o funil de A&S passa a contar outra coisa.
       */
      if (/update\s+as_candidaturas[\s\S]{0,400}?\bvaga_id\s*=/i.test(codigo)) {
        proibidas.push(`${f.nome}: update de vaga_id`);
      }
    }
    expect(
      proibidas,
      "ha instrucao que APAGA candidatura ou a MOVE de vaga no modulo do Digai. A FK RESTRICT nao " +
        "protege contra nenhuma das duas: ela so impede apagar a VAGA.",
    ).toEqual([]);
  });

  it("nenhum arquivo de producao do Digai emite DELETE de vaga nem DDL", () => {
    const fontes = fontesDeProducao(__dirname);
    const achados = fontes
      .filter((f) => /delete\s+from\s+vagas|\b(drop|truncate)\s+table\b/i.test(semComentario(f.conteudo)))
      .map((f) => f.nome);
    expect(
      achados,
      "apagar a vaga em branco seria a saida mais rapida para limpar a fila, e e a mais cara: a " +
        "FK e RESTRICT e as 223 candidaturas ficariam orfas ou o banco recusaria no meio do ciclo",
    ).toEqual([]);
  });
});
