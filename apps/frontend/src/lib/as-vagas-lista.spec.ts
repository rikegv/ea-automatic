import { describe, expect, it } from "vitest";
import type { AsOcupacaoVaga } from "@ea/shared-types";
import {
  casaBusca,
  fatiarPagina,
  normalizar,
  paginaValida,
  temGenteNaEtapa,
  temGenteNoDesfecho,
  textoBuscavel,
  totalDePaginas,
} from "./as-vagas-lista";

const ocupacao = (porEtapa: Record<string, number>): AsOcupacaoVaga =>
  ({
    porEtapa,
    porDesfecho: {},
  }) as unknown as AsOcupacaoVaga;

/** A gêmea da de cima, para o outro mapa: só desfecho dentro, etapa vazia. */
const comDesfecho = (porDesfecho: Record<string, number>): AsOcupacaoVaga =>
  ({
    porEtapa: {},
    porDesfecho,
  }) as unknown as AsOcupacaoVaga;

describe("normalizar", () => {
  it("tira acento, caixa e borda", () => {
    expect(normalizar("  Aprovação ")).toBe("aprovacao");
  });
});

describe("textoBuscavel", () => {
  it("cola as células e ignora nulo, vazio e indefinido", () => {
    expect(textoBuscavel(["1234567", null, "BMB", undefined, "", "Advogada II"])).toBe(
      "1234567 bmb advogada ii",
    );
  });

  it("carrega o 'não informado' que a célula mostra, para a busca achar a lacuna", () => {
    expect(textoBuscavel(["123", "não informado"])).toContain("nao informado");
  });

  it("aceita número sem virar 'undefined' no meio do alvo", () => {
    expect(textoBuscavel(["123", 42])).toBe("123 42");
  });
});

describe("casaBusca", () => {
  const alvo = textoBuscavel(["1234567", "Henrique Teste", "BMB", "Advogada II", "Temporário"]);

  it("termo vazio não filtra nada", () => {
    expect(casaBusca(alvo, "")).toBe(true);
    expect(casaBusca(alvo, "   ")).toBe(true);
  });

  it("acha por uma coluna que não é código nem nome da vaga", () => {
    expect(casaBusca(alvo, "bmb")).toBe(true);
    expect(casaBusca(alvo, "advogada")).toBe(true);
    expect(casaBusca(alvo, "temporario")).toBe(true);
  });

  it("acha com acento digitado e com acento no dado", () => {
    expect(casaBusca(alvo, "Temporário")).toBe(true);
  });

  // A ARMADILHA: duas palavras de CÉLULAS DIFERENTES, separadas por outras colunas no meio.
  // Comparar a frase inteira como substring devolveria falso e a busca pareceria quebrada.
  it("casa palavras de colunas diferentes, em qualquer ordem", () => {
    expect(casaBusca(alvo, "bmb advogada")).toBe(true);
    expect(casaBusca(alvo, "advogada bmb")).toBe(true);
  });

  it("recusa quando uma das palavras não está na linha", () => {
    expect(casaBusca(alvo, "bmb efetivo")).toBe(false);
  });
});

describe("temGenteNaEtapa", () => {
  it("seleção vazia deixa tudo passar", () => {
    expect(temGenteNaEtapa(ocupacao({}), [])).toBe(true);
  });

  it("passa a vaga que tem gente na etapa escolhida", () => {
    expect(temGenteNaEtapa(ocupacao({ TRIAGEM: 2 }), ["TRIAGEM"])).toBe(true);
  });

  it("recusa a vaga sem ninguém naquela etapa", () => {
    expect(temGenteNaEtapa(ocupacao({ CAPTACAO: 5 }), ["TRIAGEM"])).toBe(false);
  });

  // A CHAVE COM ZERO não aparece no contrato, mas se aparecer ela é ausência, não presença.
  it("zero na chave é ausência", () => {
    expect(temGenteNaEtapa(ocupacao({ TRIAGEM: 0 }), ["TRIAGEM"])).toBe(false);
  });

  it("mais de uma etapa é OU, não E", () => {
    expect(temGenteNaEtapa(ocupacao({ TRIAGEM: 1 }), ["TRIAGEM", "APROVACAO"])).toBe(true);
    expect(temGenteNaEtapa(ocupacao({ OUTRA: 1 }), ["TRIAGEM", "APROVACAO"])).toBe(false);
  });

  // A régua do card é `porEtapa`, que já exclui quem recebeu decisão: quem está em `porDesfecho`
  // NÃO pode entrar pelo clique do card, senão a tabela mostra mais gente do que o card prometeu.
  it("não olha o desfecho, só a etapa", () => {
    const o = { porEtapa: {}, porDesfecho: { ALOCADO: 3 } } as unknown as AsOcupacaoVaga;
    expect(temGenteNaEtapa(o, ["TRIAGEM"])).toBe(false);
  });

  it("vaga sem ocupação não quebra a tela", () => {
    expect(temGenteNaEtapa(null, ["TRIAGEM"])).toBe(false);
    expect(temGenteNaEtapa(undefined, [])).toBe(true);
  });
});

describe("temGenteNoDesfecho", () => {
  it("seleção vazia deixa tudo passar", () => {
    expect(temGenteNoDesfecho(comDesfecho({}), [])).toBe(true);
  });

  it("passa a vaga que tem gente naquele desfecho", () => {
    expect(temGenteNoDesfecho(comDesfecho({ ALOCADO: 2 }), ["ALOCADO"])).toBe(true);
  });

  it("recusa a vaga sem ninguém naquele desfecho", () => {
    expect(temGenteNoDesfecho(comDesfecho({ DESISTIU: 5 }), ["ALOCADO"])).toBe(false);
  });

  it("zero na chave é ausência", () => {
    expect(temGenteNoDesfecho(comDesfecho({ ALOCADO: 0 }), ["ALOCADO"])).toBe(false);
  });

  it("mais de um desfecho é OU, não E", () => {
    expect(temGenteNoDesfecho(comDesfecho({ ALOCADO: 1 }), ["ALOCADO", "DESISTIU"])).toBe(true);
    expect(temGenteNoDesfecho(comDesfecho({ APROVADO: 1 }), ["ALOCADO", "DESISTIU"])).toBe(false);
  });

  it("vaga sem ocupação não quebra a tela", () => {
    expect(temGenteNoDesfecho(null, ["ALOCADO"])).toBe(false);
    expect(temGenteNoDesfecho(undefined, [])).toBe(true);
  });
});

/**
 * ─ O PONTO DE RISCO DOS DOIS RECORTES: CADA UM NO SEU MAPA, NUNCA NO DO OUTRO ─────────────────
 *
 * É O ERRO QUE OS DOIS CARDS CONVIDAM A COMETER: eles são vizinhos na tela, parecem iguais, e uma
 * única função com os dois mapas somados devolveria `true` nos quatro casos abaixo. O card diria um
 * número e a tabela mostraria outro, que é o defeito que a nota de `temGenteNaEtapa` já descreve.
 */
describe("etapa e desfecho não se confundem", () => {
  const soEtapa = { porEtapa: { TRIAGEM: 3 }, porDesfecho: {} } as unknown as AsOcupacaoVaga;
  const soDesfecho = { porEtapa: {}, porDesfecho: { ALOCADO: 3 } } as unknown as AsOcupacaoVaga;

  it("gente só em etapa não passa pelo filtro de desfecho", () => {
    expect(temGenteNoDesfecho(soEtapa, ["ALOCADO"])).toBe(false);
    expect(temGenteNaEtapa(soEtapa, ["TRIAGEM"])).toBe(true);
  });

  it("gente só em desfecho não passa pelo filtro de etapa", () => {
    expect(temGenteNaEtapa(soDesfecho, ["TRIAGEM"])).toBe(false);
    expect(temGenteNoDesfecho(soDesfecho, ["ALOCADO"])).toBe(true);
  });

  /**
   * A COMPOSIÇÃO ENTRE OS DOIS GRUPOS É "E", e é assim que a tela chama as duas funções
   * (`app/(app)/as/vagas/page.tsx`, o `useMemo` de `recortadas`). A justificativa das três razões
   * está no cabeçalho de `temGenteNoDesfecho`; aqui ela fica TRAVADA, e não implícita.
   */
  it("etapa e desfecho acesos juntos é E, não OU", () => {
    const eDeVerdade = {
      porEtapa: { TRIAGEM: 1 },
      porDesfecho: { ALOCADO: 1 },
    } as unknown as AsOcupacaoVaga;
    const passa = (o: AsOcupacaoVaga) =>
      temGenteNaEtapa(o, ["TRIAGEM"]) && temGenteNoDesfecho(o, ["ALOCADO"]);

    expect(passa(eDeVerdade)).toBe(true);
    // Com "OU" as duas linhas abaixo passariam, e acender o segundo card AUMENTARIA a lista.
    expect(passa(soEtapa)).toBe(false);
    expect(passa(soDesfecho)).toBe(false);
  });
});

describe("paginação", () => {
  const lista = Array.from({ length: 53 }, (_, i) => i + 1);

  it("lista vazia continua tendo uma página", () => {
    expect(totalDePaginas(0, 25)).toBe(1);
  });

  it("conta a página incompleta do fim", () => {
    expect(totalDePaginas(53, 25)).toBe(3);
    expect(totalDePaginas(50, 25)).toBe(2);
  });

  it("fatia a página pedida", () => {
    expect(fatiarPagina(lista, 1, 25)[0]).toBe(1);
    expect(fatiarPagina(lista, 2, 25)[0]).toBe(26);
    expect(fatiarPagina(lista, 3, 25)).toHaveLength(3);
  });

  // A LISTA ENCOLHE DEBAIXO DO USUÁRIO: página 4 com 12 itens vira página 1, e não uma tela vazia.
  it("corrige a página que deixou de existir", () => {
    expect(paginaValida(4, 12, 25)).toBe(1);
    expect(fatiarPagina(lista.slice(0, 12), 4, 25)).toHaveLength(12);
  });

  it("recusa página menor que um", () => {
    expect(paginaValida(0, 53, 25)).toBe(1);
    expect(paginaValida(-3, 53, 25)).toBe(1);
  });
});
