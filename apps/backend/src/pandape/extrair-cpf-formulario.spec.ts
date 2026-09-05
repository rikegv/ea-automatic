import { describe, expect, it } from "vitest";
import {
  CAMPO_NUMERO_CPF,
  ehCampoDeCpfDoTitular,
  extrairCpfDoFormulario,
} from "./extrair-cpf-formulario";

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
  /**
   * CASO ZELDA (idPreCollaborator 421114, 05/09/2026). O formulário trazia DOIS campos de CPF do
   * titular: "CPF" (válido, na posição 4) e "Número do CPF" (inválido, na 23), diferindo em um único
   * dígito. O Pandapé NÃO deixa editar o preenchimento do candidato, então o conserto tinha de ser
   * aqui: a régua antiga olhava só o rótulo exato "Número do CPF", achava o inválido e o job morria.
   */
  it("CASO ZELDA: acha o válido no campo 'CPF' quando o 'Número do CPF' não fecha o dígito", () => {
    const lista = answers(
      { fieldName: "Nome Completo", answer: "FULANO DE TAL" },
      { fieldName: "CPF", answer: CPF_VALIDO },
      { fieldName: "Data de Admissão", answer: "11/09/2026" },
      { fieldName: CAMPO_NUMERO_CPF, answer: "12345678900" },
    );
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO);
  });

  it("fica com o PRIMEIRO válido quando os dois rótulos fecham o dígito", () => {
    const lista = answers(
      { fieldName: "CPF", answer: CPF_VALIDO },
      { fieldName: CAMPO_NUMERO_CPF, answer: CPF_VALIDO_2 },
    );
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO);
  });

  it("aceita as variações de rótulo do titular, com acento, caixa e abreviação", () => {
    for (const rotulo of ["CPF", "cpf", " Nº do CPF ", "Numero do CPF", "CPF do candidato"]) {
      expect(ehCampoDeCpfDoTitular(rotulo)).toBe(true);
    }
  });

  /**
   * A recusa é a metade que importa: CPF de terceiro no formulário criaria a admissão NA PESSOA
   * ERRADA, que é dano pior do que o job falhar. A régua é allowlist, então rótulo desconhecido
   * também é recusado, mesmo sem estar na lista de qualificadores.
   */
  it("RECUSA CPF de terceiro, mesmo válido e mesmo aparecendo primeiro", () => {
    for (const rotulo of [
      "CPF do dependente",
      "CPF do cônjuge",
      "CPF do responsável",
      "CPF da mãe",
      "CPF do pai",
      "CPF de emergência",
      "CPF da empresa",
    ]) {
      expect(ehCampoDeCpfDoTitular(rotulo)).toBe(false);
      expect(extrairCpfDoFormulario(answers({ fieldName: rotulo, answer: CPF_VALIDO }))).toBe(
        undefined,
      );
    }
  });

  it("RECUSA rótulo com palavra desconhecida (allowlist, não blocklist)", () => {
    expect(ehCampoDeCpfDoTitular("CPF do avalista")).toBe(false);
    expect(ehCampoDeCpfDoTitular("CPF anterior da vaga antiga")).toBe(false);
    expect(ehCampoDeCpfDoTitular("Comprovante de CPF anexado")).toBe(false);
  });

  it("RECUSA rótulo que nem fala de CPF, mesmo com CPF válido no valor", () => {
    expect(ehCampoDeCpfDoTitular("Número do RG")).toBe(false);
    expect(ehCampoDeCpfDoTitular("Número do PIS")).toBe(false);
    expect(ehCampoDeCpfDoTitular(undefined)).toBe(false);
    expect(ehCampoDeCpfDoTitular(42)).toBe(false);
  });

  it("PULA o de terceiro e segue até o do titular", () => {
    const lista = answers(
      { fieldName: "CPF do dependente", answer: CPF_VALIDO_2 },
      { fieldName: "CPF", answer: CPF_VALIDO },
    );
    expect(extrairCpfDoFormulario(lista)).toBe(CPF_VALIDO);
  });
});
