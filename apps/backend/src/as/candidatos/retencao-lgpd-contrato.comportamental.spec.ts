import { describe, expect, it } from "vitest";
import {
  clausulaDaProtecao,
  clausulaDoRelogio,
  clausulasDoWhere,
  MUTANTES,
  SQL_REFERENCIA,
  violacoesDoContrato,
} from "./retencao-lgpd.tester-fake";

/**
 * ─ O TESTE DO TESTE: O CONTRATO DISCRIMINA, OU ELE NÃO ESTÁ MEDINDO NADA ────────────────────────
 *
 * ESTE ARQUIVO NÃO OLHA A PRODUÇÃO. Ele olha o `violacoesDoContrato`, que é a régua que o arquivo
 * vizinho (`retencao-candidatos.lgpd.comportamental.spec.ts`) aplica sobre a consulta de verdade.
 *
 * POR QUE ELE EXISTE, e é a lição da leva 2 desta frente: o filtro do expurgo mora em SQL CRU, então
 * parte da cobertura é ASSERÇÃO DE FORMA, e asserção de forma dá FALSO POSITIVO. Um contrato que
 * aprova tudo fica verde para sempre e ninguém percebe, porque um teste verde não se explica.
 *
 * A DEFESA É EXERCITAR O CONTRATO CONTRA MUTANTES: uma consulta sabidamente correta, que ele tem de
 * APROVAR, e sete quebras deliberadas, cada uma com o dano que causaria em produção, que ele tem de
 * REPROVAR, dizendo QUAL propriedade caiu. Frouxar o contrato lá quebra este arquivo aqui.
 *
 * A MUTAÇÃo 4 DO ROTEIRO (`encerrada_em` deixa de ser escrita pelo `cancelar`) NÃO ESTÁ AQUI, e não
 * por esquecimento: ela não vive no SQL do expurgo, vive no `VagasService`. Quem a mata é
 * `apps/backend/src/as/vagas/vagas.encerrada-em.comportamental.spec.ts`, e lá o teste é de
 * COMPORTAMENTO (o payload que a gravação recebeu), não de forma.
 */

describe("o contrato aprova uma consulta que cumpre o requisito", () => {
  it("a referência não tem nenhuma violação", () => {
    expect(violacoesDoContrato(SQL_REFERENCIA)).toEqual([]);
  });

  /**
   * A LEITURA POR CLÁUSULA É O QUE IMPEDE O FALSO POSITIVO MAIS BARATO: proteção e relógio falam das
   * mesmas palavras (situação, vaga, encerramento), então afirmar sobre o texto inteiro deixaria uma
   * metade certa cobrir a outra metade destruída.
   */
  it("o `where` é partido nas cláusulas de topo, e cada metade é achada pelo que ela é", () => {
    const pedacos = clausulasDoWhere(SQL_REFERENCIA);
    expect(pedacos.length).toBeGreaterThanOrEqual(5);
    expect(clausulaDaProtecao(SQL_REFERENCIA)).toContain("as_vaga_status");
    expect(clausulaDoRelogio(SQL_REFERENCIA)).toContain("interval '2 years'");
    // A proteção NÃO é o relógio, e o relógio NÃO é a proteção: os dois pedaços são distintos.
    expect(clausulaDaProtecao(SQL_REFERENCIA)).not.toBe(clausulaDoRelogio(SQL_REFERENCIA));
    // Um ` and ` DENTRO da subconsulta não parte cláusula nenhuma.
    expect(clausulaDaProtecao(SQL_REFERENCIA)).toContain("and s.encerra = false");
  });

  /**
   * O COMENTÁRIO NÃO CONTA. É o tropeço já documentado no `fopag-cliente-inativo.spec.ts` e no
   * `retencao-candidatos.spec.ts`: o comentário que explica a regra usa as mesmas palavras da regra,
   * então uma leitura do texto cru aprovaria uma consulta com a cláusula REMOVIDA e a explicação no
   * lugar.
   */
  it("uma consulta com a regra só no COMENTÁRIO é reprovada", () => {
    const soComentario = SQL_REFERENCIA.split(" and not exists")[0] +
      " -- a proteção olha as_vaga_status.encerra e o relógio lê vagas.encerrada_em" +
      " returning c.id";
    const violacoes = violacoesDoContrato(soComentario);
    expect(violacoes.length).toBeGreaterThan(0);
    expect(violacoes.join(" ")).toContain("PROTECAO_AUSENTE");
  });
});

describe("o contrato reprova cada quebra deliberada, e diz qual propriedade caiu", () => {
  for (const m of MUTANTES) {
    it(`${m.nome}: reprovado por ${m.regraEsperada}`, () => {
      const violacoes = violacoesDoContrato(m.sql);
      expect(
        violacoes.join(" | "),
        `MUTANTE SOBREVIVEU. Dano em produção: ${m.dano}`,
      ).toContain(m.regraEsperada);
    });
  }

  /**
   * NENHUM MUTANTE PASSA EM SILÊNCIO, dito como propriedade do conjunto e não um a um: mutante novo
   * acrescentado à lista já entra coberto por esta afirmação no dia em que nascer.
   */
  it("nenhum dos mutantes é aprovado pelo contrato", () => {
    const sobreviventes = MUTANTES.filter((m) => violacoesDoContrato(m.sql).length === 0);
    expect(sobreviventes.map((m) => m.nome)).toEqual([]);
  });

  /**
   * E A OUTRA PONTA: o contrato não pode reprovar a referência por causa de ESTILO. Trocar aspas de
   * lugar, reordenar cláusulas ou usar `not s.encerra` em vez de `s.encerra = false` são escolhas
   * legítimas de quem constrói, e um teste que morre com elas mede DESENHO, não a propriedade que o
   * diretor pediu.
   */
  it("variações de estilo que preservam a propriedade continuam aprovadas", () => {
    const comNot = SQL_REFERENCIA.replace("s.encerra = false", "not s.encerra");
    expect(violacoesDoContrato(comNot)).toEqual([]);

    const outraOrdem = SQL_REFERENCIA.replace(
      "k.candidato_id = c.id and k.situacao in",
      "k.situacao in",
    ).replace("and s.encerra = false)", "and s.encerra = false and k.candidato_id = c.id)");
    expect(violacoesDoContrato(outraOrdem)).toEqual([]);
  });
});
