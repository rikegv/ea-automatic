import { describe, expect, it } from "vitest";
import { bancoDaCentral, type CandidatoFingido, type CandidaturaFingida } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ CLICAR NUM CARD NAO ZERA OS OUTROS CARDS, NEM NO MUNDO PAGINADO (07/10/2026) ─────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38/§A.40), do REQUISITO do mapa
 * (`docs/MAPA-ALCANCE-PAGINACAO-SERVIDOR-CANDIDATOS-VAGAS.md`, secao 1.3 e risco 1), SEM ler o codigo.
 *
 * ┌─ DUAS COISAS, E A SEGUNDA E A QUE ESTA FRENTE PODE QUEBRAR ───────────────────────────────────┐
 * │ 1. O FILTRO DE CARD ENTRA SO NA LISTA (`filtrosLista`), NUNCA NO KPI (`filtros`, a base). Isto  │
 * │    JA e verdade desde 06/10, e estas assercoes sao TRAVA DE NAO-REGRESSAO: o codigo novo de     │
 * │    ordenacao/paginacao nao pode, sem querer, passar a contar o KPI sobre a base+card. Se o       │
 * │    card vazasse para a agregacao, clicar num card zeraria todos os outros cards.                │
 * │                                                                                                 │
 * │ 2. NO MUNDO PAGINADO, clicar num card e um FILTRO NOVO (`offset === 0`), entao o KPI e           │
 * │    recalculado sobre a base. Mas paginar DENTRO do card (`offset > 0`) NAO recalcula: `kpis`     │
 * │    volta undefined, pela mesma regra do gate por offset. Esta parte FALHA ate o gate existir.   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Seis pessoas, uma candidatura cada, separando etapa de situacao:
 *  - p1,p2: ENTREVISTA_SOULAN / ATIVO
 *  - p3,p4: APROVACAO / APROVADO
 *  - p5:    CAPTACAO / DESCARTADO
 *  - p6:    CAPTACAO / ATIVO
 */
function cenario() {
  const candidatos: CandidatoFingido[] = [
    { id: "p1", nome: "Ana", origem: "PANDAPE" },
    { id: "p2", nome: "Bia", origem: "PANDAPE" },
    { id: "p3", nome: "Caio", origem: "PANDAPE" },
    { id: "p4", nome: "Duda", origem: "PANDAPE" },
    { id: "p5", nome: "Eva", origem: "PANDAPE" },
    { id: "p6", nome: "Fabio", origem: "PANDAPE" },
  ];
  const candidaturas: CandidaturaFingida[] = [
    { id: "c1", candidatoId: "p1", vagaId: "v1", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" },
    { id: "c2", candidatoId: "p2", vagaId: "v1", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" },
    { id: "c3", candidatoId: "p3", vagaId: "v2", etapa: "APROVACAO", situacao: "APROVADO" },
    { id: "c4", candidatoId: "p4", vagaId: "v2", etapa: "APROVACAO", situacao: "APROVADO" },
    { id: "c5", candidatoId: "p5", vagaId: "v3", etapa: "CAPTACAO", situacao: "DESCARTADO" },
    { id: "c6", candidatoId: "p6", vagaId: "v3", etapa: "CAPTACAO", situacao: "ATIVO" },
  ];
  return bancoDaCentral({ candidatos, candidaturas });
}

describe("o filtro de card encolhe a LISTA mas NAO mexe nos KPIs (trava de nao-regressao)", () => {
  it("com um card de situacao, a lista encolhe e os KPIs continuam os da base", async () => {
    const banco = cenario();
    const base = await banco.service.buscar({});
    const comCard = await cenario().service.buscar({ filtroCardSituacao: "APROVADO" });

    expect(base.total, "a base tem as 6 pessoas").toBe(6);
    expect(comCard.total, "o card de APROVADO filtra a lista para p3 e p4").toBe(2);

    expect(
      comCard.kpis!.porEtapa,
      "clicar num card nao pode mudar o card de etapa: o KPI conta a base, nao a lista filtrada.",
    ).toEqual(base.kpis!.porEtapa);
    expect(comCard.kpis!.porSituacao).toEqual(base.kpis!.porSituacao);
  });

  it("a agregacao do KPI NAO carrega a clausula do card (senao um card zeraria os outros)", async () => {
    const banco = cenario();
    await banco.service.buscar({ filtroCardSituacao: "APROVADO" });

    const agregacoes = banco.agregacoes;
    expect(agregacoes.length).toBe(2);
    for (const q of agregacoes) {
      expect(
        q.where.includes("APROVADO"),
        "o predicado do card vazou para o group-by do KPI: clicar num card zeraria os demais.",
      ).toBe(false);
    }
  });
});

describe("paginar DENTRO de um card segue a regra do gate por offset", () => {
  it("com card e offset 0, o KPI vem (filtro novo); com o MESMO card e offset > 0, o KPI some", async () => {
    // Com o filtro de SITUACAO = ATIVO, a lista tem p1, p2, p6 (tres pessoas).
    const primeira = await cenario().service.buscar({ filtroCardSituacao: "ATIVO", limite: 2, offset: 0 });
    expect(primeira.total).toBe(3);
    expect(
      primeira.kpis,
      "clicar no card e um filtro NOVO (offset 0): o KPI tem de vir, recalculado sobre a base.",
    ).toBeDefined();

    const seguinte = await cenario().service.buscar({ filtroCardSituacao: "ATIVO", limite: 2, offset: 2 });
    expect(seguinte.itens.length).toBeGreaterThan(0);
    expect(seguinte.total).toBe(3);
    expect(
      seguinte.kpis,
      "paginar dentro do mesmo card e a MESMA base: o KPI nao se recalcula, vem undefined.",
    ).toBeUndefined();
  });
});
