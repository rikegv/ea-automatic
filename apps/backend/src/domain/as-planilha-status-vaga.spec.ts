import { describe, expect, it } from "vitest";
import {
  STATUS_DE_PLANILHA_QUE_SAEM,
  agregarStatusDaPlanilha,
  normalizarStatusDaPlanilha,
  vagaDaPlanilhaSai,
} from "./as-planilha-status-vaga";

/**
 * ─ A RÉGUA DO STATUS DA PLANILHA, PURA (F2/F3, OPÇÃO A) ────────────────────────────────────────
 *
 * A vaga APARECE por padrão; só FECHADO e CANCELADO a tiram de vista. Ausência de status, status
 * nulo e status desconhecido NÃO escondem vaga: o risco a evitar é perder vaga real de vista.
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

describe("vagaDaPlanilhaSai: SÓ FECHADO e CANCELADO saem", () => {
  it("SAI em fechado e cancelado, cru ou canônico", () => {
    expect(vagaDaPlanilhaSai("Fechado")).toBe(true);
    expect(vagaDaPlanilhaSai("FECHADO")).toBe(true);
    expect(vagaDaPlanilhaSai("Encerrada")).toBe(true);
    expect(vagaDaPlanilhaSai("Cancelado")).toBe(true);
    expect(vagaDaPlanilhaSai("CANCELADO")).toBe(true);
  });

  it("NÃO sai em aberto, entregue, outro, ausente: aparece por padrão", () => {
    expect(vagaDaPlanilhaSai("Aberto")).toBe(false);
    expect(vagaDaPlanilhaSai("ENTREGUE")).toBe(false);
    expect(vagaDaPlanilhaSai("Em seleção")).toBe(false);
    expect(vagaDaPlanilhaSai(null)).toBe(false);
    expect(vagaDaPlanilhaSai(undefined)).toBe(false);
    expect(vagaDaPlanilhaSai("")).toBe(false);
  });

  it("concorda com a lista FECHADA exportada, que é a fonte única da decisão", () => {
    expect([...STATUS_DE_PLANILHA_QUE_SAEM].sort()).toEqual(["CANCELADO", "FECHADO"]);
    for (const token of STATUS_DE_PLANILHA_QUE_SAEM) {
      expect(vagaDaPlanilhaSai(token)).toBe(true);
    }
  });
});

describe("agregarStatusDaPlanilha: NÃO alterada pela Opção A, escolhe o TOKEN, não a visibilidade", () => {
  it("todas iguais e de vaga viva: token de vaga viva, com ENTREGUE preferido a ABERTO", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "aberta", "ABERTO"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Entregue"])).toBe("ENTREGUE");
  });

  it("qualquer linha fora de ABERTO/ENTREGUE domina o token (prefere CANCELADO a FECHADO a OUTRO)", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado"])).toBe("FECHADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Cancelado", "Fechado"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Em seleção"])).toBe("OUTRO");
  });

  it("a visibilidade do token agregado segue a Opção A: só FECHADO/CANCELADO tiram a vaga de vista", () => {
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha(["Aberto", "Fechado"]))).toBe(true);
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha(["Aberto", "Cancelado"]))).toBe(true);
    // Conflito que agrega em OUTRO NÃO esconde a vaga: ninguém disse que ela fechou.
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha(["Aberto", "Em seleção"]))).toBe(false);
  });

  it("nenhuma linha com status legível devolve null, e null não esconde a vaga", () => {
    expect(agregarStatusDaPlanilha([null, undefined, "  "])).toBeNull();
    expect(agregarStatusDaPlanilha([])).toBeNull();
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha([]))).toBe(false);
  });
});
