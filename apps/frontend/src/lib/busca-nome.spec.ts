import { describe, expect, it } from "vitest";
import { normBusca } from "./busca-nome";

describe("normBusca: a régua única da busca por nome", () => {
  it("ignora acento", () => {
    expect(normBusca("JOSÉ ANTÔNIO")).toBe("jose antonio");
    expect(normBusca("Conceição")).toContain("conceicao");
  });

  it("ignora caixa", () => {
    expect(normBusca("MARIA")).toBe(normBusca("maria"));
  });

  it("apara espaço das pontas, para o termo digitado com folga ainda achar", () => {
    expect(normBusca("  ana  ")).toBe("ana");
  });

  it('digitar "jose" acha "JOSÉ DA SILVA"', () => {
    expect(normBusca("JOSÉ DA SILVA").includes(normBusca("jose"))).toBe(true);
  });
});
