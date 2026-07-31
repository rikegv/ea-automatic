import { describe, expect, it } from "vitest";
import { beneficiosSemValor, criarPrecisaValor, foraDoPadraoPacote } from "./beneficios";

/**
 * A régua "precisa de valor?" NAS TELAS vem do CATÁLOGO (OST cadastro de benefícios por tela).
 *
 * As três telas que montam o pacote (wizard, Liberação, modal do Gerenciador) liam o TEXTO DO NOME
 * para decidir se mostravam o campo de valor. Agora leem a coluna `exige_valor`, a mesma que o
 * backend valida, então tela e backend não têm como divergir e renomear deixou de mudar a exigência.
 *
 * O fallback por nome continua existindo, e tem teste próprio: nome fora do catálogo (o texto
 * achatado das admissões importadas) não pode virar "não exige valor" por omissão.
 */

describe("criarPrecisaValor: o catálogo manda", () => {
  it("respeita a coluna, mesmo num nome que a régua por texto não reconheceria", () => {
    const precisa = criarPrecisaValor([{ nome: "Auxílio home office", exigeValor: true }]);
    expect(precisa("Auxílio home office")).toBe(true);
  });

  it("respeita a coluna quando ela DESLIGA um nome que a régua por texto reconheceria", () => {
    const precisa = criarPrecisaValor([{ nome: "VR (Vale-Refeição)", exigeValor: false }]);
    expect(precisa("VR (Vale-Refeição)")).toBe(false);
  });

  it("nome FORA do catálogo cai no fallback por nome, não em 'não exige'", () => {
    const precisa = criarPrecisaValor([{ nome: "VT (Vale-Transporte)", exigeValor: false }]);
    // Legado achatado das admissões importadas: não tem linha no catálogo.
    expect(precisa("VR (Vale-Refeição)")).toBe(true);
    expect(precisa("Seguro de vida")).toBe(false);
  });

  it("catálogo vazio ou ausente não quebra: cai inteiro no fallback", () => {
    expect(criarPrecisaValor([])("VA (Vale-Alimentação)")).toBe(true);
    expect(criarPrecisaValor(null)("VA (Vale-Alimentação)")).toBe(true);
    expect(criarPrecisaValor(undefined)("Refeição no local")).toBe(false);
  });
});

describe("beneficiosSemValor usa a régua recebida", () => {
  const catalogo = [
    { nome: "Auxílio home office", exigeValor: true },
    { nome: "VR (Vale-Refeição)", exigeValor: false },
  ];

  it("cobra o benefício novo que o cadastro marcou como 'exige valor'", () => {
    const precisa = criarPrecisaValor(catalogo);
    expect(beneficiosSemValor(["Auxílio home office"], {}, precisa)).toEqual([
      "Auxílio home office",
    ]);
  });

  it("não cobra o que o cadastro desmarcou, mesmo sendo VR", () => {
    const precisa = criarPrecisaValor(catalogo);
    expect(beneficiosSemValor(["VR (Vale-Refeição)"], {}, precisa)).toEqual([]);
  });

  it("valor preenchido tira da lista", () => {
    const precisa = criarPrecisaValor(catalogo);
    expect(
      beneficiosSemValor(["Auxílio home office"], { "Auxílio home office": "300,00" }, precisa),
    ).toEqual([]);
  });
});

describe("foraDoPadraoPacote usa a régua recebida", () => {
  it("benefício novo COM valor divergente do padrão acusa fuga", () => {
    const precisa = criarPrecisaValor([{ nome: "Auxílio home office", exigeValor: true }]);
    const padrao = [{ nome: "Auxílio home office", valor: 300 }];
    expect(
      foraDoPadraoPacote(padrao, ["Auxílio home office"], { "Auxílio home office": "500,00" }, precisa),
    ).toBe(true);
    expect(
      foraDoPadraoPacote(padrao, ["Auxílio home office"], { "Auxílio home office": "300,00" }, precisa),
    ).toBe(false);
  });

  it("sem padrão do par não há do que fugir", () => {
    expect(foraDoPadraoPacote(null, ["VR (Vale-Refeição)"], {})).toBe(false);
    expect(foraDoPadraoPacote([], ["VR (Vale-Refeição)"], {})).toBe(false);
  });
});
