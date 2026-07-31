import { describe, expect, it } from "vitest";
import { documentoSeAplica, exigeReservista, filtrarPorSexo } from "./documentos-por-sexo";

/**
 * OST do seletor de sexo. A régua padrão marca o Reservista como obrigatório para todo mundo, e a
 * exigência real é condicional. O caso que originou a OST: candidata gravada como MASCULINO teve o
 * Reservista cobrado e o prontuário travado.
 */
describe("exigência de documento por sexo", () => {
  it("só o sexo MASCULINO cobra Reservista", () => {
    expect(exigeReservista("MASCULINO")).toBe(true);
    expect(exigeReservista("FEMININO")).toBe(false);
  });

  it("sexo NÃO informado não cobra (não inventa pendência a partir de dado que ninguém deu)", () => {
    expect(exigeReservista(null)).toBe(false);
    expect(exigeReservista(undefined)).toBe(false);
    expect(exigeReservista("")).toBe(false);
  });

  it("os demais documentos passam sempre, qualquer que seja o sexo", () => {
    for (const sexo of ["MASCULINO", "FEMININO", null]) {
      expect(documentoSeAplica("RG", sexo)).toBe(true);
      expect(documentoSeAplica("CPF", sexo)).toBe(true);
      expect(documentoSeAplica("CTPS", sexo)).toBe(true);
    }
  });

  it("corrigir o sexo para FEMININO tira o Reservista da lista, sem mexer nos outros", () => {
    const entregues = ["RG", "CPF", "RESERVISTA", "CTPS"];
    expect(filtrarPorSexo(entregues, "FEMININO")).toEqual(["RG", "CPF", "CTPS"]);
    expect(filtrarPorSexo(entregues, "MASCULINO")).toEqual(entregues);
  });
});
