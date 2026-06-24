import { describe, expect, it } from "vitest";
import { FRENTES_AO_NASCER, podeAbrirCadastro, type EstadoFrente } from "./frentes";

describe("gate do Cadastro (§A.3 regra 3)", () => {
  it("não abre com nenhuma frente concluída", () => {
    const frentes: EstadoFrente[] = [
      { tipo: "AUDITORIA", concluida: false },
      { tipo: "EXAME", concluida: false },
    ];
    expect(podeAbrirCadastro(frentes)).toBe(false);
  });

  it("não abre com apenas uma das duas concluída (independência — regra 2)", () => {
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: false },
      ]),
    ).toBe(false);
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: false },
        { tipo: "EXAME", concluida: true },
      ]),
    ).toBe(false);
  });

  it("abre somente com AUDITORIA e EXAME concluídas", () => {
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
      ]),
    ).toBe(true);
  });
});

describe("nascimento paralelo (regra 1)", () => {
  it("AUDITORIA e EXAME nascem juntas; CADASTRO não", () => {
    expect(FRENTES_AO_NASCER).toEqual(["AUDITORIA", "EXAME"]);
    expect(FRENTES_AO_NASCER).not.toContain("CADASTRO_CONTRATO");
  });
});
