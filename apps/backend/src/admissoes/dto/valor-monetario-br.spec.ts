import { describe, expect, it } from "vitest";
import { normalizarSalarioParaDto, parseValorBR } from "./valor-monetario-br";

describe("parseValorBR — formatos que o consultor digita (OST salário)", () => {
  it.each([
    ["2500", 2500],
    ["2500,00", 2500],
    ["2.500,00", 2500],
    ["R$ 2.500,00", 2500],
    ["R$2.500,00", 2500],
    ["2 500,00", 2500], // com espaço
    ["2.500", 2500], // ambíguo: ponto é milhar no padrão BR, não 2,5
    ["1.234.567,89", 1234567.89],
    ["0", 0],
    ["0,00", 0],
    ["1500,5", 1500.5],
    [2500, 2500], // number passa direto
  ])("'%s' -> %s", (entrada, esperado) => {
    expect(parseValorBR(entrada)).toBe(esperado);
  });

  it.each([
    ["abc"],
    ["R$ abc"],
    ["2.500,0,0"], // duas vírgulas
    ["1,2,3"],
    ["--5"],
    [""],
    ["   "],
    [null],
    [undefined],
    ["dez mil"],
  ])("'%s' -> null (inválido)", (entrada) => {
    expect(parseValorBR(entrada as unknown)).toBeNull();
  });
});

describe("normalizarSalarioParaDto — contrato do DTO (canônico ou barrável)", () => {
  it.each([
    ["2500", "2500.00"],
    ["2500,00", "2500.00"],
    ["2.500,00", "2500.00"],
    ["R$ 2.500,00", "2500.00"],
    ["2 500,00", "2500.00"],
    ["2.500", "2500.00"],
    ["1500,5", "1500.50"],
  ])("'%s' -> '%s' (numeric do Postgres aceita)", (entrada, esperado) => {
    expect(normalizarSalarioParaDto(entrada)).toBe(esperado);
  });

  it("vazio/ausente -> undefined (opcional, vira pendência, não bloqueia)", () => {
    expect(normalizarSalarioParaDto("")).toBeUndefined();
    expect(normalizarSalarioParaDto("   ")).toBeUndefined();
    expect(normalizarSalarioParaDto(undefined)).toBeUndefined();
    expect(normalizarSalarioParaDto(null)).toBeUndefined();
  });

  it("inválido/negativo -> devolve o cru (o @Matches barra com 400)", () => {
    // Não casa em /^\d+(\.\d{1,2})?$/ → validação rejeita antes do banco.
    expect(normalizarSalarioParaDto("abc")).toBe("abc");
    expect(normalizarSalarioParaDto("-2500")).toBe("-2500");
    expect(normalizarSalarioParaDto("1,2,3")).toBe("1,2,3");
    for (const cru of ["abc", "-2500", "1,2,3"]) {
      const canon = normalizarSalarioParaDto(cru)!;
      expect(/^\d+(\.\d{1,2})?$/.test(canon)).toBe(false);
    }
  });
});
