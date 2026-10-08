import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DigaiVagaRastreioService,
  JANELA_DO_RASTREIO_MS,
  type VagaDaListaDoPandape,
} from "./digai-vaga-rastreio.service";

/**
 * O RASTREIO DA VAGA EM BRANCO, MEDIDO EM CHAMADAS DE REDE E EM INSTRUCOES DE ESCRITA.
 *
 * Arquivo do `tester` (secao A.38), escrito a partir do REQUISITO e em paralelo a construcao
 * (secao A.40, regra 2). Nao conserta codigo de producao: assere e devolve os gaps.
 *
 * ┌─ AS TRES PERGUNTAS QUE ESTE ARQUIVO FAZ, E POR QUE NENHUMA DELAS E "O CAMPO DE CACHE EXISTE?" ┐
 * │ 1. QUANTAS CHAMADAS DE REDE as 13 vagas de um ciclo custam? A v1 do Pandape nao tem busca por  │
 * │    id: cada listagem sao 6.944 vagas e 9,8 MB (medido 08/10/2026), numa cota de 1.000          │
 * │    requisicoes por 5 minutos COMPARTILHADA com o webhook que alimenta a folha. Contar o campo   │
 * │    de cache responderia "existe"; contar as chamadas responde "serve".                          │
 * │ 2. O QUE VAI PARA A INSTRUCAO quando o ATS manda vazio, zero, espaco ou nada? Escrever `''` em  │
 * │    `nome_divulgacao` e pior do que nao escrever: a coluna deixa de ser nula, a guarda de nulo    │
 * │    nunca mais casa, e a vaga fica com nome vazio PARA SEMPRE, sem nada vermelho.                │
 * │ 3. O QUE ACONTECE COM O QUE JA ESTAVA GRAVADO? A frente existe para PREENCHER vaga em branco,   │
 * │    nao para reescrever vaga que uma pessoa ja arrumou.                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA CHAMADA REAL AO PANDAPE SAI DAQUI: o cliente da API e um duble que CONTA.
 *
 * Secao A.6: tudo sintetico. Numero de vaga, titulo de vaga e cidade nao sao dado pessoal, e nenhum
 * CPF, nome de pessoa, e-mail ou telefone entra neste arquivo.
 */

const dialeto = new PgDialect();
const VAGA_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Os treze numeros medidos em producao em 08/10/2026 (numero de vaga, nao dado de pessoa). */
const AS_TREZE = [
  "3481741",
  "3498580",
  "3500236",
  "3517382",
  "3586617",
  "3696629",
  "3703137",
  "3421670",
  "3610001",
  "3610002",
  "3610003",
  "3610004",
  "3610005",
];

interface Instrucao {
  sql: string;
  params: unknown[];
}

/**
 * A BANCADA: banco que anota, cliente do Pandape que conta, planilha que registra as chamadas.
 *
 * A LENTE "ALGUM DUBLE RESPONDE IGUAL PARA CONSULTAS DIFERENTES?" aplicada aqui:
 *  - o banco responde por ROTA (catalogo de cidade x `update` de vaga). Uma resposta unica faria o
 *    `returning id` do update e o `select id` da cidade se confundirem, e o teste do log ficaria
 *    verde por acidente;
 *  - a planilha e um duble SEPARADO do Pandape, e nao um mesmo objeto servindo as duas fontes. Um
 *    duble compartilhado nao distinguiria "a planilha nao tinha linha" de "o ATS nao tinha a vaga",
 *    que sao os dois ramos que as 13 vagas percorrem (1 so planilha, 1 so Pandape, 6 nas duas,
 *    5 em nenhuma).
 */
function bancada(opcoes: {
  lista?: VagaDaListaDoPandape[] | (() => VagaDaListaDoPandape[]);
  listaLanca?: boolean;
  cidade?: { id: number }[];
  cidadeLanca?: boolean;
  updateLanca?: boolean;
  updateDevolve?: { id: string }[];
  planilhaLanca?: boolean;
} = {}) {
  const instrucoes: Instrucao[] = [];
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      if (/from as_cidades/i.test(c.sql)) {
        if (opcoes.cidadeLanca) throw new Error("catalogo de cidade fora do ar");
        return Promise.resolve(opcoes.cidade ?? [{ id: 3550308 }]);
      }
      if (/^\s*update/i.test(c.sql)) {
        if (opcoes.updateLanca) throw Object.assign(new Error("check violado"), { code: "23514" });
        return Promise.resolve(opcoes.updateDevolve ?? [{ id: VAGA_ID }]);
      }
      return Promise.resolve([]);
    },
  };
  const listarVagas = vi.fn(async () => {
    if (opcoes.listaLanca) throw new Error("rede caiu");
    const l = opcoes.lista ?? LISTA_PADRAO;
    return (typeof l === "function" ? l() : l) as never;
  });
  const resolverERegistrar = vi.fn(async () => {
    if (opcoes.planilhaLanca) throw new Error("a planilha passou a lancar");
  });
  const servico = new DigaiVagaRastreioService(
    db as never,
    { listarVagas } as never,
    { resolverERegistrar } as never,
  );
  return {
    servico,
    instrucoes,
    listarVagas,
    resolverERegistrar,
    updates: () => instrucoes.filter((i) => /^\s*update/i.test(i.sql)),
    doRastreio: () => instrucoes.find((i) => /nome_divulgacao/.test(i.sql)),
  };
}

/** As cinco ORFAS das duas fontes: elas NAO estao na lista do ATS, e e isso que as define. */
const AS_ORFAS = ["3498580", "3500236", "3517382", "3586617", "3696629"] as const;

/**
 * A LISTA DO ATS ESPELHA A COBERTURA MEDIDA, e nao "todas as 13".
 *
 * Achado meu, na primeira rodada: eu havia montado a lista com os oito primeiros numeros das 13, o
 * que colocou `3498580` DENTRO da lista do ATS. O teste da vaga ausente ficou vermelho sobre codigo
 * correto, porque a vaga que o cenario chamava de ausente estava presente no proprio duble. Duble
 * que nao respeita a medida testa outra coisa.
 */
const LISTA_PADRAO: VagaDaListaDoPandape[] = [
  /* So o PANDAPE conhece (1 das 13). */
  { idVacancy: 3703137, job: "AUXILIAR DE LIMPEZA LOJA CENTRO", city: "Sao Paulo - SP", numberVacancies: 2, status: 3 },
  /* As que as DUAS fontes conhecem (6 das 13). */
  { idVacancy: 3421670, job: "ESCOLA DE ELETRICISTAS TAUBATE", city: "Taubate - SP", numberVacancies: 1, status: 2 },
  ...["3610001", "3610002", "3610003", "3610004", "3610005"].map((n, i) => ({
    idVacancy: n,
    job: `VAGA SINTETICA ${i}`,
    city: "Sao Paulo - SP",
    numberVacancies: 1,
    status: 3,
  })),
  /* `3481741` (so a planilha) e as cinco de AS_ORFAS NAO entram: e a medida da cobertura. */
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── 1. CONTAR AS CHAMADAS: O CAMINHO BOM ──────────────────────────────────────────────────────

describe("as 13 vagas de um ciclo custam UMA listagem do Pandape", () => {
  it("treze vagas em sequencia: uma chamada", async () => {
    const b = bancada();
    for (const numero of AS_TREZE) await b.servico.enriquecer(VAGA_ID, numero);

    expect(
      b.listarVagas.mock.calls.length,
      "cada chamada e uma listagem de 6.944 vagas e 9,8 MB, numa cota compartilhada com o webhook " +
        "que alimenta a folha. Treze chamadas sao 128 MB por ciclo.",
    ).toBe(1);
  });

  it("treze vagas CHEGANDO JUNTAS: ainda uma chamada", async () => {
    /*
     * Sem promessa compartilhada, o cache "de uma chamada" faz uma chamada POR VOLTA CONCORRENTE na
     * primeira vaga da janela: as 13 entram antes de qualquer uma guardar o resultado, e as 13
     * listam. E o modo de falha que nenhum teste sequencial enxerga.
     */
    const b = bancada();
    await Promise.all(AS_TREZE.map((n) => b.servico.enriquecer(VAGA_ID, n)));

    expect(b.listarVagas.mock.calls.length, "a listagem nao e compartilhada entre voltas simultaneas").toBe(1);
  });

  it("a janela VENCE e o ciclo seguinte le o ATS de novo", async () => {
    /*
     * O cache nao pode ser eterno: as 7 vagas alcancaveis estao em status 3, e status de vaga MUDA
     * no ATS. Cache de processo serviria "ativa" sobre vaga encerrada para sempre.
     */
    vi.useFakeTimers();
    const b = bancada();
    await b.servico.enriquecer(VAGA_ID, "3703137");
    vi.setSystemTime(Date.now() + JANELA_DO_RASTREIO_MS + 1000);
    await b.servico.enriquecer(VAGA_ID, "3703137");

    expect(b.listarVagas.mock.calls.length, "a janela do cache nao expira: o status do ATS congela").toBe(2);
  });
});

// ── 2. CONTAR AS CHAMADAS: O CAMINHO DA FALHA, QUE E ONDE A COTA QUEIMA ───────────────────────

describe("a lista que NAO veio nao pode virar uma chamada por vaga", () => {
  it("a listagem LANCOU: as 13 vagas da volta nao repetem a chamada", async () => {
    /*
     * ESTE E O RAMO QUE SO APARECE CONTANDO. A guarda da janela e gravada DEPOIS de uma leitura bem
     * sucedida; quando a leitura falha, nao ha janela, entao cada vaga seguinte tenta de novo. Em
     * regime normal isso e invisivel (uma chamada, tudo certo). No dia em que o Pandape devolver 429
     * da COTA, o rastreio responde com 13 tentativas no mesmo ciclo, cada uma pedindo 9,8 MB, dentro
     * da cota que o webhook da folha divide com a gente: o remedio aumenta a dose do veneno.
     *
     * O requisito escrito e "N vagas no mesmo ciclo tem de fazer UMA chamada", sem ressalva para o
     * caminho de falha, e e no caminho de falha que a chamada custa caro.
     */
    const b = bancada({ listaLanca: true });
    for (const numero of AS_TREZE) await b.servico.enriquecer(VAGA_ID, numero);

    expect(
      b.listarVagas.mock.calls.length,
      "a falha de leitura nao abre janela, entao as 13 vagas da volta tentaram listar de novo, uma " +
        "por uma. E o oposto do que a protecao de cota existe para fazer: justamente quando o ATS " +
        "esta recusando, o EA multiplica o pedido por 13.",
    ).toBe(1);
  });

  it("a listagem veio VAZIA (integracao inerte ou falha engolida no cliente): uma chamada por volta", async () => {
    /*
     * `listarVagas` devolve `[]` tanto na integracao INERTE (sem credencial) quanto numa falha que o
     * cliente engoliu (HTTP 500, timeout, rede). O rastreio trata o vazio como "nao li", o que esta
     * CERTO (o ATS tem 6.944 vagas, zero nunca e a verdade dele), mas tambem nao registra janela:
     * entao o mesmo contador sobe por vaga. Na homologacao, onde a integracao e inerte, o efeito e
     * so ruido; em producao com o cliente engolindo um 500, sao 13 requisicoes de 9,8 MB por ciclo.
     */
    const b = bancada({ lista: [] });
    for (const numero of AS_TREZE) await b.servico.enriquecer(VAGA_ID, numero);

    expect(
      b.listarVagas.mock.calls.length,
      "lista vazia nao abre janela e cada vaga tenta de novo. Vale a mesma observacao do ramo que " +
        "lanca: o preco e pago exatamente quando o ATS esta ruim.",
    ).toBe(1);
  });

  it("a foto da janela anterior sobrevive a uma leitura que falhou", async () => {
    let lancar = false;
    const b = bancada({
      lista: () => {
        if (lancar) throw new Error("rede caiu");
        return LISTA_PADRAO;
      },
    });
    await b.servico.enriquecer(VAGA_ID, "3703137");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + JANELA_DO_RASTREIO_MS + 1000);
    lancar = true;
    const antes = b.updates().length;
    await b.servico.enriquecer(VAGA_ID, "3703137");

    expect(
      b.updates().length,
      "a leitura falhou e o rastreio DESCARTOU a foto anterior: lista velha vale mais que lista " +
        "nenhuma, porque titulo de vaga nao muda a cada 15 minutos",
    ).toBeGreaterThan(antes);
  });
});

// ── 3. O QUE VAI PARA A INSTRUCAO: VAZIO, ESPACO E ZERO SAO AUSENCIA ──────────────────────────

describe("o ATS manda lixo e a instrucao nao o grava", () => {
  it("`job` vazio e `job` so com espaco viram AUSENCIA, nunca nome vazio na tela", async () => {
    for (const job of ["", "   ", "\t\n "]) {
      const b = bancada({ lista: [{ idVacancy: 900100, job, city: "Sao Paulo - SP", numberVacancies: 1, status: 3 }] });
      await b.servico.enriquecer(VAGA_ID, "900100");
      const instrucao = b.doRastreio();
      expect(instrucao, "o rastreio nao emitiu instrucao nenhuma para a vaga da lista").toBeTruthy();
      expect(
        instrucao!.params,
        `\`job\` igual a ${JSON.stringify(job)} foi gravado como texto. Escrever vazio em ` +
          "`nome_divulgacao` tira a coluna do estado NULO, e a guarda `nome_divulgacao is null` " +
          "nunca mais casa: a vaga fica com nome vazio PARA SEMPRE, e a linha fantasma que a frente " +
          "existe para consertar passa a ser permanente.",
      ).not.toContain(job);
      expect(instrucao!.params, "o titulo deveria viajar como nulo").toContain(null);
    }
  });

  it("`job` com espaco em volta e aparado, e nao gravado com a borda", async () => {
    const b = bancada({
      lista: [{ idVacancy: 900101, job: "  AUXILIAR DE LIMPEZA  ", city: "Sao Paulo - SP", status: 3 }],
    });
    await b.servico.enriquecer(VAGA_ID, "900101");
    expect(b.doRastreio()!.params).toContain("AUXILIAR DE LIMPEZA");
  });

  it("`numberVacancies` zero, negativo, vazio ou ausente nao vira posicao", async () => {
    /*
     * Gravar ZERO posicao e pior do que nao gravar: a coluna alimenta a conta de quanto ainda cabe
     * na vaga, e zero diz "nao cabe mais ninguem" sobre uma vaga que acabou de receber candidato. O
     * CHECK do banco (`posicoes_oficiais > 0`) recusaria, e o `catch` engoliria a instrucao INTEIRA,
     * levando embora titulo, cidade e status de carona.
     */
    for (const valor of [0, -3, "", "  ", undefined, null, "abc"]) {
      const b = bancada({
        lista: [
          {
            idVacancy: 900102,
            job: "VAGA DO TESTE",
            city: "Sao Paulo - SP",
            numberVacancies: valor as never,
            status: 3,
          },
        ],
      });
      await b.servico.enriquecer(VAGA_ID, "900102");
      const params = b.doRastreio()!.params;
      for (const proibido of [0, -3, "0", "abc", "", "  "]) {
        expect(
          params,
          `\`numberVacancies\` igual a ${JSON.stringify(valor)} chegou na instrucao como ` +
            `${JSON.stringify(proibido)}`,
        ).not.toContain(proibido);
      }
    }
  });

  it("`numberVacancies` em TEXTO (a API mistura as duas formas) e aceito como numero", async () => {
    const b = bancada({
      lista: [{ idVacancy: 900103, job: "VAGA DO TESTE", city: "Sao Paulo - SP", numberVacancies: "4", status: 3 }],
    });
    await b.servico.enriquecer(VAGA_ID, "900103");
    expect(b.doRastreio()!.params, "o texto '4' nao virou o inteiro 4").toContain(4);
  });

  it("cidade que o catalogo do IBGE nao tem fica NULA, e nao aproximada", async () => {
    const b = bancada({
      lista: [{ idVacancy: 900104, job: "VAGA DO TESTE", city: "Cidade Que Nao Existe - ZZ", status: 3 }],
      cidade: [],
    });
    await b.servico.enriquecer(VAGA_ID, "900104");
    const instrucao = b.doRastreio()!;
    expect(
      instrucao.params.filter((p) => p === null).length,
      "cidade que nao casou precisa viajar como nula: ela alimenta filtro e contagem regional, e " +
        "cidade errada mente melhor do que cidade vazia",
    ).toBeGreaterThan(0);
  });
});

// ── 4. O STATUS DO ATS: O QUE CHEGA A TELA E O QUE VEIO DO PANDAPE ───────────────────────────

describe("o status da vaga no ATS", () => {
  it("3 (ENCERRADA) chega cru na instrucao, sem traducao e sem default", async () => {
    const b = bancada({ lista: [{ idVacancy: 3703137, job: "VAGA", city: "Sao Paulo - SP", status: 3 }] });
    await b.servico.enriquecer(VAGA_ID, "3703137");

    expect(
      b.doRastreio()!.params,
      "o 3 nao chegou na instrucao. As 7 vagas alcancaveis das 13 estao TODAS em 3: se o valor nao " +
        "chega, a tela nunca diz que ha candidatura pendurada em vaga encerrada.",
    ).toContain(3);
  });

  it("status em TEXTO vira o mesmo numero, porque a API manda das duas formas", async () => {
    const b = bancada({ lista: [{ idVacancy: 900105, job: "VAGA", city: "Sao Paulo - SP", status: "2" }] });
    await b.servico.enriquecer(VAGA_ID, "900105");
    expect(b.doRastreio()!.params).toContain(2);
  });

  it("o status e o unico campo ATUALIZADO, e os outros tres sao guardados por nulo", async () => {
    /*
     * ┌─ A ORDEM DOS ARGUMENTOS DO `coalesce` E O QUE SEPARA CONGELAR DE ATUALIZAR ────────────────┐
     * │ Esta assertiva exigia atribuicao CRUA (`status_pandape = $n`) para provar "atualizavel", e  │
     * │ com isso ela CONTRADIZIA a assertiva do GAP logo abaixo, que exige o nulo protegido: nenhuma │
     * │ implementacao satisfazia as duas, e o `case when` reprovava nas duas. O defeito era meu, e   │
     * │ nao do codigo: eu havia confundido "atualizavel" com "atribuicao sem funcao em volta".       │
     * │                                                                                             │
     * │ A PROPRIEDADE REAL E A ORDEM:                                                                │
     * │   . `coluna = coalesce(COLUNA, novo)` e CONGELAR: tendo valor, ela recebe a si mesma, e o    │
     * │     que uma pessoa digitou nunca e reescrito. E a regra das tres colunas digitaveis.          │
     * │   . `coluna = coalesce(NOVO, coluna)` e ATUALIZAR protegendo a ausencia: valor novo vence     │
     * │     sempre, e o nulo ("o ATS nao disse") cai para o que ja estava. E a regra do espelho.      │
     * │ Medir a ordem mede a semantica, e nao a sintaxe, entao as duas assertivas passam a poder ser │
     * │ verdadeiras ao mesmo tempo, que e o que o codigo faz.                                        │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const b = bancada();
    await b.servico.enriquecer(VAGA_ID, "3703137");
    const sqlTexto = b.doRastreio()!.sql;
    const set = /\bset\b([\s\S]*?)\bwhere\b/i.exec(sqlTexto)?.[1] ?? "";

    for (const coluna of ["nome_divulgacao", "cidade_id", "posicoes_oficiais"]) {
      expect(
        set,
        `'${coluna}' nao e \`coalesce(${coluna}, novo)\`: com o valor novo em primeiro lugar, o ` +
          "que o Pandape ou uma pessoa ja colocou seria sobrescrito pelo ATS a cada volta",
      ).toMatch(new RegExp(`${coluna}\\s*=\\s*coalesce\\(\\s*${coluna}\\s*,`, "i"));
    }
    expect(
      set,
      "o espelho do ATS precisa ser ATUALIZAVEL, com o valor NOVO em primeiro lugar no `coalesce`. " +
        "Escrito como as outras tres (`coalesce(status_pandape, novo)`), ele congelaria no primeiro " +
        "valor lido e a tela afirmaria 'ativa' sobre vaga que o ATS encerrou depois, que e a " +
        "pergunta que a coluna existe para responder.",
    ).toMatch(/status_pandape\s*=\s*coalesce\(\s*\$\d+(::\w+)?\s*,\s*status_pandape\s*\)/i);

    /*
     * E A INTENCAO QUE SOBRA DA REDACAO ANTIGA: nenhum OUTRO campo entra neste `set`. A instrucao
     * escreve QUATRO colunas e mais nenhuma; qualquer acrescimo passa a escrever campo de vaga pelo
     * caminho automatico, sem a trilha de edicao que o caminho humano tem.
     */
    /*
     * OS COMENTARIOS SAEM ANTES DA CONTAGEM, e isso nao e cosmetico: a quarta atribuicao vem depois
     * de uma linha `--`, entao a virgula que a separa da anterior fica do outro lado do comentario e
     * o recorte nao a enxergava. Deu 3 de 4 sobre codigo correto, que e o mesmo falso vermelho de
     * varredura de fonte que esta casa ja pagou.
     */
    const setSemComentario = set.replace(/--[^\n]*/g, "");
    const atribuicoes = (setSemComentario.match(/(?:^|,)\s*([a-z_]+)\s*=/gi) ?? []).map((a) =>
      a.replace(/[^a-z_]/gi, ""),
    );
    expect(
      [...atribuicoes].sort(),
      `o \`set\` do rastreio escreve ${atribuicoes.length} colunas. Sao quatro, e so quatro: ` +
        "titulo, cidade, posicoes e o espelho do status do ATS.",
    ).toEqual(["cidade_id", "nome_divulgacao", "posicoes_oficiais", "status_pandape"]);
  });

  it("GAP: status AUSENTE na lista nao deveria apagar o espelho ja gravado", async () => {
    /*
     * ┌─ ACHADO DO `tester`, E E UMA DECISAO QUE FALTA, NAO UM DESCUIDO ──────────────────────────┐
     * │ `status_pandape` e escrito SEM `coalesce`, de proposito e bem argumentado (vaga encerra no  │
     * │ ATS e a tela tem de acompanhar). Mas a vaga que aparece na lista SEM o campo `status`        │
     * │ projeta `status: null`, e a condicao `status_pandape is distinct from null` fica VERDADEIRA  │
     * │ sobre a linha que ja tem 3 gravado: a instrucao roda e troca o 3 por NULO.                   │
     * │                                                                                             │
     * │ O efeito na tela e a vaga ENCERRADA voltar a nao dizer nada, que e o estado que a frente     │
     * │ existe para acabar, e sem nada vermelho em lugar nenhum. O contrario (manter o 3 quando o    │
     * │ ATS silencia) e o comportamento que nao perde informacao.                                    │
     * │                                                                                             │
     * │ NAO E O `tester` QUEM DECIDE: a correcao pode ser `coalesce(${status}, status_pandape)` no   │
     * │ `set`, ou excluir o nulo da condicao. Este teste fica VERMELHO ate o diretor ou o            │
     * │ coordenador escolher, e e esse o papel dele.                                                 │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const b = bancada({
      lista: [{ idVacancy: 3703137, job: "VAGA", city: "Sao Paulo - SP", numberVacancies: 1 }],
    });
    await b.servico.enriquecer(VAGA_ID, "3703137");
    const sqlTexto = b.doRastreio()!.sql;
    const set = /\bset\b([\s\S]*?)\bwhere\b/i.exec(sqlTexto)?.[1] ?? "";

    expect(
      set,
      "a vaga esta na lista do ATS e sem o campo `status`: a instrucao grava NULO sobre o 3 que " +
        "estava espelhado. Ou o `set` protege o valor conhecido (`coalesce(novo, status_pandape)`), " +
        "ou a condicao do `where` deixa de casar quando o novo valor e nulo.",
    ).toMatch(/status_pandape\s*=\s*coalesce\(/i);
  });
});

// ── 5. A VAGA QUE O ATS NAO CONHECE, E A QUE JA ESTA ARRUMADA ────────────────────────────────

describe("a vaga fora da lista e a vaga que ja tem dado", () => {
  it("vaga ausente da lista: nenhuma escrita de rastreio, e nenhum erro", async () => {
    for (const orfa of AS_ORFAS) {
      const b = bancada({ lista: LISTA_PADRAO });
      await expect(b.servico.enriquecer(VAGA_ID, orfa)).resolves.toBeUndefined();
      expect(
        b.doRastreio(),
        `a vaga ${orfa}, que o ATS nao conhece, recebeu escrita de rastreio: sao 5 das 13, e elas ` +
          "dependem de gente completar a mao. Escrever ali seria inventar.",
      ).toBeUndefined();
      expect(
        b.resolverERegistrar.mock.calls.length,
        "a vaga fora da lista do ATS deixou de ser oferecida a PLANILHA: as duas fontes sao " +
          "independentes, e a orfa do ATS pode ter linha na planilha",
      ).toBe(1);
    }
  });

  it("a escrita e guardada: vaga RECUSADA e vaga FORA DA REVISAO nao sao alcancadas", async () => {
    const b = bancada();
    await b.servico.enriquecer(VAGA_ID, "3703137");
    const sqlTexto = b.doRastreio()!.sql;
    const where = sqlTexto.slice((/\bwhere\b/i.exec(sqlTexto)?.index ?? 0));

    expect(where, "a vaga RECUSADA voltaria a receber escrita a cada volta").toMatch(/recusada_em\s+is\s+null/i);
    expect(
      where,
      "vaga JA LIBERADA receberia escrita automatica, sem a trilha de edicao que toda gravacao em " +
        "vaga liberada tem. O papel vem do catalogo, nunca de um literal.",
    ).toMatch(/as_vaga_status/i);
  });

  it("a instrucao nao toca candidatura, status do EA, cod_cliente nem atualizado_em", async () => {
    const b = bancada();
    await b.servico.enriquecer(VAGA_ID, "3703137");
    const todas = b.instrucoes.map((i) => i.sql).join("\n;\n");
    const set = /\bset\b([\s\S]*?)\bwhere\b/i.exec(b.doRastreio()!.sql)?.[1] ?? "";

    expect(
      todas,
      "o rastreio citou `as_candidaturas`: sao 223 pessoas penduradas nas 13 vagas, e o " +
        "enriquecimento preenche COLUNA DA VAGA",
    ).not.toMatch(/as_candidaturas/i);
    expect(set, "o `set` mexeu no status do EA: rastrear nao e mover papel").not.toMatch(/\bstatus\s*=/i);
    expect(set, "o `set` escreveu cod_cliente: o cliente e gesto humano na liberacao").not.toMatch(/cod_cliente\s*=/i);
    expect(
      set,
      "o `set` empurrou `atualizado_em`: a volta passa aqui a cada evento, e isso e ruido de escrita",
    ).not.toMatch(/atualizado_em\s*=/i);
    expect(todas, "o rastreio emitiu DELETE").not.toMatch(/\bdelete\s+from\b/i);
    expect(todas, "o rastreio emitiu INSERT: ele PREENCHE a vaga que existe").not.toMatch(/\binsert\s+into\b/i);
  });

  it("duas candidaturas da mesma vaga na mesma volta: instrucao identica e uma listagem", async () => {
    const b = bancada();
    await b.servico.enriquecer(VAGA_ID, "3703137");
    await b.servico.enriquecer(VAGA_ID, "3703137");
    const rastreios = b.instrucoes.filter((i) => /nome_divulgacao/.test(i.sql));

    expect(rastreios.length, "o cenario nao exercitou as duas voltas").toBe(2);
    expect(rastreios[1].sql, "a segunda volta emitiu instrucao diferente").toBe(rastreios[0].sql);
    expect(rastreios[1].params, "a segunda volta mandou parametros diferentes").toEqual(rastreios[0].params);
    expect(b.listarVagas.mock.calls.length, "a segunda volta listou o ATS de novo").toBe(1);
  });
});

// ── 6. NUNCA LANCA: O ENRIQUECIMENTO E BONUS, A CANDIDATURA E O QUE IMPORTA ──────────────────

describe("nada no enriquecimento derruba a ingestao do Digai", () => {
  it("o `update` recusado pelo banco nao sobe", async () => {
    const b = bancada({ updateLanca: true });
    await expect(b.servico.enriquecer(VAGA_ID, "3703137")).resolves.toBeUndefined();
  });

  it("o catalogo de cidade fora do ar nao leva embora as outras tres colunas", async () => {
    const b = bancada({ cidadeLanca: true });
    await expect(b.servico.enriquecer(VAGA_ID, "3703137")).resolves.toBeUndefined();
    expect(
      b.doRastreio(),
      "a consulta de cidade falhou e o rastreio desistiu de titulo, posicoes e status tambem. " +
        "Cidade e um campo a mais: ela nao pode custar os outros tres.",
    ).toBeTruthy();
  });

  it("a planilha que lancar nao impede o rastreio pelo Pandape, e vice-versa", async () => {
    const b = bancada({ planilhaLanca: true });
    await expect(b.servico.enriquecer(VAGA_ID, "3703137")).resolves.toBeUndefined();
    expect(
      b.doRastreio(),
      "a falha de uma fonte levou a outra: as duas fontes preenchem colunas DISJUNTAS e nenhuma " +
        "depende de a outra ter dado certo",
    ).toBeTruthy();

    const c = bancada({ listaLanca: true });
    await expect(c.servico.enriquecer(VAGA_ID, "3703137")).resolves.toBeUndefined();
    expect(
      c.resolverERegistrar.mock.calls.length,
      "o Pandape caiu e a fonte da PLANILHA deixou de ser consultada: 1 das 13 vagas medidas " +
        "depende SO da planilha",
    ).toBe(1);
  });

  it("numero de vaga nao numerico nao viaja como NaN para a planilha", async () => {
    const b = bancada({ lista: [] });
    await expect(b.servico.enriquecer(VAGA_ID, "ABC-123")).resolves.toBeUndefined();
    expect(
      b.resolverERegistrar.mock.calls.length,
      "a chave 'NaN' foi consultada contra a planilha: casaria com nada, ou pior, com qualquer " +
        "linha torta",
    ).toBe(0);
  });
});

// ── 7. SECAO A.6: O LOG DIZ O NUMERO DA VAGA, NUNCA O CONTEUDO ───────────────────────────────

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

describe("secao A.6: o log do rastreio nao carrega texto livre do ATS", () => {
  it("titulo e cidade nao aparecem em nenhuma linha de log", async () => {
    const escrito: string[] = [];
    vi.spyOn(Logger.prototype, "log").mockImplementation((m: unknown) => {
      escrito.push(String(m));
    });
    vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      escrito.push(String(m));
    });

    const TITULO = "ZELADOR DO PREDIO DA FAMILIA ALMEIDA";
    const CIDADE = "Sao Bernardo Do Campo - SP";
    const b = bancada({
      lista: [{ idVacancy: 900106, job: TITULO, city: CIDADE, numberVacancies: 1, status: 3 }],
    });
    await b.servico.enriquecer(VAGA_ID, "900106");

    const saida = escrito.join("\n");
    expect(escrito.length, "o rastreio nao logou nada: o cenario nao exercitou o log").toBeGreaterThan(0);
    expect(
      saida,
      "o TITULO da vaga foi para o log. Titulo de vaga e texto livre do ATS, e esta casa ja mediu " +
        "que campo assim chega com nome de gente dentro (o mesmo motivo de `cargoPorTexto`).",
    ).not.toContain(TITULO);
    expect(saida, "a CIDADE foi para o log").not.toContain(CIDADE);
    expect(saida, "o log nao diz qual vaga foi rastreada, e ai ele nao serve para nada").toContain("900106");
  });

  it("canario: nenhuma linha de log do modulo interpola campo de pessoa", () => {
    /*
     * MEDIDO EM 08/10/2026: as 36 chamadas de log da pasta nao citam nenhum destes identificadores,
     * entao a lista de excecoes e VAZIA. Arquivo novo que logar `${registro.cpf}`, `${nome}` ou o
     * payload fica vermelho sem ninguem lembrar de escrever teste, e e assim que esta frente nao
     * reabre o veto de PII por uma porta nova.
     */
    const fontes = fontesDeProducao(__dirname);
    expect(fontes.length, "nao ha fonte de producao na pasta: o canario seria sobre o vazio").toBeGreaterThan(5);

    /*
     * O ALVO E O CAMPO, NAO O OBJETO. Primeira rodada: eu havia posto `registro` na lista, e o
     * canario reprovou duas linhas CORRETAS que logam `${registro.userId}`, que e identificador
     * tecnico e esta explicitamente autorizado na secao A.6. Proibir o objeto, e nao o campo,
     * transforma o canario em ruido, e canario ruidoso e o que se desliga primeiro.
     */
    const PROIBIDOS = /\$\{[^}]*\b(cpf|email|phone|telefone|firstname|lastname|nome|payload)\b/i;
    const achados: string[] = [];
    for (const f of fontes) {
      const codigo = semComentario(f.conteudo);
      const re = /logger\.(log|warn|error|debug|verbose)\(([\s\S]{0,600}?)\);/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(codigo)) !== null) {
        if (PROIBIDOS.test(m[2])) achados.push(`${f.nome}: ${m[2].slice(0, 90)}`);
      }
    }
    expect(
      achados,
      "ha log do modulo do Digai interpolando campo de pessoa. O universo e de 12.445 pessoas, e " +
        "log nao se desfaz: o que o rastreio pode dizer e o NUMERO DA VAGA e QUAIS colunas foram " +
        "preenchidas (secao A.6).",
    ).toEqual([]);
  });

  it("a falha da listagem avisa sem dizer nada do fornecedor", async () => {
    const escrito: string[] = [];
    vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      escrito.push(String(m));
    });
    const b = bancada({ listaLanca: true });
    await b.servico.enriquecer(VAGA_ID, "3703137");

    const saida = escrito.join("\n");
    expect(saida.length, "a falha de leitura do ATS passou em silencio total").toBeGreaterThan(0);
    expect(saida, "a mensagem do erro do fornecedor subiu para o log").not.toMatch(/rede caiu/i);
    expect(saida, "a URL do fornecedor foi logada").not.toMatch(/https?:\/\//);
  });
});
