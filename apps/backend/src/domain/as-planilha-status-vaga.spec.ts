import { describe, expect, it } from "vitest";
import {
  STATUS_DE_PLANILHA_QUE_ENTRAM,
  agregarStatusDaPlanilha,
  normalizarStatusDaPlanilha,
  vagaDaPlanilhaEntra,
} from "./as-planilha-status-vaga";

/**
 * ─ A RÉGUA DO STATUS DA PLANILHA, PURA (F2/F3) ─────────────────────────────────────────────────
 *
 * §A.6: dado sintético. §A.11: sem travessão.
 */

describe("normalizarStatusDaPlanilha: tolera acento, caixa e gênero, e fecha o desconhecido", () => {
  it.each([
    ["Aberto", "ABERTO"],
    ["ABERTO", "ABERTO"],
    ["aberta", "ABERTO"],
    ["  aberto  ", "ABERTO"],
    ["Entregue", "ENTREGUE"],
    ["ENTREGUE", "ENTREGUE"],
    ["entregue", "ENTREGUE"],
    ["Fechado", "FECHADO"],
    ["fechada", "FECHADO"],
    ["Encerrado", "FECHADO"],
    ["Cancelado", "CANCELADO"],
    ["cancelada", "CANCELADO"],
  ] as const)("normaliza %s em %s", (bruto, esperado) => {
    expect(normalizarStatusDaPlanilha(bruto)).toBe(esperado);
  });

  it("status desconhecido vira OUTRO (presente e não reconhecido), nulo/vazio vira null (ausente)", () => {
    expect(normalizarStatusDaPlanilha("Em seleção")).toBe("OUTRO");
    expect(normalizarStatusDaPlanilha("stand by")).toBe("OUTRO");
    expect(normalizarStatusDaPlanilha(null)).toBeNull();
    expect(normalizarStatusDaPlanilha(undefined)).toBeNull();
    expect(normalizarStatusDaPlanilha("   ")).toBeNull();
  });
});

describe("vagaDaPlanilhaEntra: SÓ ABERTO e ENTREGUE entram", () => {
  it("entra em aberto e entregue, cru ou canônico", () => {
    expect(vagaDaPlanilhaEntra("Aberto")).toBe(true);
    expect(vagaDaPlanilhaEntra("ENTREGUE")).toBe(true);
    expect(vagaDaPlanilhaEntra("ABERTO")).toBe(true);
  });

  it("NÃO entra em fechado, cancelado, outro, ausente", () => {
    expect(vagaDaPlanilhaEntra("Fechado")).toBe(false);
    expect(vagaDaPlanilhaEntra("Cancelado")).toBe(false);
    expect(vagaDaPlanilhaEntra("Em seleção")).toBe(false);
    expect(vagaDaPlanilhaEntra(null)).toBe(false);
    expect(vagaDaPlanilhaEntra("")).toBe(false);
  });

  it("concorda com a lista FECHADA exportada, que é a fonte única da decisão", () => {
    expect([...STATUS_DE_PLANILHA_QUE_ENTRAM].sort()).toEqual(["ABERTO", "ENTREGUE"]);
    for (const token of STATUS_DE_PLANILHA_QUE_ENTRAM) {
      expect(vagaDaPlanilhaEntra(token)).toBe(true);
    }
  });
});

describe("agregarStatusDaPlanilha: fail-closed no conflito entre linhas da mesma vaga", () => {
  it("todas iguais e entrando: entra, com ENTREGUE preferido a ABERTO", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "aberta", "ABERTO"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Entregue"])).toBe("ENTREGUE");
  });

  it("qualquer linha que NÃO entra domina (fail-closed), e não entra", () => {
    expect(vagaDaPlanilhaEntra(agregarStatusDaPlanilha(["Aberto", "Fechado"]))).toBe(false);
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado"])).toBe("FECHADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Cancelado", "Fechado"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Em seleção"])).toBe("OUTRO");
  });

  it("nenhuma linha com status legível devolve null", () => {
    expect(agregarStatusDaPlanilha([null, undefined, "  "])).toBeNull();
    expect(agregarStatusDaPlanilha([])).toBeNull();
  });
});
