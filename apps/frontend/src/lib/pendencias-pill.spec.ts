import { describe, expect, it } from "vitest";
import { pillPendencias } from "./pendencias-pill";

/**
 * O BUG QUE ESTES TESTES TRAVAM: a coluna "Pendências Obrigatórias" lia **Parcial** numa admissão
 * cujo card, aberto no clique, listava **zero** pendência. Reproduzido em produção em duas admissões
 * vivas, ambas com `sinalizador = INCONFORMIDADE` (documento inconforme) e nenhuma pendência de campo.
 */
describe("pillPendencias — o pill concorda com o card", () => {
  it("ZERO pendência obrigatória lê Completo, mesmo com sinalizador INCONFORMIDADE", () => {
    // É EXATAMENTE o caso real: documento inconforme, nenhum campo obrigatório faltando.
    expect(pillPendencias("EM_ADMISSAO", "INCONFORMIDADE", false)).toEqual({
      tone: "ok",
      label: "Completo",
    });
  });

  it("zero pendência lê Completo qualquer que seja o enum gravado", () => {
    for (const sin of ["PARCIAL", "PENDENTE", "INCONFORMIDADE", "OK"]) {
      expect(pillPendencias("EM_ADMISSAO", sin, false).label).toBe("Completo");
    }
  });

  it("com pendência lê Parcial", () => {
    expect(pillPendencias("EM_ADMISSAO", "PARCIAL", true)).toEqual({ tone: "wn", label: "Parcial" });
    // Mesmo com o enum dizendo OK (enum defasado no banco): quem manda é a contagem viva.
    expect(pillPendencias("EM_ADMISSAO", "OK", true).label).toBe("Parcial");
  });

  it("declínio e rescisão leem Declínio, nunca Parcial nem Completo (§A.16, Bloco D)", () => {
    expect(pillPendencias("DECLINOU", "PARCIAL", true)).toEqual({ tone: "dg", label: "Declínio" });
    expect(pillPendencias("RESCISAO", "OK", false).label).toBe("Declínio");
  });

  it("Competências continua sendo estado próprio, não grau de preenchimento", () => {
    expect(pillPendencias("EM_ADMISSAO", "COMPETENCIAS", false)).toEqual({
      tone: "nt",
      label: "Competências",
    });
  });

  it("sem a contagem (resposta antiga) cai no enum, preservando o comportamento anterior", () => {
    expect(pillPendencias("EM_ADMISSAO", "OK", undefined).label).toBe("Completo");
    expect(pillPendencias("EM_ADMISSAO", "INCONFORMIDADE", undefined).label).toBe("Parcial");
    expect(pillPendencias("EM_ADMISSAO", "PENDENTE", undefined).label).toBe("Parcial");
  });

  it("nenhum rótulo usa travessão (§A.11)", () => {
    const casos = [
      pillPendencias("EM_ADMISSAO", "OK", false),
      pillPendencias("EM_ADMISSAO", "PARCIAL", true),
      pillPendencias("DECLINOU", "OK", false),
      pillPendencias("EM_ADMISSAO", "COMPETENCIAS", false),
    ];
    for (const c of casos) expect(c.label).not.toContain("—");
  });
});
