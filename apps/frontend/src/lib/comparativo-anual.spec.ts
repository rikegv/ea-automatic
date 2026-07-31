import { describe, expect, it } from "vitest";
import { deveCompararAnos, MINIMO_ANO_COMPARAVEL } from "./comparativo-anual";

/** Monta uma série de 12 meses com o total pedido concentrado em janeiro. */
function serie(atual: number, anterior: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    atual: i === 0 ? atual : 0,
    anterior: i === 0 ? anterior : 0,
  }));
}

describe("comparativo anual do Controle Gerencial", () => {
  it("o cenário de HOJE não compara: 2025 tem 7 admissões, que é resíduo de carga", () => {
    expect(deveCompararAnos(serie(2389, 7))).toBe(false);
  });

  it("sem nenhum dado do ano anterior, mostra só o ano corrente", () => {
    expect(deveCompararAnos(serie(2389, 0))).toBe(false);
  });

  it("com DOIS anos de operação, o comparativo aparece sozinho (o caso 2026 vs 2027)", () => {
    expect(deveCompararAnos(serie(180, 2389))).toBe(true);
  });

  it("o ano corrente só precisa ter começado: janeiro recém-aberto já compara", () => {
    expect(deveCompararAnos(serie(1, 2389))).toBe(true);
  });

  it("ano corrente ainda zerado não compara: não há o que comparar", () => {
    expect(deveCompararAnos(serie(0, 2389))).toBe(false);
  });

  it("o piso é do ano ANTERIOR e é exatamente o limiar", () => {
    expect(deveCompararAnos(serie(100, MINIMO_ANO_COMPARAVEL - 1))).toBe(false);
    expect(deveCompararAnos(serie(100, MINIMO_ANO_COMPARAVEL))).toBe(true);
  });
});
