import { describe, it, expect } from "vitest";
import { cnpjDigitos, formatarCnpj } from "./cnpj";

describe("formatarCnpj: exibição formatada ou 'Não Cadastrado'", () => {
  it("formata 14 dígitos com ponto, barra e hífen", () => {
    expect(formatarCnpj("12345678000190")).toBe("12.345.678/0001-90");
  });
  it("reformata mesmo vindo com pontuação", () => {
    expect(formatarCnpj("12.345.678/0001-90")).toBe("12.345.678/0001-90");
  });
  it("sem CNPJ (nulo, indefinido, vazio) mostra 'Não Cadastrado'", () => {
    expect(formatarCnpj(null)).toBe("Não Cadastrado");
    expect(formatarCnpj(undefined)).toBe("Não Cadastrado");
    expect(formatarCnpj("")).toBe("Não Cadastrado");
  });
  it("formato inesperado (dígitos != 14) cai em 'Não Cadastrado'", () => {
    expect(formatarCnpj("123")).toBe("Não Cadastrado");
  });
  it("não usa travessão em dash (§A.11)", () => {
    expect(formatarCnpj(null)).not.toContain("—");
  });
});

describe("cnpjDigitos: normalização para a busca", () => {
  it("tira a pontuação", () => {
    expect(cnpjDigitos("12.345.678/0001-90")).toBe("12345678000190");
  });
  it("nulo/indefinido vira string vazia", () => {
    expect(cnpjDigitos(null)).toBe("");
    expect(cnpjDigitos(undefined)).toBe("");
  });
});
