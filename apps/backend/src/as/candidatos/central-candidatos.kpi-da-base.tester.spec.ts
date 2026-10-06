import { describe, expect, it } from "vitest";
import { bancoDaCentral, type CandidatoFingido, type CandidaturaFingida } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ O KPI CONTA A BASE FILTRADA INTEIRA, NUNCA A PAGINA (§A.27) ─────────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` a partir do REQUISITO do mapapa
 * (`docs/MAPA-CENTRAL-CANDIDATOS-CONSERTO.md`, item 2), SEM ler a implementacao nova do service.
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ──────────────────────────────────────────┐
 * │ A tela carrega UMA pagina (200) de 81.024 candidatos e derivava os cards de etapa/situacao  │
 * │ das LINHAS CARREGADAS. O time lia "95 em Captacao" quando sao dezenas de milhares. O KPI     │
 * │ mentia por omissao, exatamente como o `total` mentia antes de virar `count(*) over ()`.      │
 * │                                                                                             │
 * │ O ORACULO E ESTRUTURAL, nao um numero decorado: a soma de `porEtapa` (e a de `porSituacao`)  │
 * │ TEM de bater com o total de candidaturas da base FILTRADA, e NUNCA pode ser o tamanho da     │
 * │ pagina. Com 500 candidaturas e pagina de 200, um KPI honesto soma 500; um KPI da pagina      │
 * │ somaria 200. O fingido corta em 200 e conta 500, entao os dois numeros divergem de proposito.│
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

function base(n: number, fn: (i: number) => { cand: CandidatoFingido; c: CandidaturaFingida }) {
  const candidatos: CandidatoFingido[] = [];
  const candidaturas: CandidaturaFingida[] = [];
  for (let i = 0; i < n; i++) {
    const { cand, c } = fn(i);
    candidatos.push(cand);
    candidaturas.push(c);
  }
  return { candidatos, candidaturas };
}

function somaDosValores(r: Record<string, number> | undefined): number {
  if (!r) return NaN;
  return Object.values(r).reduce((a, b) => a + b, 0);
}

describe("KPI da Central de Candidatos conta o conjunto FILTRADO, nao a pagina", () => {
  it("com 500 candidaturas e pagina de 200, os KPIs contam a base inteira (porEtapa so em selecao)", async () => {
    // 300 CAPTACAO + 200 TRIAGEM; 400 ATIVO + 100 DESCARTADO. Uma candidatura por pessoa.
    const { candidatos, candidaturas } = base(500, (i) => {
      const etapa = i < 300 ? "CAPTACAO" : "TRIAGEM";
      const situacao = i < 400 ? "ATIVO" : "DESCARTADO";
      return {
        cand: { id: `cand-${i}`, nome: `Pessoa ${i}`, origem: "PANDAPE" },
        c: { id: `cd-${i}`, candidatoId: `cand-${i}`, vagaId: `vaga-${i % 7}`, etapa, situacao },
      };
    });
    const { service } = bancoDaCentral({ candidatos, candidaturas });

    const pagina = await service.buscar({});

    expect(pagina.total, "o total e o numero REAL de candidatos, nao o da pagina").toBe(500);
    expect(pagina.itens.length, "a pagina padrao corta em 200").toBe(200);

    expect(
      pagina.kpis,
      "sem `kpis` a tela volta a derivar os cards das 200 linhas carregadas (o defeito).",
    ).toBeDefined();

    const porEtapa = somaDosValores(pagina.kpis!.porEtapa);
    const porSituacao = somaDosValores(pagina.kpis!.porSituacao);

    /*
     * `porEtapa` CONTA SO QUEM ESTA EM SELECAO (06/10/2026): a soma e 400 (os ATIVO), e NAO 500,
     * porque as 100 DESCARTADO contam no desfecho, nao no card de etapa (a situacao vence a etapa).
     * `porSituacao` segue contando TODAS, entao soma 500.
     */
    expect(porEtapa, "porEtapa soma so os em selecao (400), nao a base inteira").toBe(400);
    expect(porSituacao, "porSituacao conta TODAS as candidaturas da base filtrada").toBe(500);

    // A TRAVA DIRETA DO DEFEITO: o KPI NUNCA pode ser a contagem das linhas retornadas.
    expect(porEtapa, "KPI derivado da pagina somaria 200").not.toBe(pagina.itens.length);
    expect(porSituacao).not.toBe(pagina.itens.length);
  });

  it("a quebra por etapa e por situacao reflete a distribuicao da base, nao da janela", async () => {
    const { candidatos, candidaturas } = base(500, (i) => {
      const etapa = i < 300 ? "CAPTACAO" : "TRIAGEM";
      const situacao = i < 400 ? "ATIVO" : "DESCARTADO";
      return {
        cand: { id: `cand-${i}`, nome: `Pessoa ${i}`, origem: "PANDAPE" },
        c: { id: `cd-${i}`, candidatoId: `cand-${i}`, vagaId: `vaga-${i % 7}`, etapa, situacao },
      };
    });
    const { service } = bancoDaCentral({ candidatos, candidaturas });

    const pagina = await service.buscar({});

    /*
     * CAPTACAO sao os indices < 300, TODOS ATIVO (ATIVO e < 400), entao os 300 ficam no porEtapa.
     * TRIAGEM sao os indices [300, 500): os de [300, 400) sao ATIVO (100) e os de [400, 500) sao
     * DESCARTADO (100). Por isso porEtapa.TRIAGEM e 100, nao 200: os 100 descartados vao para o
     * porSituacao.DESCARTADO. Esta e a regra "a situacao vence a etapa".
     */
    expect(pagina.kpis!.porEtapa.CAPTACAO).toBe(300);
    expect(pagina.kpis!.porEtapa.TRIAGEM).toBe(100);
    expect(pagina.kpis!.porSituacao.ATIVO).toBe(400);
    expect(pagina.kpis!.porSituacao.DESCARTADO).toBe(100);
  });

  it("o FILTRO propaga ao KPI: origem=PANDAPE conta so o subconjunto, nao a base inteira", async () => {
    // 300 PANDAPE (todas CAPTACAO) + 200 DIGAI (todas TRIAGEM).
    const candidatos: CandidatoFingido[] = [];
    const candidaturas: CandidaturaFingida[] = [];
    for (let i = 0; i < 500; i++) {
      const origem = i < 300 ? "PANDAPE" : "DIGAI";
      const etapa = i < 300 ? "CAPTACAO" : "TRIAGEM";
      candidatos.push({ id: `c-${i}`, nome: `Pessoa ${i}`, origem });
      candidaturas.push({ id: `k-${i}`, candidatoId: `c-${i}`, vagaId: `v-${i % 5}`, etapa, situacao: "ATIVO" });
    }
    const { service } = bancoDaCentral({ candidatos, candidaturas });

    const pagina = await service.buscar({ origem: "PANDAPE" });

    expect(pagina.total, "o total ja respeita o filtro").toBe(300);
    expect(somaDosValores(pagina.kpis!.porEtapa), "o KPI conta SO o subconjunto filtrado").toBe(300);
    expect(
      pagina.kpis!.porEtapa.TRIAGEM,
      "DIGAI/TRIAGEM ficou fora do filtro e NAO pode aparecer no KPI",
    ).toBeUndefined();
    expect(pagina.kpis!.porEtapa.CAPTACAO).toBe(300);
  });

  it("filtro por nome propaga ao KPI (conta so quem casa o trecho)", async () => {
    const candidatos: CandidatoFingido[] = [
      { id: "pessoa-joana", nome: "Joana Ribeiro", origem: "PANDAPE" },
      { id: "pessoa-joaquim", nome: "Joaquim Silva", origem: "PANDAPE" },
      { id: "pessoa-mariana", nome: "Mariana Costa", origem: "PANDAPE" },
    ];
    const candidaturas: CandidaturaFingida[] = [
      { id: "k1", candidatoId: "pessoa-joana", vagaId: "v1", etapa: "CAPTACAO", situacao: "ATIVO" },
      { id: "k2", candidatoId: "pessoa-joaquim", vagaId: "v1", etapa: "CAPTACAO", situacao: "ATIVO" },
      { id: "k3", candidatoId: "pessoa-mariana", vagaId: "v1", etapa: "TRIAGEM", situacao: "ATIVO" },
    ];
    const { service } = bancoDaCentral({ candidatos, candidaturas });

    const pagina = await service.buscar({ nome: "joa" });

    expect(pagina.total, "so Joana e Joaquim casam 'joa'").toBe(2);
    expect(somaDosValores(pagina.kpis!.porEtapa)).toBe(2);
    expect(pagina.kpis!.porEtapa.TRIAGEM, "Mariana ficou fora do filtro").toBeUndefined();
  });
});
