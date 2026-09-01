import { describe, expect, it } from "vitest";
import { mesmoNomeDeLoja, nomeLojaNormalizado } from "./loja";

/**
 * A NORMALIZAÇÃO É O CONTRATO ENTRE TRÊS LUGARES: o índice único do banco, a detecção de nome
 * repetido do catálogo e o casamento de nome das importações. Estes testes travam o comportamento
 * para que os três não divirjam, porque é da divergência que nasce a mesma loja cadastrada duas
 * vezes, que foi como o centro de custo chegou a 435 valores.
 */
describe("nomeLojaNormalizado", () => {
  it("as duplicatas REAIS do centro de custo (caixa e espaço) viram o mesmo nome", () => {
    const alvo = "LOJA CENTRO";
    expect(nomeLojaNormalizado("Loja Centro")).toBe(alvo);
    expect(nomeLojaNormalizado("LOJA CENTRO ")).toBe(alvo);
    expect(nomeLojaNormalizado("  loja   centro  ")).toBe(alvo);
    expect(nomeLojaNormalizado("Loja\tCentro")).toBe(alvo);
  });

  it("NÃO tira acento, e isso é decisão registrada, não esquecimento", () => {
    // `unaccent` não está instalada no banco e instalar extensão é escopo que ninguém pediu (§A.14).
    // Se um dia mudar, este teste é o lugar onde a mudança aparece.
    expect(nomeLojaNormalizado("Loja Sé")).not.toBe(nomeLojaNormalizado("Loja Se"));
  });

  it("não funde lojas diferentes só porque os nomes se parecem", () => {
    expect(nomeLojaNormalizado("Loja Centro 1")).not.toBe(nomeLojaNormalizado("Loja Centro 2"));
    expect(nomeLojaNormalizado("Morumbi")).not.toBe(nomeLojaNormalizado("Morumbi Shopping"));
  });

  it("mesmoNomeDeLoja responde a pergunta que a importação faz linha a linha", () => {
    expect(mesmoNomeDeLoja("Loja Morumbi", "  LOJA   MORUMBI ")).toBe(true);
    expect(mesmoNomeDeLoja("Loja Morumbi", "Loja Moema")).toBe(false);
  });
});
