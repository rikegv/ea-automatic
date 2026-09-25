import { describe, expect, it } from "vitest";
import {
  AVISO_ARQUIVO_UNICO,
  cabeOutroArquivo,
  MOTIVO_ARQUIVO_UNICO,
} from "./portal-arquivo-unico";

/**
 * A RÉGUA PURA DE UM ARQUIVO POR TIPO DE DOCUMENTO. O porquê dela está no topo do módulo; aqui fica
 * a prova de que ela é EXPLÍCITA e não "implícita porque a credencial aponta para um objeto".
 *
 * A pergunta que este arquivo responde é uma só: com um arquivo daquele tipo já em aberto, cabe
 * outro? Não cabe, e é isso que impede o sistema de ficar só com o verso.
 */
describe("um arquivo por tipo de documento, a régua", () => {
  it("sem nenhum envio em aberto, o candidato pode mandar o arquivo", () => {
    expect(cabeOutroArquivo({ enviosEmAberto: 0 })).toBe(true);
  });

  it("com um envio em aberto, NÃO cabe outro: é aqui que a frente deixaria de existir", () => {
    expect(cabeOutroArquivo({ enviosEmAberto: 1 })).toBe(false);
  });

  it("com mais de um em aberto (estado que não deveria existir), continua fechado", () => {
    // Defesa em profundidade: se algum caminho antigo tiver deixado dois em aberto, a régua não
    // pode "arredondar" para permitido e deixar o terceiro entrar.
    expect(cabeOutroArquivo({ enviosEmAberto: 2 })).toBe(false);
  });

  it("número sujo não abre a porta por acidente", () => {
    expect(cabeOutroArquivo({ enviosEmAberto: 1.7 })).toBe(false);
    expect(cabeOutroArquivo({ enviosEmAberto: Number.NaN })).toBe(true);
    expect(cabeOutroArquivo({ enviosEmAberto: -3 })).toBe(true);
  });
});

describe("o texto que o candidato lê", () => {
  it("diz o que fazer com frente e verso, e não é um erro seco", () => {
    expect(AVISO_ARQUIVO_UNICO).toMatch(/frente e o verso/i);
    expect(AVISO_ARQUIVO_UNICO).toMatch(/consultor/i);
  });

  it("§A.11: sem travessão", () => {
    expect(AVISO_ARQUIVO_UNICO).not.toContain("—");
  });
});

describe("o código do motivo é próprio, e não emprestado do teto", () => {
  it("distingue 'mandou dois arquivos' de 'esgotou as tentativas' na trilha", () => {
    expect(MOTIVO_ARQUIVO_UNICO).toBe("ARQUIVO_JA_ENVIADO");
    expect(MOTIVO_ARQUIVO_UNICO).not.toBe("TENTATIVAS_ESGOTADAS");
  });
});
