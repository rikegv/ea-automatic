import { describe, it, expect } from "vitest";
import { cnpjDigitos, fmtCnpj, rotuloCliente } from "./rotulo-cliente-liberacao";

describe("fmtCnpj: EXIBIÇÃO formatada, ou 'Não Cadastrado'", () => {
  it("formata 14 dígitos com ponto, barra e hífen", () => {
    expect(fmtCnpj("12345678000190")).toBe("12.345.678/0001-90");
  });
  it("reformata mesmo quando já vem com pontuação", () => {
    expect(fmtCnpj("12.345.678/0001-90")).toBe("12.345.678/0001-90");
  });
  it("sem CNPJ (nulo ou vazio) mostra 'Não Cadastrado', nunca vazio", () => {
    expect(fmtCnpj(null)).toBe("Não Cadastrado");
    expect(fmtCnpj("")).toBe("Não Cadastrado");
    expect(fmtCnpj("   ")).toBe("Não Cadastrado");
  });
  it("formato inesperado (dígitos != 14) cai em 'Não Cadastrado'", () => {
    expect(fmtCnpj("123")).toBe("Não Cadastrado");
  });
  it("não introduz travessão em dash (§A.11)", () => {
    expect(fmtCnpj(null)).not.toContain("—");
  });
});

describe("cnpjDigitos: NORMALIZADO para a busca (só números)", () => {
  it("tira a pontuação do CNPJ", () => {
    expect(cnpjDigitos("12.345.678/0001-90")).toBe("12345678000190");
  });
  it("nulo/vazio vira string vazia (não casa nada)", () => {
    expect(cnpjDigitos(null)).toBe("");
  });
});

describe("rotuloCliente: NOME DA OPERAÇÃO, depois CNPJ, sem o código", () => {
  it("usa o nome da operação e o CNPJ formatado, nessa ordem", () => {
    const r = rotuloCliente({
      razaoSocial: "Alfa Comercio Ltda",
      nomeOperacao: "Loja Alfa Centro",
      cnpj: "12345678000190",
    });
    expect(r).toBe("Loja Alfa Centro · 12.345.678/0001-90");
  });
  it("NÃO mostra o código do cliente", () => {
    const r = rotuloCliente({
      razaoSocial: "Alfa",
      nomeOperacao: "Loja Alfa",
      cnpj: "12345678000190",
    });
    expect(r).not.toContain("COD");
    expect(r).not.toMatch(/\d+\s·\sLoja/); // não começa por código·nome
  });
  it("sem nome operacional, cai para a razão social (o CNPJ continua)", () => {
    const r = rotuloCliente({
      razaoSocial: "Beta Servicos SA",
      nomeOperacao: null,
      cnpj: "12345678000190",
    });
    expect(r).toBe("Beta Servicos SA · 12.345.678/0001-90");
  });
  it("sem CNPJ, mostra 'Não Cadastrado' no lugar do número", () => {
    const r = rotuloCliente({
      razaoSocial: "Gama",
      nomeOperacao: "Operação Gama",
      cnpj: null,
    });
    expect(r).toBe("Operação Gama · Não Cadastrado");
  });
});
