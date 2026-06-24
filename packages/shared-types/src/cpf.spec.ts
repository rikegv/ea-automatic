import { describe, expect, it } from "vitest";
import { isValidCpf, normalizeCpf, PAPEL, FRENTE } from "./index.js";

describe("isValidCpf", () => {
  it("aceita CPF válido com e sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejeita dígitos verificadores incorretos", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });

  it("rejeita sequências repetidas e tamanhos inválidos", () => {
    expect(isValidCpf("000.000.000-00")).toBe(false);
    expect(isValidCpf("111")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("normalizeCpf", () => {
  it("remove a máscara mantendo apenas dígitos", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
  });
});

describe("vocabulário de domínio", () => {
  it("expõe papéis e frentes esperados", () => {
    expect(PAPEL).toContain("COMUM");
    expect(FRENTE).toEqual(["AUDITORIA", "EXAME", "CADASTRO_CONTRATO"]);
  });
});
