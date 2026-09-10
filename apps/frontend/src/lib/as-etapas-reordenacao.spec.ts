import { describe, expect, it } from "vitest";
import type { AsEtapaFunil } from "@ea/shared-types";
import { moverNaOrdem, reordenacaoLiberada } from "@/lib/as-etapas";

/**
 * ─ A REORDENAÇÃO É O PONTO DA TELA QUE ERRA EM SILÊNCIO ─────────────────────────────────────────
 *
 * As duas réguas aqui não têm como falhar "com erro na cara": uma manda uma lista incompleta para o
 * backend (que recusa com uma frase que não ajuda), a outra escreve uma ordem que ninguém pediu. As
 * duas passam despercebidas em teste de olho, e por isso estão travadas em teste de unidade.
 */

function etapa(id: number, codigo: string, ordem: number, ativa = true): AsEtapaFunil {
  return { id, codigo, rotulo: codigo, ordem, tom: "nt", inicial: false, ativa };
}

/** Um funil com UMA INATIVA no meio, que é justamente o caso que quebra a implementação ingênua. */
const CATALOGO: AsEtapaFunil[] = [
  etapa(1, "CAPTACAO", 1),
  etapa(2, "TRIAGEM", 2),
  etapa(9, "DINAMICA", 3, false),
  etapa(3, "ENTREVISTA", 4),
  etapa(4, "APROVACAO", 5),
];

describe("moverNaOrdem: a lista vai INTEIRA, com as inativas dentro", () => {
  /**
   * A ARMADILHA MEDIDA: o `PATCH /ordem` exige a lista COMPLETA e recusa a parcial. Uma tela que
   * montasse a reordenação a partir das ATIVAS funcionaria até a primeira etapa ser inativada, e
   * daí em diante toda reordenação seria recusada, com um recado mandando recarregar a página.
   */
  it("devolve TODOS os ids do catálogo, inclusive os das inativas", () => {
    const ids = moverNaOrdem(CATALOGO, 4, "cima");
    expect(ids).toHaveLength(CATALOGO.length);
    expect(ids).toContain(9);
    expect([...ids].sort()).toEqual([...CATALOGO.map((e) => e.id)].sort());
  });

  it("subir troca com a vizinha de cima, e o resto da fila não se mexe", () => {
    expect(moverNaOrdem(CATALOGO, 3, "cima")).toEqual([1, 2, 3, 9, 4]);
  });

  it("descer troca com a vizinha de baixo", () => {
    expect(moverNaOrdem(CATALOGO, 1, "baixo")).toEqual([2, 1, 9, 3, 4]);
  });

  /** A vizinha de cima da ENTREVISTA é a DINAMICA, que está inativa. Ela conta na fila. */
  it("a vizinha pode ser uma INATIVA, e a troca acontece do mesmo jeito", () => {
    expect(moverNaOrdem(CATALOGO, 3, "cima")[2]).toBe(3);
    expect(moverNaOrdem(CATALOGO, 3, "cima")[3]).toBe(9);
  });

  it("a primeira não sobe e a última não desce: devolve a fila intacta", () => {
    expect(moverNaOrdem(CATALOGO, 1, "cima")).toEqual([1, 2, 9, 3, 4]);
    expect(moverNaOrdem(CATALOGO, 4, "baixo")).toEqual([1, 2, 9, 3, 4]);
  });

  /**
   * A ORDEM DE ENTRADA NÃO É A ORDEM DO FUNIL: a rota pode devolver em qualquer ordem, e é a coluna
   * `ordem` que manda. Trocar posições sobre a lista crua embaralharia o funil inteiro num clique.
   */
  it("ordena pela coluna `ordem` antes de trocar, e não pela ordem de chegada da rota", () => {
    const embaralhado = [CATALOGO[3], CATALOGO[0], CATALOGO[4], CATALOGO[2], CATALOGO[1]];
    expect(moverNaOrdem(embaralhado, 3, "cima")).toEqual([1, 2, 3, 9, 4]);
  });

  it("id que não está no catálogo não mexe em nada", () => {
    expect(moverNaOrdem(CATALOGO, 999, "cima")).toEqual([1, 2, 9, 3, 4]);
  });
});

describe("reordenacaoLiberada: a seta só vale quando a tela mostra o funil", () => {
  it("sem coluna escolhida (o padrão da tela) as setas valem", () => {
    expect(reordenacaoLiberada(null)).toBe(true);
  });

  it("ordenada pela própria coluna Ordem, crescente, as setas valem", () => {
    expect(reordenacaoLiberada({ chave: "ordem", dir: "asc" })).toBe(true);
  });

  /**
   * ORDENADA POR NOME, A LINHA DE CIMA NÃO É A ETAPA ANTERIOR. Deixar a seta ativa aqui faria o
   * clique escrever uma ordem que ninguém pediu, enquanto a tela mostra outra coisa: erro que não
   * aparece na hora e só é descoberto quando o funil já está trocado.
   */
  it.each([
    { chave: "rotulo", dir: "asc" as const },
    { chave: "rotulo", dir: "desc" as const },
    { chave: "ordem", dir: "desc" as const },
    { chave: "status", dir: "asc" as const },
  ])("ordenada por %j as setas ficam bloqueadas", (ordem) => {
    expect(reordenacaoLiberada(ordem)).toBe(false);
  });
});
