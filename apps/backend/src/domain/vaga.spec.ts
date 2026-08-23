import { describe, expect, it } from "vitest";
import {
  codigoJaUsado,
  ladosDaVaga,
  normalizarCodigoVaga,
  vagasFechadasExcedemPosicoes,
} from "./vaga";

describe("normalizarCodigoVaga", () => {
  it("apara espaço e sobe a caixa", () => {
    expect(normalizarCodigoVaga("  sl123 ")).toBe("SL123");
  });

  it("PRESERVA as letras da família SL (a limpeza antiga apagava e fundia códigos distintos)", () => {
    expect(normalizarCodigoVaga("SL0042")).toBe("SL0042");
    expect(normalizarCodigoVaga("511805")).toBe("511805");
  });
});

describe("codigoJaUsado (a trava um código = um processo seletivo)", () => {
  it("código já usado no sistema é duplicidade, e é o que a trava barra", () => {
    expect(codigoJaUsado("511805", ["511805"])).toBe(true);
  });

  it("código inédito passa", () => {
    expect(codigoJaUsado("999999", ["511805", "SL0042"])).toBe(false);
  });

  it("a comparação é normalizada: espaço e caixa não abrem uma porta lateral", () => {
    expect(codigoJaUsado(" sl123 ", ["SL123"])).toBe(true);
  });

  it("MESMO cliente e MESMO cargo com códigos DIFERENTES é o caso correto, e não é barrado", () => {
    // Duas aberturas do mesmo cargo no mesmo cliente: cada processo gerou o seu número.
    expect(codigoJaUsado("511806", ["511805"])).toBe(false);
  });

  it("sem nenhuma vaga cadastrada, nada conflita", () => {
    expect(codigoJaUsado("511805", [])).toBe(false);
  });
});

describe("ladosDaVaga (a contraparte da abertura)", () => {
  const EU = "11111111-1111-1111-1111-111111111111";
  const OUTRO = "22222222-2222-2222-2222-222222222222";

  it("recruiter abrindo: ele mesmo vira o recruiter, e o consultor é o escolhido", () => {
    expect(ladosDaVaga("RECRUITER", EU, OUTRO)).toEqual({ recruiterId: EU, consultorId: OUTRO });
  });

  it("consultor abrindo: ele mesmo vira o consultor, e o recruiter é o escolhido", () => {
    expect(ladosDaVaga("CONSULTOR", EU, OUTRO)).toEqual({ consultorId: EU, recruiterId: OUTRO });
  });

  it("sem a contraparte escolhida, o lado de quem abre continua carimbado", () => {
    expect(ladosDaVaga("RECRUITER", EU, null)).toEqual({ recruiterId: EU, consultorId: null });
  });

  it("quem não tem papel de A&S não carimba lado nenhum", () => {
    expect(ladosDaVaga(null, EU, OUTRO)).toEqual({ consultorId: null, recruiterId: null });
  });
});

describe("vagasFechadasExcedemPosicoes", () => {
  it("fechar mais do que abriu é o que a trava barra", () => {
    expect(vagasFechadasExcedemPosicoes(3, 2)).toBe(true);
  });

  it("fechar tudo ou fechar menos passa", () => {
    expect(vagasFechadasExcedemPosicoes(2, 2)).toBe(false);
    expect(vagasFechadasExcedemPosicoes(1, 2)).toBe(false);
  });

  it("não informar quantas fecharam não é erro", () => {
    expect(vagasFechadasExcedemPosicoes(null, 2)).toBe(false);
    expect(vagasFechadasExcedemPosicoes(undefined, 2)).toBe(false);
  });
});
