import { describe, expect, it } from "vitest";
import {
  acabouDeCairParaOTime,
  AVISO_PENDENCIA_NO_TIME,
  queimaTentativa,
  situacaoDaPendencia,
  TETO_REPROVACOES_POR_PENDENCIA,
} from "./portal-tentativas";

/**
 * O TETO DE TENTATIVAS DO CANDIDATO, A RÉGUA PURA.
 *
 * O QUE PRECISA ESTAR TRAVADO AQUI é menos o número e mais O QUE CONTA: o teto conta REPROVAÇÃO,
 * nunca envio. Errar para o lado do envio transforma uma proteção contra laço em negação de serviço
 * contra o próprio candidato, e o atalho é tentador porque é uma linha mais curta.
 */

describe("o número, e ele é 3", () => {
  it("três reprovações na mesma pendência", () => {
    expect(TETO_REPROVACOES_POR_PENDENCIA).toBe(3);
  });
});

describe("O QUE QUEIMA TENTATIVA: o documento julgado e reprovado", () => {
  it("veredito negativo queima (INCONFORME e PENDENTE chegam os dois assim)", () => {
    expect(queimaTentativa({ tipo: "VEREDITO", valido: false })).toBe(true);
  });

  it("PDF que exige senha queima: é reprovação do documento, decidida sem gastar IA", () => {
    expect(queimaTentativa({ tipo: "RECUSA_DO_LEITOR", codigo: "PROTEGIDO_SENHA" })).toBe(true);
  });
});

describe("O QUE NÃO QUEIMA: e cada um destes seria negação de serviço contra o candidato", () => {
  it("envio APROVADO não queima nada", () => {
    expect(queimaTentativa({ tipo: "VEREDITO", valido: true })).toBe(false);
  });

  it("falha de infraestrutura não queima: o candidato nunca recebeu veredito nenhum", () => {
    // Leitor fora, tempo esgotado, cota da IA estourada, rede caída. A auditoria tem cauda medida de
    // 79 segundos e o Portal mata o processo aos 20: um celular lento queimaria as três tentativas.
    expect(queimaTentativa({ tipo: "FALHA" })).toBe(false);
  });

  it("recusa TÉCNICA não queima: é o arquivo que não coube, não o documento que não serve", () => {
    for (const codigo of ["TAMANHO", "PAGINAS", "DIMENSAO", "FORMATO", "HEIC", "TEMPO"]) {
      expect(queimaTentativa({ tipo: "RECUSA_DO_LEITOR", codigo })).toBe(false);
    }
  });

  it("conteúdo ativo não queima o candidato: é defesa nossa, não veredito sobre o papel dele", () => {
    expect(queimaTentativa({ tipo: "RECUSA_DO_LEITOR", codigo: "CONTEUDO_ATIVO" })).toBe(false);
  });
});

describe("A SITUAÇÃO DA PENDÊNCIA, do ponto de vista do candidato", () => {
  it("zero reprovação: três tentativas inteiras pela frente", () => {
    expect(situacaoDaPendencia({ reprovacoes: 0 })).toEqual({ noTime: false, restantes: 3 });
  });

  it("duas reprovações ainda deixam a terceira, que é a margem", () => {
    expect(situacaoDaPendencia({ reprovacoes: 2 })).toEqual({ noTime: false, restantes: 1 });
  });

  it("na terceira, a pendência passa a ser do time", () => {
    expect(situacaoDaPendencia({ reprovacoes: 3 })).toEqual({ noTime: true, restantes: 0 });
  });

  it("acima do teto continua do time, e o restante nunca fica negativo", () => {
    expect(situacaoDaPendencia({ reprovacoes: 9 })).toEqual({ noTime: true, restantes: 0 });
  });
});

describe("O CARIMBO DA QUEDA é de borda, e não do último clique de quem insistiu", () => {
  it("só a tentativa que ATINGE o teto registra a queda", () => {
    expect(acabouDeCairParaOTime(2)).toBe(false);
    expect(acabouDeCairParaOTime(3)).toBe(true);
    expect(acabouDeCairParaOTime(4)).toBe(false);
  });
});

describe("A MENSAGEM AO CANDIDATO nunca é um erro seco", () => {
  it("diz que a equipe vai analisar e que não é preciso enviar de novo", () => {
    expect(AVISO_PENDENCIA_NO_TIME).toContain("equipe vai analisar");
    expect(AVISO_PENDENCIA_NO_TIME).toContain("não é preciso enviar de novo");
  });

  it("§A.11: sem travessão", () => {
    expect(AVISO_PENDENCIA_NO_TIME).not.toContain(String.fromCharCode(0x2014));
  });
});
