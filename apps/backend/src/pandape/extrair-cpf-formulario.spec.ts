import { describe, expect, it } from "vitest";
import { CAMPO_NUMERO_CPF, extrairCpfDoFormulario } from "./extrair-cpf-formulario";

/**
 * Fallback do CPF pelo formulário do processo admissional (caso Carlos Eduardo, 06/08/2026).
 *
 * Os CPFs aqui são SINTÉTICOS, com dígito verificador calculado só para o teste: nenhum dado real de
 * candidato entra em suite (§A.6).
 */
const CPF_VALIDO = "52998224725";
const CPF_VALIDO_2 = "11144477735";

/** Monta o `answers[]` como a v1 devolve: lista plana de `{ answer, fieldName }`. */
function answers(...pares: { fieldName: string; answer: unknown }[]): unknown[] {
  return pares.map((p) => ({ ...p, externalName: null }));
}

describe("extrairCpfDoFormulario", () => {
  it("acha o CPF pelo rótulo 'Número do CPF'", () => {
    const lista = answers(
      { fieldName: "Nome completo", answer: "FULANO DE TAL" },
      { fieldName: CAMPO_NUMERO_CPF, answer: CPF_VALIDO },
    );
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO);
  });

  it("tira a máscara antes de validar (o candidato digita com pontuação)", () => {
    const lista = answers({ fieldName: CAMPO_NUMERO_CPF, answer: "529.982.247-25" });
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO);
  });

  it("tolera caixa e espaço sobrando no rótulo", () => {
    const lista = answers({ fieldName: "  número do cpf  ", answer: CPF_VALIDO });
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO);
  });

  it("RECUSA o CPF do formulário quando o dígito não fecha", () => {
    const lista = answers({ fieldName: CAMPO_NUMERO_CPF, answer: "12345678900" });
    expect(extrairCpfDoFormulario(lista)).toBeUndefined();
  });

  it("RECUSA o zerado, que é o próprio caso que originou a regra", () => {
    const lista = answers({ fieldName: CAMPO_NUMERO_CPF, answer: "000.000.000-00" });
    expect(extrairCpfDoFormulario(lista)).toBeUndefined();
  });

  it("devolve undefined quando o campo não existe, sem olhar outros campos", () => {
    const lista = answers(
      { fieldName: "Número do RG", answer: CPF_VALIDO },
      { fieldName: "Nome da mãe", answer: "FULANA" },
    );
    expect(extrairCpfDoFormulario(lista)).toBeUndefined();
  });

  it("não quebra com payload ausente, vazio ou fora do formato", () => {
    expect(extrairCpfDoFormulario(undefined)).toBeUndefined();
    expect(extrairCpfDoFormulario([])).toBeUndefined();
    expect(extrairCpfDoFormulario([null, "texto solto", 42, { semCampos: true }])).toBeUndefined();
    expect(
      extrairCpfDoFormulario([{ fieldName: CAMPO_NUMERO_CPF, answer: { nao: "é string" } }]),
    ).toBeUndefined();
  });

  it("fica com o PRIMEIRO válido quando o formulário repete o campo", () => {
    const lista = answers(
      { fieldName: CAMPO_NUMERO_CPF, answer: CPF_VALIDO },
      { fieldName: CAMPO_NUMERO_CPF, answer: CPF_VALIDO_2 },
    );
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO);
  });

  it("PULA o inválido e segue até achar um válido no mesmo rótulo", () => {
    const lista = answers(
      { fieldName: CAMPO_NUMERO_CPF, answer: "00000000000" },
      { fieldName: CAMPO_NUMERO_CPF, answer: CPF_VALIDO_2 },
    );
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO_2);
  });
});
