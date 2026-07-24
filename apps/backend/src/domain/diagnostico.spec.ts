import { describe, expect, it } from "vitest";
import { calcularAlerta, type Dependencia, type Sinal } from "./diagnostico";

const sinal = (chave: string, total: number): Sinal => ({
  chave,
  rotulo: chave,
  total,
  itens: [],
});
const dep = (nome: string, estado: Dependencia["estado"]): Dependencia => ({
  nome,
  estado,
  detalhe: "",
  verificadoEm: "2026-07-23T00:00:00Z",
});

describe("calcularAlerta (Bloco 7): o que acende", () => {
  it("tudo zero e dependências ok: apagado", () => {
    const a = calcularAlerta([sinal("x", 0), sinal("y", 0)], sinal("fopag", 0), [dep("DB", "ok")]);
    expect(a.aceso).toBe(false);
    expect(a.total).toBe(0);
  });

  it("qualquer sinal do Bloco 1 acima de zero acende", () => {
    const a = calcularAlerta([sinal("perda", 3), sinal("y", 0)], sinal("fopag", 0), []);
    expect(a.aceso).toBe(true);
    expect(a.motivos.some((m) => m.includes("3"))).toBe(true);
  });

  it("cliente Fopag sem pasta acende (Bloco 2)", () => {
    const a = calcularAlerta([sinal("x", 0)], sinal("fopag", 1), []);
    expect(a.aceso).toBe(true);
  });

  it("dependência FORA acende", () => {
    const a = calcularAlerta([sinal("x", 0)], sinal("fopag", 0), [dep("Vertex", "fora")]);
    expect(a.aceso).toBe(true);
    expect(a.motivos.some((m) => m.toLowerCase().includes("fora"))).toBe(true);
  });

  it("NÃO acende por ruído: degradado e indisponivel não acendem sozinhos", () => {
    const a = calcularAlerta([sinal("x", 0)], sinal("fopag", 0), [
      dep("Fila", "degradado"),
      dep("Pandapé", "indisponivel"),
    ]);
    expect(a.aceso).toBe(false);
  });

  it("conta cada problema distinto para o badge", () => {
    const a = calcularAlerta([sinal("perda", 2), sinal("parado", 1)], sinal("fopag", 1), [
      dep("Vertex", "fora"),
    ]);
    expect(a.total).toBe(4);
  });
});
