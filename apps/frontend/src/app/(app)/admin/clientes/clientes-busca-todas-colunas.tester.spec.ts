import { describe, expect, it } from "vitest";
import { normBusca } from "@/lib/busca-nome";
import { casaBuscaCliente, type ClienteBuscavel } from "@/lib/clientes-busca";

/**
 * TESTE INDEPENDENTE (§A.38): busca por TODAS as colunas na tela de Clientes.
 *
 * O gap de testabilidade reportado FOI FECHADO: o match virou função pura `casaBuscaCliente`
 * (`lib/clientes-busca.ts`), que o componente `admin/clientes/page.tsx` consome. Este teste importa a
 * função REAL, então divergência do componente quebra o teste. A régua de normalização continua sendo
 * a `normBusca` (a mesma da Esteira), coberta à parte abaixo.
 */

type ClienteBusca = ClienteBuscavel;
const casaEmQualquerColuna = casaBuscaCliente;

describe("normBusca: a régua importada da tela, sem acento e sem caixa", () => {
  it("normBusca('JOSÉ') casa 'jose'", () => {
    expect(normBusca("JOSÉ")).toBe("jose");
  });

  it("ignora caixa e espaços nas bordas", () => {
    expect(normBusca("  Operação ABC  ")).toBe("operacao abc");
  });
});

describe("busca por TODAS as colunas (réplica do match inline)", () => {
  const cliente: ClienteBusca = {
    codCliente: "C-1042",
    razaoSocial: "Soluções Atlântico Ltda",
    cnpj: "11.222.333/0001-81",
    nomeOperacao: "Operação Zona Sul",
    empresaVinculo: "Grupo Soulan Serviços",
    cnpjVinculo: "99.888.777/0001-66",
    tipoServicoRotulo: "Terceirização",
    ativo: true,
  };

  it("casa pelo CÓDIGO", () => {
    expect(casaEmQualquerColuna(cliente, "1042")).toBe(true);
  });

  it("casa pela RAZÃO SOCIAL, ignorando acento", () => {
    expect(casaEmQualquerColuna(cliente, "atlantico")).toBe(true);
  });

  it("casa pelo CNPJ (com a máscara digitada)", () => {
    expect(casaEmQualquerColuna(cliente, "11.222.333")).toBe(true);
  });

  it("casa pelo NOME DA OPERAÇÃO", () => {
    expect(casaEmQualquerColuna(cliente, "zona sul")).toBe(true);
  });

  it("casa pela EMPRESA DE VÍNCULO", () => {
    expect(casaEmQualquerColuna(cliente, "soulan")).toBe(true);
  });

  it("casa pelo CNPJ DE VÍNCULO", () => {
    expect(casaEmQualquerColuna(cliente, "99.888.777")).toBe(true);
  });

  it("casa pelo RÓTULO DO TIPO DE SERVIÇO, ignorando acento", () => {
    expect(casaEmQualquerColuna(cliente, "terceirizacao")).toBe(true);
  });

  it("NÃO casa termo que não está em coluna nenhuma", () => {
    expect(casaEmQualquerColuna(cliente, "petrobras")).toBe(false);
  });

  it("colunas de vínculo nulas não quebram a busca pelas demais", () => {
    const semVinculo: ClienteBusca = {
      codCliente: "C-2",
      razaoSocial: "Empresa Sem Vinculo ME",
      cnpj: null,
      nomeOperacao: null,
      empresaVinculo: null,
      cnpjVinculo: null,
      tipoServicoRotulo: null,
      ativo: true,
    };
    expect(casaEmQualquerColuna(semVinculo, "sem vinculo")).toBe(true);
    expect(casaEmQualquerColuna(semVinculo, "qualquer")).toBe(false);
  });

  it("busca vazia não filtra ninguém", () => {
    expect(casaEmQualquerColuna(cliente, "")).toBe(true);
    expect(casaEmQualquerColuna(cliente, "   ")).toBe(true);
  });
});
