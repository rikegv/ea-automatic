import { CANDIDATURA_SITUACOES, type CandidaturaSituacao } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { kpisDoFunil, ocupacaoDaVaga, type ItemDoFunil } from "./candidatura";

/**
 * ─ A CONTAGEM POR ETAPA E POR DESFECHO: A SITUAÇÃO VENCE A ETAPA ────────────────────────────────
 *
 * ┌─ O DEFEITO QUE A PEÇA EXISTE PARA NÃO REPETIR ─────────────────────────────────────────────────┐
 * │ A fileira de cards de hoje é escrita à mão com CINCO etapas literais, então a etapa que o       │
 * │ diretor cadastrar não ganha card: as pessoas dela caem no card de Aprovação, e o número mente   │
 * │ para os dois lados ao mesmo tempo. Um contrato com cinco campos fixos repetiria isso dentro do  │
 * │ backend, e é por isso que a chave é o CÓDIGO DA ETAPA e o tipo é um `Record`.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTES CASOS GUARDAM:
 *  1. ETAPA NOVA (uma que este arquivo nem conhece) ganha número sozinha, sem tocar em código;
 *  2. quem recebeu decisão conta como DESFECHO e NÃO aparece na etapa em que estava;
 *  3. ninguém é contado duas vezes, e ninguém some: a soma dos dois grupos é o total de linhas;
 *  4. as duas funções que contam "estar em seleção" (esta e `ocupacaoDaVaga`) CONCORDAM, medidas
 *     sobre a mesma lista. Duas réguas que deveriam ser iguais divergem no primeiro ajuste, e é
 *     assim que a tela e a trava passam a dar números diferentes em silêncio.
 *
 * §A.6: só situação, código de etapa e contagem. Nenhum dado pessoal.
 */

const soma = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

function item(situacao: CandidaturaSituacao, etapa: string): ItemDoFunil {
  return { situacao, etapa };
}

describe("kpisDoFunil: quem está EM SELEÇÃO conta na etapa", () => {
  it("conta por CÓDIGO de etapa, e agrupa quem está na mesma", () => {
    const r = kpisDoFunil([
      item("ATIVO", "CAPTACAO"),
      item("ATIVO", "TRIAGEM"),
      item("ATIVO", "TRIAGEM"),
    ]);

    expect(r.porEtapa).toEqual({ CAPTACAO: 1, TRIAGEM: 2 });
    expect(r.porDesfecho).toEqual({});
  });

  /**
   * O CASO QUE JUSTIFICA O `Record`. A etapa não existe em constante nenhuma deste repositório: ela
   * é o que o diretor digitou na tela. Com cinco campos fixos, esta contagem não teria onde morar.
   */
  it("ETAPA NOVA, criada pelo diretor, ganha número sem uma linha de código mudar", () => {
    const r = kpisDoFunil([
      item("ATIVO", "DINAMICA_DE_GRUPO"),
      item("ATIVO", "DINAMICA_DE_GRUPO"),
      item("ATIVO", "CAPTACAO"),
    ]);

    expect(r.porEtapa.DINAMICA_DE_GRUPO).toBe(2);
    expect(r.porEtapa.CAPTACAO).toBe(1);
  });

  /**
   * ETAPA INATIVADA COM GENTE VIVA DENTRO. Não deveria acontecer, e acontece: a inativação explícita
   * não move ninguém. O número NÃO PODE SUMIR, senão a pessoa fica invisível justamente no estado em
   * que alguém precisa ir buscá la.
   */
  it("etapa fora de circulação ainda aparece, com a chave dela", () => {
    const r = kpisDoFunil([item("ATIVO", "ETAPA_INATIVADA")]);

    expect(r.porEtapa.ETAPA_INATIVADA).toBe(1);
  });

  it("lista vazia devolve os dois grupos vazios, e não `undefined`", () => {
    expect(kpisDoFunil([])).toEqual({ porEtapa: {}, porDesfecho: {} });
  });

  it("só as chaves COM número aparecem: quem lê monta os cards pelo catálogo e resolve com `?? 0`", () => {
    const r = kpisDoFunil([item("ATIVO", "CAPTACAO")]);

    expect(Object.keys(r.porEtapa)).toEqual(["CAPTACAO"]);
    expect(r.porEtapa.TRIAGEM ?? 0).toBe(0);
  });
});

describe("a SITUAÇÃO vence a ETAPA: quem recebeu decisão conta no desfecho", () => {
  it.each(CANDIDATURA_SITUACOES.filter((s) => s !== "ATIVO"))(
    "%s conta como desfecho e NÃO aparece na etapa em que estava",
    (situacao) => {
      const r = kpisDoFunil([item(situacao, "TRIAGEM")]);

      expect(r.porDesfecho[situacao]).toBe(1);
      expect(r.porEtapa.TRIAGEM ?? 0).toBe(0);
    },
  );

  /**
   * OS DESFECHOS NÃO SE FUNDEM. Descartado e desistiu respondem perguntas diferentes (o time recusou,
   * ou a pessoa saiu por conta própria), e somados respondem só "quantos saíram", que é a pergunta
   * que ninguém faz.
   */
  it("cada desfecho tem a chave dele, sem fusão", () => {
    const r = kpisDoFunil([
      item("DESCARTADO", "TRIAGEM"),
      item("DESISTIU", "TRIAGEM"),
      item("APROVADO", "APROVACAO"),
      item("ALOCADO", "APROVACAO"),
      item("ENVIADO_PARA_ADMISSAO", "APROVACAO"),
    ]);

    expect(r.porDesfecho).toEqual({
      DESCARTADO: 1,
      DESISTIU: 1,
      APROVADO: 1,
      ALOCADO: 1,
      ENVIADO_PARA_ADMISSAO: 1,
    });
    expect(r.porEtapa).toEqual({});
  });

  it("a etapa gravada na linha do descartado não vaza para nenhum card de etapa", () => {
    // Toda candidatura carrega uma etapa, inclusive a de quem saiu: é ela que diz ONDE a saída
    // aconteceu. Contar por etapa sem olhar a situação encheria a Triagem com gente que saiu.
    const r = kpisDoFunil([
      item("DESCARTADO", "TRIAGEM"),
      item("DESCARTADO", "TRIAGEM"),
      item("ATIVO", "TRIAGEM"),
    ]);

    expect(r.porEtapa.TRIAGEM).toBe(1);
    expect(r.porDesfecho.DESCARTADO).toBe(2);
  });
});

describe("as invariantes: ninguém é contado duas vezes, e ninguém some", () => {
  const mistura: ItemDoFunil[] = [
    item("ATIVO", "CAPTACAO"),
    item("ATIVO", "TRIAGEM"),
    item("ATIVO", "ETAPA_NOVA"),
    item("APROVADO", "APROVACAO"),
    item("ALOCADO", "APROVACAO"),
    item("ENVIADO_PARA_ADMISSAO", "APROVACAO"),
    item("DESCARTADO", "TRIAGEM"),
    item("DESISTIU", "ENTREVISTA_SOULAN"),
  ];

  it("a soma dos DOIS grupos é exatamente o número de candidaturas", () => {
    const r = kpisDoFunil(mistura);

    expect(soma(r.porEtapa) + soma(r.porDesfecho)).toBe(mistura.length);
  });

  /**
   * O CRUZAMENTO COM A OUTRA FUNÇÃO QUE CONTA A MESMA COISA. `ocupacaoDaVaga.emSelecao` e a soma de
   * `porEtapa` respondem "quantos seguem esperando decisão", cada uma por um caminho. Este caso as
   * mede sobre a MESMA lista: se uma delas mudar de ideia sobre o que é estar em seleção, a
   * divergência aparece aqui, e não numa tela mostrando dois números diferentes para a mesma vaga.
   */
  it("a soma de `porEtapa` bate com o `emSelecao` de `ocupacaoDaVaga`, sobre a mesma lista", () => {
    const r = kpisDoFunil(mistura);
    const o = ocupacaoDaVaga(10, mistura);

    expect(soma(r.porEtapa)).toBe(o.emSelecao);
    // E o outro lado do mesmo cruzamento: quem NÃO está em seleção é o desfecho, inteiro.
    expect(soma(r.porDesfecho)).toBe(mistura.length - o.emSelecao);
  });

  it("`fora` (descartado e desistiu) é um SUBCONJUNTO do desfecho, nunca o desfecho todo", () => {
    // A distinção que o par de fileiras precisa preservar: aprovado, alocado e enviado para admissão
    // também são desfecho, e nenhum deles é "fora do processo".
    const r = kpisDoFunil(mistura);
    const o = ocupacaoDaVaga(10, mistura);

    expect((r.porDesfecho.DESCARTADO ?? 0) + (r.porDesfecho.DESISTIU ?? 0)).toBe(o.fora);
    expect(soma(r.porDesfecho)).toBeGreaterThan(o.fora);
  });

  it("a contagem não depende da ORDEM dos itens", () => {
    const direto = kpisDoFunil(mistura);
    const invertido = kpisDoFunil([...mistura].reverse());

    expect(invertido).toEqual(direto);
  });
});
