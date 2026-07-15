import { describe, expect, it } from "vitest";
import { calcularProgressoRegua, faltantesObrigatorios, type DocReguaEstado } from "./regua";

const doc = (
  nome: string,
  exigencia: DocReguaEstado["exigencia"],
  estado: DocReguaEstado["estado"],
): DocReguaEstado => ({ nome, exigencia, estado });

describe("faltantesObrigatorios (§A.3 regra 4)", () => {
  it("lista só obrigatórios não ENTREGUE, pelo nome", () => {
    const docs = [
      doc("RG", "OBRIGATORIO", "ENTREGUE"),
      doc("CPF", "OBRIGATORIO", "PENDENTE"),
      doc("Foto 3x4", "OBRIGATORIO", "INCONFORME"),
      doc("Currículo", "FACULTATIVO", null),
    ];
    expect(faltantesObrigatorios(docs)).toEqual(["CPF", "Foto 3x4"]);
  });

  it("ignora facultativos e não obrigatórios mesmo pendentes", () => {
    const docs = [
      doc("Currículo", "FACULTATIVO", null),
      doc("Cartão SUS", "NAO_OBRIGATORIO", "PENDENTE"),
    ];
    expect(faltantesObrigatorios(docs)).toEqual([]);
  });
});

describe("calcularProgressoRegua (ProgressoRegua — F2)", () => {
  it("conta entregues sobre o total de obrigatórios", () => {
    const docs = [
      doc("RG", "OBRIGATORIO", "ENTREGUE"),
      doc("CPF", "OBRIGATORIO", "ENTREGUE"),
      doc("Foto 3x4", "OBRIGATORIO", "PENDENTE"),
      doc("Currículo", "FACULTATIVO", "ENTREGUE"),
    ];
    const p = calcularProgressoRegua(docs);
    expect(p.obrigatoriosTotal).toBe(3);
    expect(p.obrigatoriosEntregues).toBe(2);
    expect(p.faltantes).toEqual(["Foto 3x4"]);
    expect(p.completa).toBe(false);
  });

  it("é completa quando todos os obrigatórios estão ENTREGUE", () => {
    const docs = [
      doc("RG", "OBRIGATORIO", "ENTREGUE"),
      doc("CPF", "OBRIGATORIO", "ENTREGUE"),
      doc("Currículo", "FACULTATIVO", null),
    ];
    const p = calcularProgressoRegua(docs);
    expect(p.completa).toBe(true);
    expect(p.faltantes).toEqual([]);
  });

  it("NÃO é completa quando a régua não tem obrigatórios (nada a arquivar)", () => {
    const docs = [
      doc("Currículo", "FACULTATIVO", "ENTREGUE"),
      doc("Cartão SUS", "NAO_OBRIGATORIO", "ENTREGUE"),
    ];
    const p = calcularProgressoRegua(docs);
    expect(p.obrigatoriosTotal).toBe(0);
    expect(p.completa).toBe(false);
  });
});
