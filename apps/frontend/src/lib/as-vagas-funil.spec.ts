import { describe, it, expect } from "vitest";
import type { AsEtapaFunil, AsOcupacaoVaga } from "@ea/shared-types";
import { cardsDeDesfecho, cardsDeEtapa, somarFunil } from "@/lib/as-vagas-funil";

/**
 * A RÉGUA DA SEGUNDA FILEIRA DE KPIs, afirmada sem montar componente.
 *
 * O QUE ESTES TESTES PROTEGEM não é o desenho do card: é a promessa de que a lista de cards sai do
 * CATÁLOGO e o número sai do MAPA. A regressão perigosa aqui é silenciosa e já aconteceu uma vez na
 * Central de Candidatos: alguém deriva os cards das chaves do mapa (ou escreve a lista à mão) e a
 * etapa nova do diretor deixa de aparecer, sem erro nenhum.
 */

const etapa = (
  codigo: string,
  ordem: number,
  extra: Partial<AsEtapaFunil> = {},
): AsEtapaFunil => ({
  id: ordem,
  codigo,
  rotulo: codigo[0] + codigo.slice(1).toLowerCase(),
  ordem,
  tom: "nt",
  inicial: ordem === 1,
  ativa: true,
  ...extra,
});

const CATALOGO: AsEtapaFunil[] = [
  etapa("CAPTACAO", 1),
  etapa("TRIAGEM", 2, { tom: "in" }),
  etapa("ENTREVISTA", 3, { tom: "wn" }),
];

/** Uma ocupação só com o que estes testes exercitam; o resto é zero e não entra na conta. */
const ocup = (
  porEtapa: Record<string, number>,
  porDesfecho: Record<string, number> = {},
): { ocupacao: AsOcupacaoVaga } => ({
  ocupacao: {
    vagaId: "v",
    posicoesOficiais: null,
    ocupadas: 0,
    finalizadas: 0,
    finalizadasOficial: 0,
    finalizadasBanco: 0,
    livres: null,
    emSelecao: 0,
    fora: 0,
    excedida: false,
    porEtapa,
    porDesfecho,
  },
});

describe("somarFunil", () => {
  it("soma o recorte inteiro, mapa a mapa", () => {
    const soma = somarFunil([
      ocup({ CAPTACAO: 2, TRIAGEM: 1 }, { APROVADO: 1 }),
      ocup({ CAPTACAO: 3 }, { APROVADO: 2, DESISTIU: 1 }),
    ]);
    expect(soma.porEtapa).toEqual({ CAPTACAO: 5, TRIAGEM: 1 });
    expect(soma.porDesfecho).toEqual({ APROVADO: 3, DESISTIU: 1 });
  });

  it("sem vaga nenhuma no recorte, soma vazia e não `undefined`", () => {
    expect(somarFunil([])).toEqual({ porEtapa: {}, porDesfecho: {} });
  });
});

describe("cardsDeEtapa", () => {
  it("a lista vem do CATÁLOGO, na ordem do funil, e não das chaves do mapa", () => {
    const cards = cardsDeEtapa(CATALOGO, { TRIAGEM: 4 });
    expect(cards.map((c) => c.chave)).toEqual(["CAPTACAO", "TRIAGEM", "ENTREVISTA"]);
  });

  it("ETAPA VAZIA APARECE COM ZERO: é o ponto inteiro da peça", () => {
    // A etapa que o diretor acabou de cadastrar não tem ninguém e mesmo assim tem card. Derivada do
    // mapa, ela sumiria justamente no dia em que ele quer ver que ela nasceu.
    const cards = cardsDeEtapa([...CATALOGO, etapa("NOVA_ETAPA", 4)], { CAPTACAO: 1 });
    const nova = cards.find((c) => c.chave === "NOVA_ETAPA");
    expect(nova?.valor).toBe(0);
  });

  it("a cor do card é a cor que o diretor escolheu para a etapa", () => {
    const cards = cardsDeEtapa(CATALOGO, {});
    expect(cards.map((c) => c.cor)).toEqual(["var(--dim)", "var(--accent)", "var(--warn)"]);
  });

  it("etapa INATIVA e VAZIA fica de fora: não recebe ninguém e não tem o que mostrar", () => {
    const cards = cardsDeEtapa([...CATALOGO, etapa("APOSENTADA", 4, { ativa: false })], {});
    expect(cards.map((c) => c.chave)).not.toContain("APOSENTADA");
  });

  it("etapa INATIVA COM GENTE DENTRO aparece, marcada, em vez de sumir em silêncio", () => {
    // Inativar não é excluir: dá para tirar de circulação uma etapa que ainda tem gente viva, e essa
    // contagem continua chegando com a chave da etapa inativada. Sumir com ela seria o pior caso.
    const cards = cardsDeEtapa([...CATALOGO, etapa("APOSENTADA", 4, { ativa: false })], {
      APOSENTADA: 3,
    });
    const presa = cards.find((c) => c.chave === "APOSENTADA");
    expect(presa?.valor).toBe(3);
    expect(presa?.inativa).toBe(true);
    // E a etapa em circulação NÃO carrega a marca, senão ela não distingue nada.
    expect(cards.find((c) => c.chave === "CAPTACAO")?.inativa).toBe(false);
  });

  it("sem catálogo carregado, nenhum card: a tela não inventa etapa", () => {
    expect(cardsDeEtapa([], { CAPTACAO: 9 })).toEqual([]);
  });
});

describe("cardsDeDesfecho", () => {
  it("`ATIVO` fica de fora: quem está em seleção já é contado nas etapas", () => {
    expect(cardsDeDesfecho({}).map((c) => c.chave)).not.toContain("ATIVO");
  });

  it("todo desfecho tem card, inclusive zerado, e o rótulo é o do grupo (plural)", () => {
    const cards = cardsDeDesfecho({ APROVADO: 2 });
    expect(cards.map((c) => c.chave)).toEqual([
      "APROVADO",
      "ALOCADO",
      "DESCARTADO",
      "DESISTIU",
      "ENVIADO_PARA_ADMISSAO",
    ]);
    expect(cards.find((c) => c.chave === "APROVADO")).toMatchObject({
      rotulo: "Aprovados",
      valor: 2,
    });
    expect(cards.find((c) => c.chave === "ALOCADO")?.valor).toBe(0);
  });

  it("§A.11: nenhum rótulo da fileira usa travessão", () => {
    for (const c of [...cardsDeDesfecho({}), ...cardsDeEtapa(CATALOGO, {})]) {
      expect(c.rotulo, `${c.chave} com travessão`).not.toContain("—");
    }
  });
});
