import { describe, expect, it } from "vitest";
import { FRENTES_AO_NASCER, kitLiberado, podeAbrirCadastro, type EstadoFrente } from "./frentes";

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

describe("gate do kit (F9 / INT-4)", () => {
  it("libera somente com as TRÊS frentes concluídas", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
        { tipo: "CADASTRO_CONTRATO", concluida: true },
      ]),
    ).toBe(true);
  });

  it("bloqueia faltando o CADASTRO_CONTRATO (mesmo com Auditoria e Exame ok)", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
        { tipo: "CADASTRO_CONTRATO", concluida: false },
      ]),
    ).toBe(false);
  });

  it("bloqueia faltando o CADASTRO_CONTRATO (frente ausente)", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
      ]),
    ).toBe(false);
  });

  it("bloqueia faltando a AUDITORIA", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: false },
        { tipo: "EXAME", concluida: true },
        { tipo: "CADASTRO_CONTRATO", concluida: true },
      ]),
    ).toBe(false);
  });

  it("bloqueia faltando o EXAME", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: false },
        { tipo: "CADASTRO_CONTRATO", concluida: true },
      ]),
    ).toBe(false);
  });
});
