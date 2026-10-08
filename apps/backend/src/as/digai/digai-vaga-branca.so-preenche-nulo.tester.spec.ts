import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { IngestaoDeParaCliente } from "../ingestao-pandape/ingestao-depara-cliente.service";
import { novoResumo } from "../ingestao-pandape/ingestao-ciclo";
import { PROCEDENCIA_DA_PLANILHA } from "../../domain/as-planilha-prepreenchimento";

/**
 * SO PREENCHER O QUE ESTA NULO, E A TRAVA TEM DE MORAR NA INSTRUCAO.
 *
 * Arquivo do `tester` (secao A.38), escrito a partir do REQUISITO, em paralelo a construcao.
 *
 * ┌─ POR QUE A DISTINCAO ENTRE `if` E INSTRUCAO E O CORACAO DESTE ARQUIVO ───────────────────────┐
 * │ Um conserto feito com `if` em TypeScript ("leio a vaga, se o campo esta nulo eu escrevo")     │
 * │ PASSA num teste frouxo e PERDE A CORRIDA na vida real: entre a leitura e a escrita cabe o      │
 * │ salvamento de uma pessoa na tela de revisao, e o enriquecimento apaga o que ela digitou. Pior, │
 * │ `if` se perde numa refatoracao (e o argumento da secao A.33 sobre o fallback removido) e a     │
 * │ instrucao nao.                                                                                 │
 * │                                                                                                │
 * │ O TESTE QUE DISTINGUE OS DOIS NAO E "o resultado foi o certo": com um unico campo nulo os dois │
 * │ desenhos produzem o MESMO desfecho. O que distingue e que o desenho por instrucao NAO LE os    │
 * │ valores atuais da vaga, e o por `if` precisa ler. Entao este arquivo assere as DUAS coisas:    │
 * │  a) `coalesce(coluna, valor)` no `set` e `coluna is null` no `where`, compilados;              │
 * │  b) ZERO leitura dos valores atuais da vaga na volta inteira.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Secao A.6: dado sintetico. Numeros de vaga da faixa medida (os cinco orfaos de producao, que sao
 * numero de vaga, nao dado pessoal), cliente `CLI-TESTE-n`, cargo em UUID inventado.
 */

const dialeto = new PgDialect();
const VAGA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NUMERO = 3500236;
const CARGO_ID = "99999999-9999-4999-8999-999999999999";

interface Instrucao {
  sql: string;
  params: unknown[];
}

/**
 * O banco que ANOTA e responde por ROTA.
 *
 * A LENTE: nenhum duble responde igual para consultas diferentes. A rota do de/para tem padrao
 * proprio; um `select` de vagas (que o desenho por `if` precisaria fazer) NAO casa com rota nenhuma,
 * devolve vazio e, acima de tudo, FICA ANOTADO. E essa anotacao que o teste da alinea (b) le.
 */
function bancoQueAnota(rotas: { quando: RegExp; responder: () => unknown[] }[]) {
  const instrucoes: Instrucao[] = [];
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      const rota = rotas.find((r) => r.quando.test(c.sql));
      return Promise.resolve(rota ? rota.responder() : []);
    },
  };
  return { db: db as never, instrucoes };
}

const linha = (over: Record<string, unknown> = {}) => ({
  codigo_externo: String(NUMERO),
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

async function voltaDaPlanilha(respostaDoDePara: () => unknown[]) {
  const banco = bancoQueAnota([{ quando: /from as_depara_cliente_vaga/i, responder: respostaDoDePara }]);
  await new IngestaoDeParaCliente(banco.db).resolverERegistrar(
    VAGA_ID,
    { idVacancy: NUMERO, reference: null },
    novoResumo(),
  );
  return banco.instrucoes;
}

const updates = (i: Instrucao[]) => i.filter((x) => /^\s*update/i.test(x.sql));
/** O `update` do pre-preenchimento, distinguido pela coluna que so ele escreve. */
const oDoPrePreenchimento = (i: Instrucao[]) => updates(i).find((x) => /natureza_origem/.test(x.sql));
const setDo = (sqlTexto: string) => /\bset\b([\s\S]*?)\bwhere\b/i.exec(sqlTexto)?.[1] ?? "";
/**
 * O `where` DE CIMA, e nao o ultimo.
 *
 * Achado meu, na primeira rodada deste arquivo: `lastIndexOf("where")` pegava o `where` da
 * subconsulta do catalogo de status, entao a assercao do escopo lia um pedaco que nao tem
 * `recusada_em` e ficava vermelha sobre codigo CORRETO. Falso vermelho de recorte, exatamente o
 * modo de falha que esta casa ja pagou tres vezes numa frente.
 */
const whereDo = (sqlTexto: string) => {
  const i = /\bwhere\b/i.exec(sqlTexto)?.index ?? 0;
  return sqlTexto.slice(i);
};

/** As cinco colunas que a PLANILHA preenche, as do requisito (cliente, cargo, natureza, datas). */
const COLUNAS_DA_PLANILHA = [
  "natureza",
  "linha_servico_id",
  "cargo_id",
  "data_abertura",
  "data_limite",
] as const;

// ── 1. A TRAVA ESTA NA INSTRUCAO, COLUNA POR COLUNA ───────────────────────────────────────────

describe("o enriquecimento pela planilha trava o nao-nulo na propria instrucao", () => {
  it("cada coluna tem coalesce no set e a condicao de nulo no where", async () => {
    const instrucoes = await voltaDaPlanilha(() => [linha()]);
    const pre = oDoPrePreenchimento(instrucoes);
    expect(
      pre,
      "a volta nao emitiu o `update` do pre-preenchimento com a linha completa da planilha: o " +
        "enriquecimento pela planilha nao esta acontecendo",
    ).toBeTruthy();

    const set = setDo(pre!.sql);
    const where = whereDo(pre!.sql);
    for (const coluna of COLUNAS_DA_PLANILHA) {
      expect(
        set,
        `a coluna '${coluna}' e escrita sem \`coalesce\`: valor que uma pessoa digitou na tela de ` +
          `revisao seria sobrescrito pela planilha`,
      ).toMatch(new RegExp(`${coluna}\\s*=\\s*coalesce\\(`, "i"));
      expect(
        where,
        `o \`where\` nao exige '${coluna} is null': a instrucao escreveria em vaga que ja tem o campo`,
      ).toMatch(new RegExp(`${coluna}\\s+is\\s+null`, "i"));
    }
  });

  it("a procedencia e carimbada no MESMO case da condicao de nulo, nunca solta", async () => {
    const instrucoes = await voltaDaPlanilha(() => [linha()]);
    const pre = oDoPrePreenchimento(instrucoes)!;
    const set = setDo(pre.sql);

    /*
     * O NOME DA COLUNA DE PROCEDENCIA NAO E O DA COLUNA MAIS `_origem`, e descobri isso na primeira
     * rodada: `linha_servico_id` carimba em `linha_servico_origem`. Derivar o nome por concatenacao
     * dava vermelho sobre codigo correto, entao o par e explicito.
     */
    const PARES: readonly [string, string][] = [
      ["natureza", "natureza_origem"],
      ["linha_servico_id", "linha_servico_origem"],
      ["cargo_id", "cargo_origem"],
      ["data_abertura", "data_abertura_origem"],
      ["data_limite", "data_limite_origem"],
    ];
    for (const [coluna, procedencia] of PARES) {
      /*
       * Carimbar a procedencia FORA da condicao faria a coluna de origem afirmar "veio da planilha"
       * sobre um valor DIGITADO, que e pior do que nao carimbar: a trilha passaria a mentir.
       */
      expect(
        set,
        `a procedencia de '${coluna}' nao esta presa a condicao de nulo daquela coluna`,
      ).toMatch(new RegExp(`${procedencia}\\s*=\\s*case\\s+when\\s+${coluna}\\s+is\\s+null`, "i"));
    }
    expect(
      pre.params,
      "a procedencia gravada nao e a da planilha",
    ).toContain(PROCEDENCIA_DA_PLANILHA);
  });

  it("A DISTINCAO QUE IMPORTA: a volta NAO LE os valores atuais da vaga", async () => {
    /*
     * ESTE E O `expect` QUE UM CONSERTO POR `if` NAO PASSA. Com um unico campo nulo, o desfecho dos
     * dois desenhos e identico, e um teste de resultado ficaria verde sobre a corrida perdida. O
     * desenho por instrucao nao precisa saber o que ha na vaga: ele manda a condicao junto.
     */
    const instrucoes = await voltaDaPlanilha(() => [linha()]);
    const leiturasDaVaga = instrucoes.filter(
      (i) => /^\s*select/i.test(i.sql) && /\bfrom\s+"?vagas"?\b/i.test(i.sql),
    );
    expect(
      leiturasDaVaga.map((l) => l.sql),
      "a volta LEU a vaga antes de escrever, e isso e a assinatura do conserto por `if`. Entre a " +
        "leitura e a escrita cabe o salvamento de uma pessoa na tela de revisao, e o " +
        "enriquecimento apagaria o que ela digitou sem nada falhar.",
    ).toEqual([]);
  });

  it("a instrucao do pre-preenchimento nao toca status, papel nem atualizado_em", async () => {
    const instrucoes = await voltaDaPlanilha(() => [linha()]);
    const set = setDo(oDoPrePreenchimento(instrucoes)!.sql);

    expect(set, "pre-preencher NAO e liberar: o `set` mexeu em status").not.toMatch(/\bstatus\s*=/i);
    expect(set, "o `set` mexeu em status_manual_em").not.toMatch(/status_manual_em\s*=/i);
    expect(set, "o `set` mexeu em encerrada_em").not.toMatch(/encerrada_em\s*=/i);
    expect(set, "o `set` mexeu em recusada_em").not.toMatch(/recusada_em\s*=/i);
    expect(
      set,
      "o `set` empurrou `atualizado_em`: a varredura da uma volta a cada 30 minutos, e isso e " +
        "escrita sem necessidade 48 vezes por dia",
    ).not.toMatch(/atualizado_em\s*=/i);
    expect(
      set,
      "o `set` escreveu `cod_cliente`: o cliente definitivo e gesto humano na liberacao, e a " +
        "planilha so PROPOE",
    ).not.toMatch(/cod_cliente\s*=/i);
  });

  it("o escopo esta no where: vaga recusada e intocavel, e so papel REVISAO recebe escrita", async () => {
    const instrucoes = await voltaDaPlanilha(() => [linha()]);
    const where = whereDo(oDoPrePreenchimento(instrucoes)!.sql);

    expect(where, "a vaga RECUSADA voltaria a receber escrita de 30 em 30 minutos").toMatch(
      /recusada_em\s+is\s+null/i,
    );
    expect(
      where,
      "vaga JA LIBERADA com campo nulo receberia escrita, fora do requisito e sem a trilha de edicao",
    ).toMatch(/papel\s*=\s*\$\d|as_vaga_status/i);
  });
});

// ── 2. A ABSTENCAO: SEM VALOR, SEM LEITURA, SEM ESCRITA ───────────────────────────────────────

describe("o enriquecimento pela planilha se abstem no lugar de escrever lixo", () => {
  it("planilha sem nenhum dos cinco campos: zero escrita de pre-preenchimento", async () => {
    const instrucoes = await voltaDaPlanilha(() => [
      linha({
        natureza_planilha: null,
        linha_servico_id_planilha: null,
        cargo_id_planilha: null,
        data_abertura_planilha: null,
        data_limite_planilha: null,
      }),
    ]);
    expect(
      oDoPrePreenchimento(instrucoes),
      "a volta emitiu `update` de pre-preenchimento sem ter valor nenhum a oferecer: escrita " +
        "vazia de 30 em 30 minutos sobre 470 vagas",
    ).toBeUndefined();
  });

  it("a planilha nao tem linha para o numero: nenhuma coluna de pre-preenchimento e tocada", async () => {
    /*
     * SAO CINCO DAS TREZE ASSIM (`3498580`, `3500236`, `3517382`, `3586617`, `3696629`): orfas nas
     * duas fontes. O caminho tem de seguir sem erro, sem escrita e sem inventar valor.
     */
    const instrucoes = await voltaDaPlanilha(() => []);
    expect(oDoPrePreenchimento(instrucoes), "vaga sem linha na planilha recebeu pre-preenchimento").toBeUndefined();
    const escritas = updates(instrucoes).map((u) => u.sql);
    for (const sqlTexto of escritas) {
      expect(
        sqlTexto,
        "a vaga orfa recebeu escrita de campo. A unica escrita legitima nesse caso e LIMPAR a " +
          "proposta de cliente, que e outra coluna e tem motivo proprio.",
      ).not.toMatch(/\bnatureza\s*=|\bcargo_id\s*=|\bdata_abertura\s*=/i);
    }
  });

  it("a leitura do de/para falhou: zero escrita, e a proposta de ontem fica intacta", async () => {
    const banco = bancoQueAnota([
      {
        quando: /from as_depara_cliente_vaga/i,
        responder: () => {
          throw Object.assign(new Error("conexao caiu"), { code: "08006" });
        },
      },
    ]);
    await expect(
      new IngestaoDeParaCliente(banco.db).resolverERegistrar(
        VAGA_ID,
        { idVacancy: NUMERO, reference: null },
        novoResumo(),
      ),
      "a falha de leitura da planilha derrubou a volta. Dado de planilha nao pode custar INGESTAO.",
    ).resolves.toBeUndefined();
    expect(
      updates(banco.instrucoes),
      "a leitura falhou e a volta escreveu de todo jeito: 'o banco nao respondeu' virou 'a " +
        "planilha nao tem esta vaga', que sao coisas diferentes",
    ).toEqual([]);
  });
});

// ── 3. IDEMPOTENCIA: O MESMO NUMERO DUAS VEZES NO MESMO CICLO ─────────────────────────────────

describe("duas candidaturas da mesma vaga no mesmo ciclo nao escrevem duas coisas diferentes", () => {
  it("as duas voltas emitem a MESMA instrucao guardada, e a segunda nao escreve nada novo", async () => {
    /*
     * CASO QUE O REQUISITO NAO COBRE, e e o mais comum das 13: a vaga `3703137` teve varias
     * candidaturas na mesma janela. Se o enriquecimento nao for idempotente, a segunda volta
     * reescreve o que a primeira acabou de gravar, ou pior, carimba a procedencia de novo.
     *
     * A prova e que a instrucao e IDENTICA e GUARDADA: no banco de verdade, a segunda nao casa o
     * `where` (as colunas deixaram de ser nulas) e afeta ZERO linha. A idempotencia aqui e
     * propriedade da instrucao, nao de um contador no servico.
     */
    const primeira = await voltaDaPlanilha(() => [linha()]);
    const segunda = await voltaDaPlanilha(() => [linha()]);

    const a = oDoPrePreenchimento(primeira)!;
    const b = oDoPrePreenchimento(segunda)!;
    expect(b.sql, "a segunda volta emitiu instrucao DIFERENTE da primeira").toBe(a.sql);
    expect(b.params, "a segunda volta mandou parametros diferentes").toEqual(a.params);
    expect(
      whereDo(b.sql),
      "a segunda instrucao nao e guardada por nulo: ela reescreveria o que a primeira gravou",
    ).toMatch(/is\s+null/i);
  });
});

// ── 4. CANARIO: TODA ESCRITA NOVA EM `vagas` DENTRO DO DIGAI NASCE GUARDADA ───────────────────

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

function semComentario(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("*/");
    })
    .join("\n");
}

/** Os blocos `update vagas ... ` de cada arquivo de producao da pasta (recorte cru, por texto). */
function updatesDeVaga(conteudo: string): string[] {
  const blocos: string[] = [];
  const re = /update\s+vagas\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conteudo)) !== null) {
    blocos.push(conteudo.slice(m.index, m.index + 2000));
  }
  return blocos;
}

describe("canario: escrita nova de campo de vaga dentro do Digai nasce guardada por nulo", () => {
  it("todo `update vagas` do modulo tem coalesce no set e condicao de nulo no where", () => {
    /*
     * CANARIO, e por isso a contagem e reportada: hoje o modulo do Digai tem ZERO `update vagas`,
     * porque o enriquecimento pela planilha vive no servico de de/para que ele REUSA. No dia em que
     * a construcao escrever a parte do Pandape (nome da vaga, cidade, posicoes) dentro desta pasta,
     * esta assercao passa a cobrar a MESMA regua das outras cinco colunas, sem ninguem lembrar.
     *
     * Vacuamente verde hoje e DECLARADO: a contagem abaixo e a medida, e ela aparece na falha.
     */
    const fontes = fontesDeProducao(__dirname);
    expect(fontes.length, "nao ha fonte de producao na pasta: a varredura seria sobre o vazio").toBeGreaterThan(5);

    const frouxos: string[] = [];
    for (const f of fontes) {
      for (const bloco of updatesDeVaga(semComentario(f.conteudo))) {
        const temCoalesce = /coalesce\s*\(/i.test(bloco);
        const temGuarda = /is\s+null/i.test(bloco);
        if (!temCoalesce || !temGuarda) {
          frouxos.push(`${f.nome}: coalesce=${temCoalesce} guardaDeNulo=${temGuarda}`);
        }
      }
    }
    expect(
      frouxos,
      "ha `update vagas` no modulo do Digai sem `coalesce` no set ou sem condicao de nulo no " +
        "where. O requisito e SO PREENCHER O QUE ESTA NULO, e a trava tem de morar na instrucao: " +
        "um `if` antes passa num teste de resultado e perde a corrida contra quem esta digitando " +
        "na tela de revisao.",
    ).toEqual([]);
  });
});
