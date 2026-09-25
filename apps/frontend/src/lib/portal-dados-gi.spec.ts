import { describe, expect, it } from "vitest";
import {
  CAMPOS_SEM_DOCUMENTO,
  ESTADO_CIVIL,
  GRAU_INSTRUCAO,
  RACA,
  camposVaziosDe,
  rotuloDaOpcao,
  separarCampos,
  valoresConfirmadosDe,
  type CampoVisto,
} from "./portal-dados-gi";

/**
 * A LÓGICA PURA DA PEÇA 1 (Portal para o G.I): deduplicação, o que sobrou vazio e os dicionários.
 * A regra de negócio é a do desenho (A3): confirma UMA vez, campo vazio ganha segunda chance, o
 * válido é sempre o do candidato.
 */
describe("dicionários do G.I", () => {
  it("os códigos de estadoCivil NÃO são a inicial da palavra (armadilha do GI-DADOS)", () => {
    expect(rotuloDaOpcao(ESTADO_CIVIL, "D")).toBe("Divorciado(a)");
    expect(rotuloDaOpcao(ESTADO_CIVIL, "Q")).toBe("Desquitado(a)");
    expect(rotuloDaOpcao(ESTADO_CIVIL, "V")).toBe("Viúvo(a)");
    expect(rotuloDaOpcao(ESTADO_CIVIL, "U")).toBe("União Estável");
  });

  it("grauInstrucao tem os 13 valores, incluindo C e D", () => {
    expect(GRAU_INSTRUCAO).toHaveLength(13);
    expect(GRAU_INSTRUCAO.map((o) => o.value)).toContain("C");
    expect(GRAU_INSTRUCAO.map((o) => o.value)).toContain("D");
  });

  it("raça tem os 6 valores e o Não Informado é o código 6", () => {
    expect(RACA).toHaveLength(6);
    expect(rotuloDaOpcao(RACA, "6")).toBe("Não Informado");
  });

  it("valor sem correspondência devolve o próprio código, nunca quebra", () => {
    expect(rotuloDaOpcao(RACA, "9")).toBe("9");
  });

  it("os campos sem documento são os cinco do desenho, na ordem", () => {
    expect(CAMPOS_SEM_DOCUMENTO.map((c) => c.campo)).toEqual([
      "raca",
      "grauInstrucao",
      "estadoCivil",
      "nacionalidade",
      "naturalidade",
    ]);
    // raça/grau/estado civil vêm de dicionário (select); nacionalidade/naturalidade são texto.
    expect(CAMPOS_SEM_DOCUMENTO.filter((c) => c.tipo === "select").map((c) => c.campo)).toEqual([
      "raca",
      "grauInstrucao",
      "estadoCivil",
    ]);
  });
});

describe("separarCampos (deduplicação)", () => {
  const campos = [
    { campo: "nome", rotulo: "Nome" },
    { campo: "nascimento", rotulo: "Nascimento" },
    { campo: "rgNumero", rotulo: "Número do RG" },
  ];

  it("campo já confirmado antes vira repetido; o resto é novo", () => {
    const { novos, repetidos } = separarCampos(campos, { nome: "Maria" });
    expect(repetidos.map((c) => c.campo)).toEqual(["nome"]);
    expect(novos.map((c) => c.campo)).toEqual(["nascimento", "rgNumero"]);
  });

  it("sem nada confirmado, tudo é novo", () => {
    const { novos, repetidos } = separarCampos(campos, {});
    expect(repetidos).toHaveLength(0);
    expect(novos).toHaveLength(3);
  });
});

describe("valoresConfirmadosDe e camposVaziosDe", () => {
  const vistos: Record<string, CampoVisto> = {
    nome: { rotulo: "Nome", valor: "Maria" },
    pis: { rotulo: "PIS", valor: "" },
    rgNumero: { rotulo: "Número do RG", valor: "123" },
  };

  it("só o campo com valor não vazio conta como confirmado (dedup)", () => {
    expect(valoresConfirmadosDe(vistos)).toEqual({ nome: "Maria", rgNumero: "123" });
  });

  it("o campo visto e vazio volta como pendente no passo final", () => {
    expect(camposVaziosDe(vistos)).toEqual([{ campo: "pis", rotulo: "PIS" }]);
  });

  it("um campo vazio NÃO entra na dedup, então um documento seguinte ainda o oferece", () => {
    // pis está vazio: não aparece nos confirmados, logo separarCampos o trata como novo de novo.
    const confirmados = valoresConfirmadosDe(vistos);
    const { novos } = separarCampos([{ campo: "pis", rotulo: "PIS" }], confirmados);
    expect(novos.map((c) => c.campo)).toEqual(["pis"]);
  });
});
