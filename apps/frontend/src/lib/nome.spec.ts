import { describe, expect, it } from "vitest";
import { caixaAlta } from "./nome";

describe("caixaAlta", () => {
  it("sobe o nome inteiro para caixa alta", () => {
    expect(caixaAlta("Leandra Ferreira Da Silva Batista")).toBe(
      "LEANDRA FERREIRA DA SILVA BATISTA",
    );
  });

  it("respeita acento do português", () => {
    expect(caixaAlta("Palôma do Rosário Silva André")).toBe("PALÔMA DO ROSÁRIO SILVA ANDRÉ");
  });

  it("nome que já veio em caixa alta continua idêntico (a carga histórica é assim)", () => {
    const jaMaiusculo = "MARIA FERNANDA MARINS CARDOSO SILVA DOS SANTOS";
    expect(caixaAlta(jaMaiusculo)).toBe(jaMaiusculo);
  });

  it("vazio/ausente devolve string vazia, para o chamador aplicar o próprio fallback", () => {
    expect(caixaAlta("")).toBe("");
    expect(caixaAlta(null)).toBe("");
    expect(caixaAlta(undefined)).toBe("");
    expect(caixaAlta(null) || "não informado").toBe("não informado");
  });
});
