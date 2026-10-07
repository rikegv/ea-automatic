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
 * NA AGREGAÇÃO (07/10/2026) a ABERTA ganha da FECHADA: código com linha aberta e linha fechada é
 * código REUSADO no passado, onde uma vaga fechou e outra está aberta, então ele aparece.
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

describe("agregarStatusDaPlanilha: a ABERTA ganha da FECHADA, e escolhe o TOKEN, não a visibilidade", () => {
  it("todas iguais e de vaga viva: ABERTO quando houver linha aberta, senão ENTREGUE", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "aberta", "ABERTO"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Entregue", "ENTREGUE"])).toBe("ENTREGUE");
  });

  it("HAVENDO linha de vaga viva, ela domina o token: código misto é código reusado", () => {
    // O fundamento do diretor: uma vaga daquele código fechou, a outra está aberta. Aparece.
    expect(agregarStatusDaPlanilha(["Aberta", "Fechada"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberta", "Cancelada"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Entregue", "Fechada"])).toBe("ENTREGUE");
    expect(agregarStatusDaPlanilha(["Aberta", "Entregue", "Fechada"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Em seleção"])).toBe("ABERTO");
  });

  it("SEM nenhuma linha de vaga viva, o encerramento decide (CANCELADO antes de FECHADO)", () => {
    expect(agregarStatusDaPlanilha(["Fechada"])).toBe("FECHADO");
    expect(agregarStatusDaPlanilha(["Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Fechada", "Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Em seleção"])).toBe("OUTRO");
    expect(agregarStatusDaPlanilha(["Em seleção", "Fechada"])).toBe("FECHADO");
  });

  it("CANÁRIO DA DECISÃO: o código misto, depois da agregação, NÃO é escondido", () => {
    for (const misto of [
      ["Aberta", "Fechada"],
      ["Aberta", "Cancelada"],
      ["Aberta", "Entregue", "Fechada"],
      ["Entregue", "Fechada"],
    ]) {
      expect(
        vagaDaPlanilhaSai(agregarStatusDaPlanilha(misto)),
        `${JSON.stringify(misto)} tem linha viva, NÃO pode sair da fila`,
      ).toBe(false);
    }
    // E o que NÃO tem linha viva continua saindo: a mudança não afrouxou o encerramento.
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha(["Fechada", "Cancelada"]))).toBe(true);
  });

  it("nenhuma linha com status legível devolve null, e null não esconde a vaga", () => {
    expect(agregarStatusDaPlanilha([null, undefined, "  "])).toBeNull();
    expect(agregarStatusDaPlanilha([])).toBeNull();
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha([]))).toBe(false);
  });
});
