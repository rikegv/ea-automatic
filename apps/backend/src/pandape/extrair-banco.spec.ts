import { describe, expect, it } from "vitest";
import { extrairDadosBancarios, extrairNomeBanco } from "./extrair-banco";

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

/**
 * Melhorias EAC, item 8: agência e conta deixaram de ser descartadas. Os números abaixo são
 * FICTÍCIOS; o que importa é o rótulo do campo, conferido contra a API real em 17/08/2026.
 */
describe("extrairDadosBancarios", () => {
  it("lê os três campos do formulário de Conta Bancária", () => {
    expect(extrairDadosBancarios([FORM_BANCARIO])).toEqual({
      banco: "BANCO DO BRASIL",
      agencia: "0000-0",
      conta: "00000-0",
    });
  });

  it("os três são OPCIONAIS: devolve só o que veio, sem inventar chave", () => {
    const soBanco = {
      ...FORM_BANCARIO,
      answers: [{ fieldName: "Nome do Banco", answer: "NUBANK" }],
    };
    expect(extrairDadosBancarios([soBanco])).toEqual({ banco: "NUBANK" });
  });

  it("formulário bancário VAZIO devolve objeto vazio (caso normal, não erro)", () => {
    expect(extrairDadosBancarios([{ ...FORM_BANCARIO, answers: [] }])).toEqual({});
  });

  it("sem formulário bancário nenhum, também objeto vazio", () => {
    expect(extrairDadosBancarios([{ name: "RG", answers: [] }])).toEqual({});
    expect(extrairDadosBancarios(undefined)).toEqual({});
  });

  it("NÃO normaliza: traço e zero à esquerda chegam como o candidato digitou", () => {
    const form = {
      ...FORM_BANCARIO,
      answers: [
        { fieldName: "Agencia com dígito(se houver)", answer: " 0001-2 " },
        { fieldName: "Conta bancária com dígito(se houver)", answer: "000123-4" },
      ],
    };
    expect(extrairDadosBancarios([form])).toEqual({ agencia: "0001-2", conta: "000123-4" });
  });

  it("campo em branco não vira string vazia no cadastro", () => {
    const form = {
      ...FORM_BANCARIO,
      answers: [
        { fieldName: "Nome do Banco", answer: "ITAU" },
        { fieldName: "Agencia com dígito(se houver)", answer: "   " },
      ],
    };
    expect(extrairDadosBancarios([form])).toEqual({ banco: "ITAU" });
  });
});
