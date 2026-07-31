import { describe, expect, it } from "vitest";
import { salarioParaCampo } from "./salario";

/**
 * PROVA PEDIDA NA OST: o salário NÃO "desconfigura" no modal.
 *
 * O relato do time era de comportamento, não de valor: o número mudava sozinho de um dia para o
 * outro. A causa não estava na exibição, estava na GRAVAÇÃO (o campo levava a forma canônica da API,
 * "1806.00", e o parser pt-BR do backend lia o ponto como milhar, multiplicando por 100 a cada
 * salvamento). Aqui se trava a metade da tela: o que o campo mostra é estável, determinístico e
 * idempotente, então reabrir o modal ou re-renderizar nunca muda o que está escrito.
 */
describe("salarioParaCampo", () => {
  it.each([
    ["1806.00", "1.806,00"],
    ["472200.00", "472.200,00"],
    ["2500.50", "2.500,50"],
    ["980.00", "980,00"],
  ])("valor canônico da API '%s' vira '%s' no campo", (api, campo) => {
    expect(salarioParaCampo(api)).toBe(campo);
  });

  it("REABRIR o modal dá sempre a MESMA string (determinístico)", () => {
    const primeira = salarioParaCampo("1806.00");
    const segunda = salarioParaCampo("1806.00");
    const terceira = salarioParaCampo("1806.00");
    expect(primeira).toBe(segunda);
    expect(segunda).toBe(terceira);
  });

  it("aplicar de novo sobre o próprio resultado NÃO reformata (era o risco levantado)", () => {
    const uma = salarioParaCampo("1806.00");
    expect(uma).toBe("1.806,00");
    // Um re-render que passasse o valor já formatado de volta pela função não pode inventar outro
    // número: "1.806,00" não é numérico para o `Number`, então volta como veio.
    expect(salarioParaCampo(uma)).toBe("1.806,00");
    expect(salarioParaCampo(salarioParaCampo(uma))).toBe("1.806,00");
  });

  it("o que o campo manda de volta reconverte no valor original (laço fechado com o backend)", () => {
    // Espelha a régua pt-BR do backend (`valor-monetario-br`): ponto é milhar, vírgula é decimal.
    const comoOBackendLe = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
    expect(comoOBackendLe(salarioParaCampo("1806.00"))).toBe(1806);
    expect(comoOBackendLe(salarioParaCampo("472200.00"))).toBe(472200);
    expect(comoOBackendLe(salarioParaCampo("2500.50"))).toBe(2500.5);
  });

  it("vazio e ausente viram campo vazio (segue pendência, não bloqueia)", () => {
    expect(salarioParaCampo(null)).toBe("");
    expect(salarioParaCampo(undefined)).toBe("");
    expect(salarioParaCampo("")).toBe("");
  });

  it("valor não numérico volta como veio, sem virar NaN na tela", () => {
    expect(salarioParaCampo("a combinar")).toBe("a combinar");
  });
});
