import { describe, expect, it } from "vitest";
import { decidirPrecedencia, valorDeComparacao } from "./as-precedencia-ingestao";

/**
 * ─ A REGUA DE PRECEDENCIA, MEDIDA COMO DOMINIO PURO ────────────────────────────────────────────
 *
 * Nenhum Postgres, nenhum Nest, nenhuma fila. É aqui que a decisão "escreve ou vira divergência" é
 * afirmada, porque é aqui que ela mora: os dois lados que a consultam (a candidatura, por linha, e a
 * vaga, por papel de status) chamam a MESMA função, e um `if` em cada um deles concordaria por
 * coincidência até o dia em que alguém corrigisse um só.
 *
 * §A.6: nenhum valor aqui é dado pessoal. São códigos de etapa, códigos de situação, números e um
 * rótulo de vaga sintético.
 */

describe("a régua de precedência: dado o valor do EA e o do ATS", () => {
  it("ESCREVE quando o ponto NÃO é protegido (nascimento, ou vaga em revisão)", () => {
    // O QUE ISTO PROVA: na entrada nova o ATS manda, porque não há trabalho humano a proteger. Sem
    // este ramo, a ingestão não conseguiria criar candidatura nem espelhar vaga nenhuma.
    expect(decidirPrecedencia({ protegido: false, valorEa: null, valorAts: "CAPTACAO" })).toBe(
      "ESCREVER",
    );
    expect(
      decidirPrecedencia({ protegido: false, valorEa: "CAPTACAO", valorAts: "ENTREVISTA_SOULAN" }),
    ).toBe("ESCREVER");
  });

  it("DIVERGE quando o ponto é protegido e os lados discordam", () => {
    // O QUE ISTO PROVA: o defeito medido em 30/09. O time move a pessoa para ENTREVISTA_CLIENTE, o
    // ATS insiste em CAPTACAO, e a resposta passa a ser "não escreve, abre linha de revisão" em vez
    // de "sobrescreve porque o valor é diferente", que era o que o `is distinct from` autorizava.
    expect(
      decidirPrecedencia({
        protegido: true,
        valorEa: "ENTREVISTA_CLIENTE",
        valorAts: "CAPTACAO",
      }),
    ).toBe("DIVERGIR");
  });

  it("NAO FAZ NADA quando os dois lados concordam, INCLUSIVE em ponto protegido", () => {
    /*
     * O QUE ISTO PROVA, e é a metade que impede a fila de virar log: a comparação vem ANTES da
     * proteção. Sem esta ordem, 48 voltas por dia abririam linha de revisão para toda candidatura em
     * que o ATS concorda com o EA, que é a MAIORIA, e a fila de trabalho seria inútil no primeiro dia.
     */
    expect(
      decidirPrecedencia({ protegido: true, valorEa: "CAPTACAO", valorAts: "CAPTACAO" }),
    ).toBe("NADA");
    expect(decidirPrecedencia({ protegido: true, valorEa: null, valorAts: null })).toBe("NADA");
  });

  it("trata VAZIO e NULO como a MESMA ausência, e não como discordância", () => {
    /*
     * O QUE ISTO PROVA: a divergência FANTASMA. O ATS entrega string vazia onde o EA tem nulo (e
     * vice-versa) em campo de texto, e sem esta normalização a fila ganharia uma linha por volta,
     * para sempre, dizendo que "" é diferente de nada.
     */
    expect(decidirPrecedencia({ protegido: true, valorEa: null, valorAts: "" })).toBe("NADA");
    expect(decidirPrecedencia({ protegido: true, valorEa: "   ", valorAts: undefined })).toBe(
      "NADA",
    );
  });

  it("compara NUMERO com TEXTO sem inventar diferença", () => {
    /*
     * O QUE ISTO PROVA: `posicoes_oficiais` é inteiro no banco e chega da API como número ou texto,
     * e `cidade_id` é inteiro. Sem a normalização, `3` seria diferente de `"3"` e a vaga liberada
     * divergiria em toda volta nos dois campos numéricos.
     */
    expect(decidirPrecedencia({ protegido: true, valorEa: 3, valorAts: "3" })).toBe("NADA");
    expect(decidirPrecedencia({ protegido: true, valorEa: 3, valorAts: 4 })).toBe("DIVERGIR");
  });

  it("o valor de comparação é TEXTO ou NULO, sempre", () => {
    expect(valorDeComparacao(7)).toBe("7");
    expect(valorDeComparacao(" CAPTACAO ")).toBe("CAPTACAO");
    expect(valorDeComparacao("")).toBeNull();
    expect(valorDeComparacao(null)).toBeNull();
    expect(valorDeComparacao(undefined)).toBeNull();
    // NaN NAO VIRA "NaN": número que não é número é ausência, e escrever o texto "NaN" na fila faria
    // a tela mostrar uma divergência ilegível que o time não teria como decidir.
    expect(valorDeComparacao(Number.NaN)).toBeNull();
  });
});

/*
 * ─ O QUE SAIU DESTE ARQUIVO EM 02/10/2026: as sete asserções de `ponteDeveDisparar` ────────────
 *
 * Elas mediam QUANDO a varredura abria pré-admissão (nascimento, retentativa, fail-closed). A
 * varredura deixou de abrir pré-admissão em qualquer caso, porque o gatilho é da esteira e não das
 * ATS, então a função saiu e as asserções saíram com ela. A régua de PRECEDÊNCIA, que é a outra
 * propriedade deste arquivo e a que de fato protege o trabalho do time, continua medida acima,
 * inteira e sem alteração.
 */
