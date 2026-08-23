import { describe, expect, it } from "vitest";
import {
  OPCAO_OUTRA,
  REGIAO_OUTRAS,
  REGIOES_POR_UF,
  UFS,
  VAGA_ETAPAS_PS,
  VAGA_FAIXA_ETARIA,
  VAGA_IDIOMAS,
  exigeTempoContrato,
  nomeDaUf,
  regiaoPertenceAUf,
  regioesDaUf,
  separarOpcaoEscape,
} from "./index";

describe("exigeTempoContrato (item 2: o campo só aparece em vínculo com prazo)", () => {
  it("os três vínculos com prazo pedem o tempo", () => {
    expect(exigeTempoContrato("TEMPORARIO")).toBe(true);
    expect(exigeTempoContrato("ESTAGIO")).toBe(true);
    expect(exigeTempoContrato("JOVEM_APRENDIZ")).toBe(true);
  });

  it("os demais NÃO pedem, e é o que esconde o campo em vaga efetiva", () => {
    for (const v of ["EFETIVO", "PJ", "TERCEIRIZADO", "INTERNO", "FOPAG"]) {
      expect(exigeTempoContrato(v)).toBe(false);
    }
  });

  it("vínculo ainda não escolhido não pede tempo (o campo nasce escondido)", () => {
    expect(exigeTempoContrato(null)).toBe(false);
    expect(exigeTempoContrato(undefined)).toBe(false);
    expect(exigeTempoContrato("")).toBe(false);
  });
});

describe("catálogo de regiões (item 7: nível Brasil)", () => {
  it("cobre as 27 unidades da federação, sem sobra nem falta", () => {
    expect(UFS).toHaveLength(27);
    expect(Object.keys(REGIOES_POR_UF)).toHaveLength(27);
    for (const { uf } of UFS) expect(REGIOES_POR_UF[uf], `faltou ${uf}`).toBeDefined();
  });

  it("todo estado fecha com Outras, que é a válvula de escape da lista", () => {
    for (const { uf } of UFS) {
      const regioes = REGIOES_POR_UF[uf];
      expect(regioes[regioes.length - 1], `${uf} não fecha com Outras`).toBe(REGIAO_OUTRAS);
    }
  });

  it("nenhum estado repete região, e nenhum fica só com o escape", () => {
    for (const { uf } of UFS) {
      const regioes = REGIOES_POR_UF[uf];
      expect(new Set(regioes).size, `${uf} tem região repetida`).toBe(regioes.length);
      expect(regioes.length, `${uf} só tem o escape`).toBeGreaterThan(1);
    }
  });

  it("nenhum rótulo usa travessão (§A.11)", () => {
    for (const { uf, nome } of UFS) {
      expect(nome).not.toContain("—");
      for (const r of REGIOES_POR_UF[uf]) expect(r, `${uf}: ${r}`).not.toContain("—");
    }
  });

  it("SP mantém o recorte JÁ VALIDADO pelo diretor, sem alteração (§A.14)", () => {
    expect(REGIOES_POR_UF.SP).toEqual([
      "São Paulo capital",
      "Zona Norte",
      "Zona Sul",
      "Zona Leste",
      "Zona Oeste",
      "Centro",
      "ABC (Santo André, São Bernardo, São Caetano, Diadema)",
      "Guarulhos",
      "Osasco, Barueri e Alphaville",
      "Grande SP (demais)",
      "Interior de SP",
      "Outras",
    ]);
  });
});

describe("regioesDaUf (o encadeamento: sem estado, a segunda lista nasce fechada)", () => {
  it("sem UF devolve lista vazia", () => {
    expect(regioesDaUf(null)).toEqual([]);
    expect(regioesDaUf(undefined)).toEqual([]);
    expect(regioesDaUf("")).toEqual([]);
  });

  it("UF desconhecida devolve vazio em vez de quebrar", () => {
    expect(regioesDaUf("XX")).toEqual([]);
  });

  it("com UF devolve as regiões daquele estado", () => {
    expect(regioesDaUf("RJ")).toContain("Baixada Fluminense (Nova Iguaçu, Duque de Caxias, Belford Roxo)");
  });
});

describe("regiaoPertenceAUf (a régua que o backend aplica antes de gravar)", () => {
  it("aceita a região do próprio estado", () => {
    expect(regiaoPertenceAUf("SP", "Zona Leste")).toBe(true);
  });

  it("RECUSA região de outro estado, que é o caso que um @IsIn com a união deixaria passar", () => {
    expect(regiaoPertenceAUf("CE", "Zona Leste")).toBe(false);
    expect(regiaoPertenceAUf("SP", "Sobral")).toBe(false);
  });

  it("recusa qualquer coisa quando a UF não existe", () => {
    expect(regiaoPertenceAUf("XX", "Zona Leste")).toBe(false);
  });
});

describe("nomeDaUf", () => {
  it("resolve a sigla em nome", () => {
    expect(nomeDaUf("MG")).toBe("Minas Gerais");
    expect(nomeDaUf("DF")).toBe("Distrito Federal");
  });

  it("sigla desconhecida volta como veio, nunca quebra a exibição", () => {
    expect(nomeDaUf("XX")).toBe("XX");
  });
});

describe("separarOpcaoEscape (reabrir a vaga sem perder o que estava fora do catálogo)", () => {
  it("valor da lista volta como opção escolhida", () => {
    expect(separarOpcaoEscape("30 a 50 anos", VAGA_FAIXA_ETARIA, OPCAO_OUTRA)).toEqual({
      opcao: "30 a 50 anos",
      texto: "",
    });
  });

  it("valor FORA da lista volta pelo escape, com o texto preservado", () => {
    expect(separarOpcaoEscape("Acima de 60 anos", VAGA_FAIXA_ETARIA, OPCAO_OUTRA)).toEqual({
      opcao: OPCAO_OUTRA,
      texto: "Acima de 60 anos",
    });
  });

  it("vazio é ausência de resposta, e não o escape em branco", () => {
    expect(separarOpcaoEscape(null, VAGA_FAIXA_ETARIA, OPCAO_OUTRA)).toEqual({
      opcao: "",
      texto: "",
    });
    expect(separarOpcaoEscape("   ", VAGA_FAIXA_ETARIA, OPCAO_OUTRA)).toEqual({
      opcao: "",
      texto: "",
    });
  });

  it("o próprio sentinela gravado NÃO vira opção muda: cai no escape, para a pessoa reescrever", () => {
    expect(separarOpcaoEscape(OPCAO_OUTRA, VAGA_FAIXA_ETARIA, OPCAO_OUTRA)).toEqual({
      opcao: OPCAO_OUTRA,
      texto: OPCAO_OUTRA,
    });
  });
});

describe("listas do item 6 (valores aprovados pelo diretor)", () => {
  it("idiomas fecham com Outros", () => {
    expect(VAGA_IDIOMAS).toEqual([
      "Inglês",
      "Espanhol",
      "Francês",
      "Italiano",
      "Alemão",
      "Mandarim",
      "Libras",
      "Outros",
    ]);
  });

  it("etapas do processo seletivo fecham com Outra, na ordem em que acontecem", () => {
    expect(VAGA_ETAPAS_PS[0]).toBe("Entrevista com RH");
    expect(VAGA_ETAPAS_PS[VAGA_ETAPAS_PS.length - 1]).toBe(OPCAO_OUTRA);
  });

  it("nenhum rótulo de lista usa travessão (§A.11)", () => {
    for (const v of [...VAGA_IDIOMAS, ...VAGA_FAIXA_ETARIA, ...VAGA_ETAPAS_PS]) {
      expect(v).not.toContain("—");
    }
  });
});
