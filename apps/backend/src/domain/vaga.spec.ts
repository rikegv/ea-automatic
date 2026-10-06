import { describe, expect, it } from "vitest";
import {
  codigoColideComVagaManual,
  codigoJaUsado,
  excessoDePosicoes,
  ladosDaVaga,
  normalizarCodigoVaga,
  vagasFechadasExcedemPosicoes,
} from "./vaga";

describe("normalizarCodigoVaga", () => {
  it("apara espaço e sobe a caixa", () => {
    expect(normalizarCodigoVaga("  sl123 ")).toBe("SL123");
  });

  it("PRESERVA as letras da família SL (a limpeza antiga apagava e fundia códigos distintos)", () => {
    expect(normalizarCodigoVaga("SL0042")).toBe("SL0042");
    expect(normalizarCodigoVaga("511805")).toBe("511805");
  });
});

describe("codigoJaUsado (a trava um código = um processo seletivo)", () => {
  it("código já usado no sistema é duplicidade, e é o que a trava barra", () => {
    expect(codigoJaUsado("511805", ["511805"])).toBe(true);
  });

  it("código inédito passa", () => {
    expect(codigoJaUsado("999999", ["511805", "SL0042"])).toBe(false);
  });

  it("a comparação é normalizada: espaço e caixa não abrem uma porta lateral", () => {
    expect(codigoJaUsado(" sl123 ", ["SL123"])).toBe(true);
  });

  it("MESMO cliente e MESMO cargo com códigos DIFERENTES é o caso correto, e não é barrado", () => {
    // Duas aberturas do mesmo cargo no mesmo cliente: cada processo gerou o seu número.
    expect(codigoJaUsado("511806", ["511805"])).toBe(false);
  });

  it("sem nenhuma vaga cadastrada, nada conflita", () => {
    expect(codigoJaUsado("511805", [])).toBe(false);
  });
});

/**
 * A TRAVA DESACOPLADA DO `reference` DO PANDAPÉ (correção do diretor, 06/10).
 *
 * O `codigo` recebe o `reference` do Pandapé, que o Pandapé REUSA entre vagas distintas (medido: 7
 * references em 42 vagas, cada uma com `id_vacancy_pandape` próprio). A identidade da vaga-Pandapé é
 * o id, não o reference. Estes quatro casos são a decisão do diretor, e são o que a régua tem de
 * satisfazer.
 */
describe("codigoColideComVagaManual (a trava que olha a identidade, não o reference)", () => {
  it("CASO 1: duas vagas-Pandapé distintas (ids diferentes) com o MESMO reference, ambas liberam", () => {
    // Gravando a 2ª (id "VAC-B"); a 1ª (id "VAC-A") já está na base com o mesmo código. Hoje a 2ª
    // batia na trava; agora não, porque a identidade de cada uma é o seu id.
    expect(
      codigoColideComVagaManual(
        "332225",
        [{ codigo: "332225", idVacancyPandape: "VAC-A" }],
        "VAC-B",
      ),
    ).toBe(false);
  });

  it("CASO 2: duas vagas MANUAIS (id nulo) com o mesmo código, a 2ª AINDA é barrada", () => {
    // A trava não morreu: dois números digitados à mão iguais são o mesmo processo cadastrado duas vezes.
    expect(
      codigoColideComVagaManual("511805", [{ codigo: "511805", idVacancyPandape: null }], null),
    ).toBe(true);
  });

  it("CASO 3: manual (id nulo) com código igual ao reference de uma vaga-Pandapé (id setado), NÃO barra", () => {
    expect(
      codigoColideComVagaManual(
        "332225",
        [{ codigo: "332225", idVacancyPandape: "VAC-A" }],
        null,
      ),
    ).toBe(false);
  });

  it("CASO 4: editar/re-liberar a própria vaga não acusa colisão consigo mesma", () => {
    // A própria vaga sai da lista de existentes (a consulta usa `ne(id, ignorarVagaId)`): sem outra
    // linha de mesmo código, nada colide, inclusive quando ela é manual.
    expect(codigoColideComVagaManual("511805", [], null)).toBe(false);
    expect(codigoColideComVagaManual("332225", [], "VAC-A")).toBe(false);
  });

  it("vaga-Pandapé nova (id setado) com código igual ao de uma MANUAL existente também não colide", () => {
    // A ponta contrária do caso 3: o que importa para a vaga-Pandapé é o id, e o manual não disputa com id.
    expect(
      codigoColideComVagaManual("511805", [{ codigo: "511805", idVacancyPandape: null }], "VAC-A"),
    ).toBe(false);
  });

  it("entre várias linhas, basta UMA outra manual de mesmo código para a manual atual ser barrada", () => {
    expect(
      codigoColideComVagaManual(
        "332225",
        [
          { codigo: "332225", idVacancyPandape: "VAC-A" },
          { codigo: "332225", idVacancyPandape: "VAC-B" },
          { codigo: "332225", idVacancyPandape: null },
        ],
        null,
      ),
    ).toBe(true);
  });

  it("a comparação de código segue normalizada (espaço e caixa) entre duas manuais", () => {
    expect(
      codigoColideComVagaManual(" sl123 ", [{ codigo: "SL123", idVacancyPandape: null }], null),
    ).toBe(true);
  });

  it("id vazio ou só espaço conta como MANUAL (não veio do Pandapé)", () => {
    expect(
      codigoColideComVagaManual("511805", [{ codigo: "511805", idVacancyPandape: "" }], "   "),
    ).toBe(true);
    expect(
      codigoColideComVagaManual("511805", [{ codigo: "511805", idVacancyPandape: undefined }], undefined),
    ).toBe(true);
  });
});

describe("ladosDaVaga (a contraparte da abertura)", () => {
  const EU = "11111111-1111-1111-1111-111111111111";
  const OUTRO = "22222222-2222-2222-2222-222222222222";

  it("recruiter abrindo: ele mesmo vira o recruiter, e o consultor é o escolhido", () => {
    expect(ladosDaVaga("RECRUITER", EU, OUTRO)).toEqual({ recruiterId: EU, consultorId: OUTRO });
  });

  it("consultor abrindo: ele mesmo vira o consultor, e o recruiter é o escolhido", () => {
    expect(ladosDaVaga("CONSULTOR", EU, OUTRO)).toEqual({ consultorId: EU, recruiterId: OUTRO });
  });

  it("sem a contraparte escolhida, o lado de quem abre continua carimbado", () => {
    expect(ladosDaVaga("RECRUITER", EU, null)).toEqual({ recruiterId: EU, consultorId: null });
  });

  it("quem não tem papel de A&S não carimba lado nenhum", () => {
    expect(ladosDaVaga(null, EU, OUTRO)).toEqual({ consultorId: null, recruiterId: null });
  });
});

describe("vagasFechadasExcedemPosicoes", () => {
  it("fechar mais do que abriu é o que a trava barra", () => {
    expect(vagasFechadasExcedemPosicoes(3, 2)).toBe(true);
  });

  it("fechar tudo ou fechar menos passa", () => {
    expect(vagasFechadasExcedemPosicoes(2, 2)).toBe(false);
    expect(vagasFechadasExcedemPosicoes(1, 2)).toBe(false);
  });

  it("não informar quantas fecharam não é erro", () => {
    expect(vagasFechadasExcedemPosicoes(null, 2)).toBe(false);
    expect(vagasFechadasExcedemPosicoes(undefined, 2)).toBe(false);
  });
});

/**
 * OS DOIS CONTADORES DA VAGA (decisão do diretor, 25/08).
 *
 * O QUE ESTES TESTES PROTEGEM: que os lados sejam conferidos SEPARADAMENTE. A tentação natural, na
 * hora de dar manutenção, é somar as metas e comparar com a soma das contagens, e é justamente isso
 * que deixaria passar a contratação a mais que a trava existe para impedir.
 */
describe("excessoDePosicoes (os dois contadores da vaga)", () => {
  const BLUE_SKIES = { posicoesOficiais: 10, posicoesBanco: 10 };

  it("passa quando os dois lados cabem na sua meta", () => {
    expect(
      excessoDePosicoes({ vagasFechadas: 6, vagasFechadasBanco: 3 }, BLUE_SKIES),
    ).toBeNull();
  });

  it("passa quando cada lado fecha exatamente a sua meta", () => {
    expect(
      excessoDePosicoes({ vagasFechadas: 10, vagasFechadasBanco: 10 }, BLUE_SKIES),
    ).toBeNull();
  });

  it("NÃO DEIXA O BANCO COBRIR O OFICIAL: sobra no banco não autoriza contratar a mais", () => {
    // 12 + 1 = 13 cabe nas 20 posições somadas, e é exatamente por isso que somar seria errado.
    expect(excessoDePosicoes({ vagasFechadas: 12, vagasFechadasBanco: 1 }, BLUE_SKIES)).toEqual({
      lado: "OFICIAIS",
      meta: 10,
      informado: 12,
    });
  });

  it("NÃO DEIXA O OFICIAL COBRIR O BANCO, pelo mesmo motivo, no sentido contrário", () => {
    expect(excessoDePosicoes({ vagasFechadas: 1, vagasFechadasBanco: 12 }, BLUE_SKIES)).toEqual({
      lado: "BANCO",
      meta: 10,
      informado: 12,
    });
  });

  it("com os dois estourados, acusa o OFICIAL primeiro (é o que custa mais caro)", () => {
    expect(excessoDePosicoes({ vagasFechadas: 11, vagasFechadasBanco: 11 }, BLUE_SKIES)?.lado).toBe(
      "OFICIAIS",
    );
  });

  it("VAGA SEM BANCO NÃO ACEITA FECHAMENTO DE BANCO: zero é resposta, não lacuna", () => {
    expect(
      excessoDePosicoes(
        { vagasFechadas: 1, vagasFechadasBanco: 1 },
        { posicoesOficiais: 3, posicoesBanco: 0 },
      ),
    ).toEqual({ lado: "BANCO", meta: 0, informado: 1 });
  });

  it("meta de banco ausente vale ZERO (a coluna é NOT NULL DEFAULT 0 no banco)", () => {
    expect(
      excessoDePosicoes(
        { vagasFechadas: 1, vagasFechadasBanco: 1 },
        { posicoesOficiais: 3, posicoesBanco: null },
      ),
    ).toEqual({ lado: "BANCO", meta: 0, informado: 1 });
  });

  it("META OFICIAL NULA (rascunho) NÃO TEM TETO: ausência de meta não é meta zero", () => {
    expect(
      excessoDePosicoes(
        { vagasFechadas: 99, vagasFechadasBanco: 0 },
        { posicoesOficiais: null, posicoesBanco: 0 },
      ),
    ).toBeNull();
  });

  it("não informar quantas fecharam, de nenhum lado, continua não sendo erro", () => {
    expect(
      excessoDePosicoes({ vagasFechadas: null, vagasFechadasBanco: undefined }, BLUE_SKIES),
    ).toBeNull();
  });
});
