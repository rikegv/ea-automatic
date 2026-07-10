import { describe, expect, it } from "vitest";
import { parseBeneficiosPadrao } from "./beneficios";

describe("parseBeneficiosPadrao", () => {
  it("extrai VR e AM do formato real do front e ignora benefício sem valor (VT)", () => {
    const entrada =
      "VR (Vale-Refeição): 500,00, AM (Assistência Médica): 300,00, VT (Vale-Transporte)";
    expect(parseBeneficiosPadrao(entrada)).toEqual([
      { beneficio: "VR", valor: "500,00" },
      { beneficio: "AM", valor: "300,00" },
    ]);
  });

  it("preserva a vírgula decimal do valor (500,00 não vira 500)", () => {
    const r = parseBeneficiosPadrao("VR (Vale-Refeição): 500,00");
    expect(r).toEqual([{ beneficio: "VR", valor: "500,00" }]);
  });

  it("aceita a chave sem rótulo entre parênteses (AM: 300,00)", () => {
    expect(parseBeneficiosPadrao("AM: 300,00")).toEqual([{ beneficio: "AM", valor: "300,00" }]);
  });

  it("ignora benefícios que não são VR nem AM", () => {
    expect(parseBeneficiosPadrao("VT (Vale-Transporte): 200,00")).toEqual([]);
  });

  it("ignora tokens sem ': ' (benefício sem valor)", () => {
    expect(parseBeneficiosPadrao("VR (Vale-Refeição)")).toEqual([]);
  });

  it("trata entrada vazia/nula", () => {
    expect(parseBeneficiosPadrao("")).toEqual([]);
    expect(parseBeneficiosPadrao(null)).toEqual([]);
    expect(parseBeneficiosPadrao(undefined)).toEqual([]);
  });
});
