import { describe, expect, it } from "vitest";
import { cnpjValido, soDigitosCnpj } from "./cnpj";

/**
 * TESTE INDEPENDENTE (§A.38): escrito a partir do REQUISITO, não do código.
 *
 * O algoritmo do dígito verificador foi conferido À MÃO, não copiado do backend:
 *
 *   1º DV: pesos 5,4,3,2,9,8,7,6,5,4,3,2 sobre os 12 primeiros dígitos; soma % 11;
 *          resto < 2 => DV 0, senão 11 - resto.
 *   2º DV: pesos 6,5,4,3,2,9,8,7,6,5,4,3,2 sobre os 13 primeiros (com o 1º DV); mesma regra.
 *
 * "11.222.333/0001-81" fecha em DV 8 e 1 (conferido: somas 102 e 120, restos 3 e 10).
 */
describe("cnpjValido: dígito verificador real, conferido à mão", () => {
  it("aceita CNPJ válido conhecido, com máscara", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
  });

  it("aceita o MESMO CNPJ sem máscara (só dígitos)", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
  });

  it("aceita um segundo CNPJ válido independente", () => {
    // 11.444.777/0001-61: 1º DV soma 214 (resto 5 => 6), 2º DV soma 230 (resto 10 => 1).
    expect(cnpjValido("11.444.777/0001-61")).toBe(true);
    expect(cnpjValido("11444777000161")).toBe(true);
  });

  it("rejeita quando o 2º dígito verificador está trocado", () => {
    // mesmo CNPJ válido, DV2 1 -> 2
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
  });

  it("rejeita quando o 1º dígito verificador está trocado", () => {
    // DV1 8 -> 7
    expect(cnpjValido("11.222.333/0001-71")).toBe(false);
  });

  it("rejeita sequência de dígitos todos iguais, mesmo que os DVs 'fechem'", () => {
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
  });

  it("rejeita tamanho errado (curto, longo)", () => {
    expect(cnpjValido("1122233300018")).toBe(false); // 13 dígitos
    expect(cnpjValido("112223330001811")).toBe(false); // 15 dígitos
    expect(cnpjValido("123")).toBe(false);
  });

  it("rejeita vazio, nulo e indefinido", () => {
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido("   ")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
    expect(cnpjValido(undefined)).toBe(false);
  });

  it("rejeita lixo não-numérico", () => {
    expect(cnpjValido("abc.def.ghi/jklm-no")).toBe(false);
  });
});

describe("soDigitosCnpj: extrai só os dígitos, preservando-os", () => {
  it("tira máscara e devolve os 14 dígitos", () => {
    expect(soDigitosCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("é idempotente sobre entrada já só com dígitos", () => {
    expect(soDigitosCnpj("11222333000181")).toBe("11222333000181");
  });

  it("devolve string vazia para entrada sem dígito nenhum", () => {
    expect(soDigitosCnpj("abc/-.")).toBe("");
  });
});
