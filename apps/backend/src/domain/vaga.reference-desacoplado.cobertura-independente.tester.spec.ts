import { describe, expect, it } from "vitest";
import * as dominioDaVaga from "./vaga";

/**
 * COBERTURA INDEPENDENTE (tester, A.38/A.40): DESACOPLAR O `reference` DO PANDAPE DA UNICIDADE.
 *
 * Escrito a partir do REQUISITO, nao do codigo, enquanto o `backend` constroi a variante em
 * paralelo. A identidade real de uma vaga do Pandape e o `id_vacancy_pandape` (unico), NAO o
 * `reference`, que REPETE na origem (medido: 7 references em 42 vagas distintas). A trava de
 * duplicidade de codigo so pode barrar o que de fato colide.
 *
 * A REGRA, destilada dos quatro casos do diretor:
 *   colide = o candidato e MANUAL (id_vacancy_pandape nulo) E existe OUTRA vaga de mesmo codigo
 *   que TAMBEM e manual.
 *   . vaga do Pandape (id setado) nunca e barrada pelo codigo (o reference repete por desenho);
 *   . codigo manual igual ao reference de uma vaga do Pandape NAO colide;
 *   . a propria vaga, re-liberada, nao colide consigo mesma (o chamador ja a exclui da lista).
 *
 * NOME E ASSINATURA: a propriedade esta sob teste, nao o nome. A variante e procurada por uma lista
 * de nomes plausiveis e chamada por tres assinaturas conhecidas, aceitando a primeira que devolver
 * booleano. Enquanto a construcao nao chega, a falha deste arquivo e a especificacao dela.
 *
 * §A.6: nada de dado pessoal. Codigos de vaga e ids tecnicos de integracao, inventados.
 */

// ── ACHAR A VARIANTE QUE AINDA ESTA SENDO ESCRITA ───────────────────────────

const NOMES_PLAUSIVEIS = [
  "codigoColideComVagaManual",
  "codigoJaUsadoPorOutraVaga",
  "codigoColideComOutraVaga",
  "codigoDuplicadoEntreVagas",
  "codigoJaUsadoConsiderandoPandape",
  "codigoJaUsadoDesacoplandoReference",
  "referenceNaoTravaDuplicidade",
  "codigoColide",
  "codigoDuplicado",
];

interface LadoDaVaga {
  codigo: string;
  idVacancyPandape: string | null;
}

type Variante = (...args: unknown[]) => unknown;

function acharVariante(): { nome: string; fn: Variante } | null {
  const mod = dominioDaVaga as unknown as Record<string, unknown>;
  for (const nome of NOMES_PLAUSIVEIS) {
    if (typeof mod[nome] === "function") return { nome, fn: mod[nome] as Variante };
  }
  return null;
}

/**
 * A chamada ADAPTATIVA: a propriedade e o resultado booleano, e a forma da assinatura e escolha
 * legitima de quem constroi. Tenta objeto-objeto, depois posicional, e aceita a que der booleano.
 */
function avaliar(fn: Variante, entrada: LadoDaVaga, existentes: LadoDaVaga[]): boolean {
  const tentativas: Array<() => unknown> = [
    // (codigo, existentes[], idVacancyPandapeAtual): a forma de `codigoColideComVagaManual`.
    () => fn(entrada.codigo, existentes, entrada.idVacancyPandape),
    () => fn(entrada, existentes),
    () => fn(entrada.codigo, entrada.idVacancyPandape, existentes),
    () =>
      fn(
        entrada.codigo,
        entrada.idVacancyPandape,
        existentes.map((e) => e.codigo),
        existentes.map((e) => e.idVacancyPandape),
      ),
  ];
  for (const t of tentativas) {
    try {
      const r = t();
      if (typeof r === "boolean") return r;
    } catch {
      /* tenta a proxima forma */
    }
  }
  throw new Error(
    "A variante foi encontrada, mas nenhuma assinatura conhecida devolveu booleano. " +
      "Esperado: fn({ codigo, idVacancyPandape }, Array<{ codigo, idVacancyPandape }>) => boolean.",
  );
}

const variante = acharVariante();

function colide(entrada: LadoDaVaga, existentes: LadoDaVaga[]): boolean {
  if (!variante) {
    throw new Error(
      "Nenhuma variante de `codigoJaUsado` que considere o `id_vacancy_pandape` foi exportada por " +
        "`domain/vaga.ts`. Nomes procurados: " +
        NOMES_PLAUSIVEIS.join(", ") +
        ". Enquanto a construcao nao chega, este arquivo e a especificacao dela: a trava de " +
        "duplicidade so pode barrar duas vagas MANUAIS de mesmo codigo, nunca duas vagas do " +
        "Pandape que apenas compartilham o reference.",
    );
  }
  return avaliar(variante.fn, entrada, existentes);
}

const PANDAPE_1 = "VAGA-PANDAPE-0001";
const PANDAPE_2 = "VAGA-PANDAPE-0002";
const CODIGO = "SL0042";

// ── A GUARDA: a variante existe mesmo? (senao os casos abaixo nao provam nada) ──────────────

describe("a variante que desacopla o reference existe em domain/vaga.ts", () => {
  it("esta exportada e e uma funcao", () => {
    expect(
      variante,
      "a trava de codigo continua olhando so o numero, sem distinguir vaga do Pandape de vaga manual",
    ).not.toBeNull();
  });
});

// ── OS QUATRO CASOS DO REQUISITO ────────────────────────────────────────────

describe("desacoplar o reference do Pandape da unicidade de vaga (os 4 casos)", () => {
  it("CASO 1 (o conserto): duas vagas do Pandape DISTINTAS com o mesmo codigo NAO colidem", () => {
    expect(
      colide(
        { codigo: CODIGO, idVacancyPandape: PANDAPE_2 },
        [{ codigo: CODIGO, idVacancyPandape: PANDAPE_1 }],
      ),
      "a segunda vaga do Pandape foi barrada pelo reference repetido: a identidade real e o id_vacancy_pandape, que e distinto",
    ).toBe(false);
  });

  it("CASO 2 (a trava NAO morreu): duas vagas MANUAIS com o mesmo codigo digitado colidem", () => {
    expect(
      colide(
        { codigo: CODIGO, idVacancyPandape: null },
        [{ codigo: CODIGO, idVacancyPandape: null }],
      ),
      "a segunda vaga manual passou com codigo repetido: a trava de um codigo por processo seletivo foi desligada por engano",
    ).toBe(true);
  });

  it("CASO 3: vaga manual com codigo IGUAL ao reference de uma vaga do Pandape NAO colide", () => {
    expect(
      colide(
        { codigo: CODIGO, idVacancyPandape: null },
        [{ codigo: CODIGO, idVacancyPandape: PANDAPE_1 }],
      ),
      "a vaga manual foi barrada por casar com o reference de uma vaga do Pandape, que repete por desenho",
    ).toBe(false);
  });

  it("CASO 4: a propria vaga re-liberada nao colide consigo mesma (lista ja sem ela)", () => {
    // O chamador exclui a propria vaga (no servico, por `ne(vagas.id, ignorarVagaId)`), entao a
    // funcao pura recebe a lista SEM ela. Manual ou do Pandape, sozinha, nunca colide.
    expect(
      colide({ codigo: CODIGO, idVacancyPandape: null }, []),
      "a vaga manual sozinha acusou duplicidade de si mesma",
    ).toBe(false);
    expect(
      colide({ codigo: CODIGO, idVacancyPandape: PANDAPE_1 }, []),
      "a vaga do Pandape sozinha acusou duplicidade de si mesma",
    ).toBe(false);
  });
});

// ── AS BORDAS QUE OS QUATRO CASOS NAO FIXAM, E QUE A REGRA PRECISA SUSTENTAR ─────────────────

describe("as bordas da regra de desacoplamento", () => {
  it("vaga do Pandape NUNCA e barrada pelo codigo, nem contra uma vaga manual de mesmo codigo", () => {
    expect(
      colide(
        { codigo: CODIGO, idVacancyPandape: PANDAPE_1 },
        [{ codigo: CODIGO, idVacancyPandape: null }],
      ),
      "a vaga do Pandape foi barrada por uma vaga manual: o Pandape e a fonte da verdade, nunca a barrada",
    ).toBe(false);
  });

  it("vaga do Pandape re-liberada, ainda presente na lista (nao excluida), continua sem colidir", () => {
    expect(
      colide(
        { codigo: CODIGO, idVacancyPandape: PANDAPE_2 },
        [{ codigo: CODIGO, idVacancyPandape: PANDAPE_2 }],
      ),
      "a vaga do Pandape colidiu com uma linha de mesmo id (ela mesma): id setado nunca e barrado pelo codigo",
    ).toBe(false);
  });

  it("vaga manual colide quando HA uma manual de mesmo codigo, mesmo com uma do Pandape junto", () => {
    expect(
      colide({ codigo: CODIGO, idVacancyPandape: null }, [
        { codigo: CODIGO, idVacancyPandape: PANDAPE_1 },
        { codigo: CODIGO, idVacancyPandape: null },
      ]),
      "a vaga manual duplicada passou porque havia uma do Pandape de mesmo codigo na lista: a manual repetida e duplicidade de verdade",
    ).toBe(true);
  });

  it("codigos DIFERENTES nunca colidem, Pandape ou manual", () => {
    expect(colide({ codigo: "SL0042", idVacancyPandape: null }, [{ codigo: "SL0043", idVacancyPandape: null }])).toBe(
      false,
    );
    expect(
      colide({ codigo: "SL0042", idVacancyPandape: PANDAPE_1 }, [{ codigo: "SL0043", idVacancyPandape: PANDAPE_2 }]),
    ).toBe(false);
  });

  it("a comparacao de codigo continua normalizada (trim e caixa): manual duplicada e pega", () => {
    expect(
      colide({ codigo: " sl0042 ", idVacancyPandape: null }, [{ codigo: "SL0042", idVacancyPandape: null }]),
      "a duplicidade escapou por diferenca de espaco ou de caixa no codigo manual",
    ).toBe(true);
  });

  it("sem nenhuma outra vaga, nada colide", () => {
    expect(colide({ codigo: CODIGO, idVacancyPandape: null }, [])).toBe(false);
    expect(colide({ codigo: CODIGO, idVacancyPandape: PANDAPE_1 }, [])).toBe(false);
  });
});
