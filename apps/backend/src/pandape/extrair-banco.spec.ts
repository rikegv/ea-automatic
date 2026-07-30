import { describe, expect, it } from "vitest";
import { extrairNomeBanco } from "./extrair-banco";

/**
 * Fixtures no FORMATO REAL da API (conferido ao vivo em 29/07/2026). Os valores de banco são os que
 * vieram de candidatos reais, e são texto livre digitado por eles. Agência e conta aparecem aqui
 * apenas para provar que a função os IGNORA; os números são fictícios.
 */
const FORM_BANCARIO = {
  name: "Conta Bancária (anexo de comprovação de agencia e conta obrigatório)",
  answers: [
    { fieldName: "Nome do Banco", answer: "BANCO DO BRASIL" },
    { fieldName: "Agencia com dígito(se houver)", answer: "0000-0" },
    { fieldName: "Conta bancária com dígito(se houver)", answer: "00000-0" },
  ],
  documents: [],
};

describe("extrairNomeBanco", () => {
  it("lê o Nome do Banco do formulário de Conta Bancária", () => {
    expect(extrairNomeBanco([FORM_BANCARIO])).toBe("BANCO DO BRASIL");
  });

  it("aceita o texto livre como o candidato digitou (não normaliza nem infere)", () => {
    const form = {
      ...FORM_BANCARIO,
      answers: [{ fieldName: "Nome do Banco", answer: "Nu Pagamentos S.A. - Instituição de Pagamento" }],
    };
    expect(extrairNomeBanco([form])).toBe("Nu Pagamentos S.A. - Instituição de Pagamento");
  });

  it("§A.6: NUNCA devolve agência nem conta, mesmo estando no mesmo formulário", () => {
    const valor = extrairNomeBanco([FORM_BANCARIO]) ?? "";
    expect(valor).not.toContain("0000-0");
    expect(valor).not.toContain("00000-0");
  });

  it("ignora os demais formulários (só o de conta bancária responde)", () => {
    const outro = {
      name: "Dados Pessoais",
      answers: [{ fieldName: "Nome do Banco", answer: "NÃO É DAQUI" }],
      documents: [],
    };
    expect(extrairNomeBanco([outro])).toBeUndefined();
  });

  it("sem o campo, sem valor, ou sem formulário nenhum: undefined", () => {
    expect(extrairNomeBanco([{ ...FORM_BANCARIO, answers: [] }])).toBeUndefined();
    expect(
      extrairNomeBanco([{ ...FORM_BANCARIO, answers: [{ fieldName: "Nome do Banco", answer: "  " }] }]),
    ).toBeUndefined();
    expect(extrairNomeBanco([])).toBeUndefined();
    expect(extrairNomeBanco(undefined)).toBeUndefined();
  });

  it("tolera variação de caixa no rótulo do campo", () => {
    const form = { ...FORM_BANCARIO, answers: [{ fieldName: "nome do banco", answer: "NUBANK" }] };
    expect(extrairNomeBanco([form])).toBe("NUBANK");
  });
});
