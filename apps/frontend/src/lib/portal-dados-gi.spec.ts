import { describe, expect, it } from "vitest";
import {
  CAMPOS_SEM_DOCUMENTO,
  ESTADO_CIVIL,
  GRAU_INSTRUCAO,
  NACIONALIDADE,
  PRE_SELECIONADOS_PASSO_FINAL,
  RACA,
  UF_NASCIMENTO,
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
    // OS CINCO são lista fechada: o G.I recusa texto livre em todos eles. Esta expectativa antes
    // afirmava que nacionalidade e naturalidade eram TEXTO, e estava errada à luz do contrato: a
    // `description` dos dois campos traz catálogo (254 códigos e 27 siglas de UF).
    expect(CAMPOS_SEM_DOCUMENTO.every((c) => c.tipo === "select")).toBe(true);
  });

  it("naturalidade é a SIGLA DA UF, 27 opções, e o rótulo diz isso ao candidato", () => {
    const campo = CAMPOS_SEM_DOCUMENTO.find((c) => c.campo === "naturalidade");
    expect(campo?.rotulo).toBe("UF De Nascimento");
    expect(UF_NASCIMENTO).toHaveLength(27);
    // máx 2 caracteres no G.I: nenhuma opção pode estourar.
    expect(UF_NASCIMENTO.every((o) => o.value.length === 2)).toBe(true);
    expect(UF_NASCIMENTO[0]?.value).toBe("AC");
    expect(UF_NASCIMENTO.map((o) => o.value)).toContain("SP");
    expect(rotuloDaOpcao(UF_NASCIMENTO, "RJ")).toBe("RJ");
  });

  it("nacionalidade tem os 254 códigos, Brasileiro primeiro, e nenhum estoura os 3 caracteres", () => {
    expect(NACIONALIDADE).toHaveLength(254);
    // `010` é o default do G.I e o caso de quase todo candidato: primeira opção, não a 1a alfabética.
    expect(NACIONALIDADE[0]).toEqual({ value: "010", label: "010 - Brasileiro" });
    expect(NACIONALIDADE.every((o) => o.value.length <= 3)).toBe(true);
    expect(new Set(NACIONALIDADE.map((o) => o.value)).size).toBe(254);
    expect(rotuloDaOpcao(NACIONALIDADE, "021")).toBe("021 - Argentino");
  });

  it("o CÓDIGO está no rótulo de toda nacionalidade, com hífen simples, para a busca achar", () => {
    // A BUSCA DO SELETOR FILTRA PELO `label`. Esta é a expectativa que trava o motivo da mudança:
    // sem o código no rótulo, digitar "010" numa lista de 254 opções não achava nada.
    expect(NACIONALIDADE.every((o) => o.label.startsWith(`${o.value} - `))).toBe(true);
    // §A.11: hífen simples, nunca travessão, que é também o formato da `description` do G.I.
    expect(NACIONALIDADE.filter((o) => o.label.includes("\u2014"))).toEqual([]);
    // O nome continua inteiro depois do código: o rótulo ganhou o código, não perdeu o nome.
    expect(rotuloDaOpcao(NACIONALIDADE, "010")).toBe("010 - Brasileiro");
  });

  it("o passo final pré-seleciona SÓ a nacionalidade, em Brasileiro, e nada mais", () => {
    // O passo final só envia campo com valor não vazio: pré-selecionar é o que faz o campo SER
    // enviado. Os outros quatro ficam vazios de propósito (não há default do G.I que sirva a todos).
    expect(PRE_SELECIONADOS_PASSO_FINAL).toEqual({ nacionalidade: "010" });
    const pre = Object.keys(PRE_SELECIONADOS_PASSO_FINAL);
    expect(pre.every((campo) => CAMPOS_SEM_DOCUMENTO.some((c) => c.campo === campo))).toBe(true);
    // O código pré-selecionado existe no dicionário: pré-seleção que não casa com opção nenhuma
    // apareceria na tela como o código cru, e seria recusada pelo G.I.
    expect(NACIONALIDADE.some((o) => o.value === PRE_SELECIONADOS_PASSO_FINAL.nacionalidade)).toBe(true);
  });

  it("nenhum rótulo de opção tem travessão (§A.11), em nenhum dos cinco dicionários", () => {
    const todos = [...RACA, ...GRAU_INSTRUCAO, ...ESTADO_CIVIL, ...NACIONALIDADE, ...UF_NASCIMENTO];
    expect(todos.filter((o) => o.label.includes("\u2014"))).toEqual([]);
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
