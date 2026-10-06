/**
 * QA INDEPENDENTE (§A.38) — CARGA INCREMENTAL DA CENTRAL DE CANDIDATOS (item 4 do
 * docs/MAPA-CENTRAL-CANDIDATOS-CONSERTO.md).
 *
 * Escrito por `tester` que NÃO escreveu o código (frontend). Cobre a ÚNICA peça pura que a frente
 * extraiu: `fraseDeProgressoDeCarga(carregados, total)`, o texto do indicador de progresso. O freio
 * em si (cadeia de setTimeout, pausa por foco, backoff 429, dedup e offset) vive INLINE no
 * `useEffect` de `app/(app)/as/candidatos/page.tsx` e não é pura: está listado como GAP no retorno.
 *
 * Réguas afirmadas aqui:
 *  - carregados < total  -> frase de PROGRESSO com as duas contagens;
 *  - carregados >= total -> frase de COBERTURA COMPLETA (usa `total`, nunca o excedente);
 *  - total <= 0          -> string vazia (o indicador some);
 *  - §A.6: a frase é CONTAGEM pura. Nunca nome, nunca CPF, nunca e-mail. Só números e o texto fixo.
 *  - §A.11: sem travessão (em dash U+2014).
 *  - §A.24: é frase de APOIO, não título nem tag, então só a PRIMEIRA letra é maiúscula.
 */

import { describe, expect, it } from "vitest";
import { fraseDeProgressoDeCarga } from "./as-candidatos";

// Assinatura real colada do fonte, para o teste travar a forma do contrato:
//   export function fraseDeProgressoDeCarga(carregados: number, total: number): string
const _assinatura: (carregados: number, total: number) => string = fraseDeProgressoDeCarga;

/** Um padrão de CPF mascarado, para provar que ele NUNCA aparece na frase (§A.6). */
const PADRAO_CPF_MASCARADO = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
/**
 * Onze dígitos SEGUIDOS: um CPF cru também não pode vazar. A contagem é formatada em pt-BR, então
 * "82.068" tem o milhar separado por ponto e nunca forma onze dígitos contíguos; a trava segue
 * valendo (um CPF cru, sem máscara, seria onze dígitos de fato).
 */
const ONZE_DIGITOS = /\d{11}/;

describe("fraseDeProgressoDeCarga — progresso (carregados < total)", () => {
  it("diz quantos entraram e quantos a base tem, com as duas contagens", () => {
    // Pin da assinatura: se a forma do contrato mudar, o typecheck quebra em `_assinatura` acima.
    expect(_assinatura).toBe(fraseDeProgressoDeCarga);
    expect(fraseDeProgressoDeCarga(200, 1480)).toBe("Carregados 200 de 1.480 candidatos.");
  });

  it("a página 1 recém-aberta (200 de dezenas de milhares) mostra o progresso", () => {
    expect(fraseDeProgressoDeCarga(200, 81024)).toBe("Carregados 200 de 81.024 candidatos.");
  });

  it("carregados = 0 com base não vazia é progresso, não cobertura completa", () => {
    expect(fraseDeProgressoDeCarga(0, 1480)).toBe("Carregados 0 de 1.480 candidatos.");
  });

  it("faltando UM para o fim ainda é progresso, não cobertura", () => {
    expect(fraseDeProgressoDeCarga(1479, 1480)).toBe("Carregados 1.479 de 1.480 candidatos.");
  });
});

describe("fraseDeProgressoDeCarga — cobertura completa (carregados >= total)", () => {
  it("ao cobrir a base inteira, anuncia que TODOS foram carregados", () => {
    expect(fraseDeProgressoDeCarga(1480, 1480)).toBe("Todos os 1.480 candidatos foram carregados.");
  });

  it("excedente (carregados > total) NÃO vaza o número inflado: a frase usa o total", () => {
    // A tela chama com Math.min(pessoas.length, totalBase), então na prática não estoura; ainda
    // assim, se estourar, a frase não pode dizer "Todos os 1.500 de 1.480". Ela diz só o total.
    expect(fraseDeProgressoDeCarga(1500, 1480)).toBe("Todos os 1.480 candidatos foram carregados.");
    expect(fraseDeProgressoDeCarga(1500, 1480)).not.toContain("1500");
    expect(fraseDeProgressoDeCarga(1500, 1480)).not.toContain("1.500");
  });

  it("base de um só candidato, já carregado, é cobertura completa", () => {
    expect(fraseDeProgressoDeCarga(1, 1)).toBe("Todos os 1 candidatos foram carregados.");
  });
});

describe("fraseDeProgressoDeCarga — base vazia / ausente (total <= 0)", () => {
  it("total zero devolve string vazia: o indicador não aparece", () => {
    expect(fraseDeProgressoDeCarga(0, 0)).toBe("");
  });

  it("total zero com algo carregado (estado transitório) ainda devolve vazio", () => {
    expect(fraseDeProgressoDeCarga(5, 0)).toBe("");
  });

  it("total negativo (nunca deveria ocorrer) é tratado como base vazia, sem explodir", () => {
    expect(fraseDeProgressoDeCarga(0, -1)).toBe("");
  });
});

describe("fraseDeProgressoDeCarga — §A.6: contagem pura, nunca PII", () => {
  /**
   * A função só recebe DOIS NÚMEROS, então estruturalmente não há como vazar nome ou CPF. Este
   * bloco é a trava EXPLÍCITA disso: varre uma grade de entradas e prova que a saída nunca carrega
   * um padrão de CPF, nunca onze dígitos seguidos, nunca arroba de e-mail, e que os únicos números
   * presentes são os que foram passados.
   */
  const casos: Array<[number, number]> = [
    [0, 0],
    [0, 1480],
    [200, 1480],
    [1480, 1480],
    [200, 81024],
    [81024, 81024],
    [1, 2],
    [1500, 1480],
  ];

  for (const [carregados, total] of casos) {
    it(`(${carregados}, ${total}) não emite CPF mascarado, CPF cru nem e-mail`, () => {
      const frase = fraseDeProgressoDeCarga(carregados, total);
      expect(frase).not.toMatch(PADRAO_CPF_MASCARADO);
      expect(frase).not.toMatch(ONZE_DIGITOS);
      expect(frase).not.toContain("@");
    });
  }

  it("removidos os números, sobra apenas o texto fixo esperado (nada de nome colado)", () => {
    // Trocando toda sequência de dígitos por um marcador, a frase tem de ser um de DOIS moldes
    // fixos, provando que nenhum token variável além da contagem entrou no texto.
    // `\d[\d.]*` apaga o número INTEIRO, inclusive o ponto de milhar ("1.480"), sem tocar no ponto
    // final da frase (que não é precedido por dígito). O molde fixo continua provando que nada além
    // da contagem entrou no texto, agora que a contagem é formatada em pt-BR.
    const semNumeros = (c: number, t: number) =>
      fraseDeProgressoDeCarga(c, t).replace(/\d[\d.]*/g, "#");
    expect(semNumeros(200, 1480)).toBe("Carregados # de # candidatos.");
    expect(semNumeros(1480, 1480)).toBe("Todos os # candidatos foram carregados.");
  });

  it("os números da frase são EXATAMENTE os passados, e nenhum outro", () => {
    // pt-BR agrupa o milhar com ponto ("1.480"), então a extração casa o número agrupado e tira os
    // pontos antes de converter: o valor lido é o mesmo que foi passado, não os pedaços do grupo.
    const digitosDe = (s: string) =>
      (s.match(/\d{1,3}(?:\.\d{3})*/g) ?? []).map((n) => Number(n.replace(/\./g, "")));
    expect(digitosDe(fraseDeProgressoDeCarga(200, 1480))).toEqual([200, 1480]);
    expect(digitosDe(fraseDeProgressoDeCarga(1480, 1480))).toEqual([1480]);
  });
});

describe("fraseDeProgressoDeCarga — §A.11 e §A.24 (convenções de texto)", () => {
  const amostra: Array<[number, number]> = [
    [200, 1480],
    [0, 1480],
    [1480, 1480],
    [1500, 1480],
    [200, 81024],
  ];

  for (const [carregados, total] of amostra) {
    it(`(${carregados}, ${total}) não usa travessão (§A.11)`, () => {
      expect(fraseDeProgressoDeCarga(carregados, total)).not.toContain("—");
    });

    it(`(${carregados}, ${total}) é frase de apoio: só a primeira letra é maiúscula (§A.24)`, () => {
      const frase = fraseDeProgressoDeCarga(carregados, total);
      // Primeira letra maiúscula.
      expect(frase[0]).toBe(frase[0]!.toUpperCase());
      expect(frase[0]).not.toBe(frase[0]!.toLowerCase());
      // Nenhuma OUTRA letra maiúscula (title case seria tag/título, que esta frase não é).
      const resto = frase.slice(1);
      const maiusculasNoResto = resto.replace(/[^A-ZÀ-Ý]/g, "");
      expect(maiusculasNoResto).toBe("");
    });
  }

  it("as duas frases terminam em ponto, como frase de apoio e não como rótulo", () => {
    expect(fraseDeProgressoDeCarga(200, 1480).endsWith(".")).toBe(true);
    expect(fraseDeProgressoDeCarga(1480, 1480).endsWith(".")).toBe(true);
  });
});

describe("fraseDeProgressoDeCarga — fronteira exata entre os dois moldes", () => {
  it("carregados < total usa 'Carregados', carregados >= total usa 'Todos os'", () => {
    expect(fraseDeProgressoDeCarga(9, 10)).toContain("Carregados");
    expect(fraseDeProgressoDeCarga(9, 10)).not.toContain("Todos os");
    expect(fraseDeProgressoDeCarga(10, 10)).toContain("Todos os");
    expect(fraseDeProgressoDeCarga(10, 10)).not.toContain("Carregados");
  });
});
