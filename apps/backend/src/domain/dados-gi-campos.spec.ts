import { describe, expect, it } from "vitest";
import { CAMPOS_GI, filtrarCamposGi } from "./dados-gi-campos";

/**
 * A ALLOWLIST FECHADA de `admissao_dados_gi`: só as chaves catalogadas viram coluna, e o valor é
 * validado por tipo. §A.6: nenhum valor é lido para nada além de validar formato.
 */
describe("filtrarCamposGi: allowlist fechada", () => {
  it("chave FORA do catálogo é descartada (não vira coluna nem rótulo)", () => {
    const r = filtrarCamposGi({ rgNumero: "12345", papel: "SUPER_ADMIN", cpf: "52998224725" });
    expect(r.update).toEqual({ rgNumero: "12345" });
    expect(r.rotulos).toEqual(["Número do RG"]);
    // O CPF NÃO tem coluna aqui (mora em `candidatos`), então nem entra.
    expect(Object.keys(r.update)).not.toContain("cpf");
  });

  it("valor não-string é descartado", () => {
    const r = filtrarCamposGi({ rgNumero: 12345 as unknown as string, pis: "12345678901" });
    expect(r.update).toEqual({ pis: "12345678901" });
  });

  it("valor vazio (após trim) é descartado", () => {
    const r = filtrarCamposGi({ rgNumero: "   ", pis: "12345678901" });
    expect(r.update).toEqual({ pis: "12345678901" });
  });

  it("valor longo demais é descartado (trava contra texto vazando pelo campo)", () => {
    const r = filtrarCamposGi({ nomeMae: "x".repeat(300) });
    expect(r.update).toEqual({});
  });

  it("data em formato inválido é descartada; data ISO passa", () => {
    expect(filtrarCamposGi({ rgDataEmissao: "14/03/1990" }).update).toEqual({});
    expect(filtrarCamposGi({ rgDataEmissao: "1990-03-14" }).update).toEqual({
      rgDataEmissao: "1990-03-14",
    });
  });

  it("UF é normalizada para 2 letras maiúsculas; UF inválida é descartada", () => {
    expect(filtrarCamposGi({ rgUf: "sp" }).update).toEqual({ rgUf: "SP" });
    expect(filtrarCamposGi({ rgUf: "S" }).update).toEqual({});
  });

  it("mapeia as chaves da extração para as colunas certas (RG, CTPS, CNH, endereço)", () => {
    const r = filtrarCamposGi({
      nomeMae: "Maria",
      nomePai: "Jose",
      cnhRegistro: "999",
      cep: "01001000",
      numeroEndereco: "10",
    });
    expect(r.update).toEqual({
      filiacaoNomeMae: "Maria",
      filiacaoNomePai: "Jose",
      cnhNumero: "999",
      endCep: "01001000",
      endNumero: "10",
    });
  });

  it("nenhuma coluna do catálogo escreve em `candidatos` (nome, cpf, sexo, banco)", () => {
    const colunas = Object.values(CAMPOS_GI).map((d) => d.coluna);
    for (const proibida of ["nome", "cpf", "sexo", "banco", "agencia", "conta"]) {
      expect(colunas).not.toContain(proibida);
    }
  });
});
