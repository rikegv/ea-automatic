import { describe, expect, it } from "vitest";
import { equivalentesDoSlot } from "./documentos-equivalentes";

/**
 * OST A / Bloco 3 — a "Foto para Crachá" ocupa o slot "Foto 3x4" no checklist.
 *
 * Regressão do caso da Silvia: a foto chegou, foi auditada, gravou estado, e ficou INVISÍVEL na aba
 * Auditoria, porque o checklist é montado pela RÉGUA e `FOTO_CRACHA` não está em régua nenhuma.
 * O armazenamento estava certo (os dois tipos vão para a mesma subpasta do Drive); a exibição é que
 * não olhava lá.
 */
describe("equivalentesDoSlot (OST A / Bloco 3)", () => {
  it("o slot Foto 3x4 aceita a Foto para Crachá", () => {
    expect(equivalentesDoSlot("FOTO_3X4")).toContain("FOTO_CRACHA");
  });

  it("é tolerante à caixa do código", () => {
    expect(equivalentesDoSlot("foto_3x4")).toContain("FOTO_CRACHA");
  });

  it("slot sem equivalente devolve lista vazia (nenhum tipo se mistura por acidente)", () => {
    for (const codigo of ["RG", "CPF", "CTPS", "ASO", "FOTO_CRACHA", ""]) {
      expect(equivalentesDoSlot(codigo)).toHaveLength(0);
    }
  });
});
