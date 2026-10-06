import { describe, expect, it } from "vitest";
import {
  bancoDaCentral,
  type CandidatoFingido,
  type CandidaturaFingida,
} from "./central-candidatos-conserto.tester-fake";

/**
 * ─ O CLIQUE NO CARD FILTRA A BASE INTEIRA, E O CARD CONTA SÓ EM SELEÇÃO (06/10/2026) ─────────────
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ──────────────────────────────────────────────┐
 * │ O card mostrava o número de `kpisDaBusca` (base inteira), mas o clique filtrava só as linhas   │
 * │ CARREGADAS, no navegador. APROVACAO exibia 393 e o clique vinha vazio, por dois motivos que    │
 * │ se somavam: (1) o `porEtapa` contava quem já saíra (a situação vence a etapa), e (2) o filtro  │
 * │ não ia ao servidor. Aqui provamos as duas correções e, principalmente, que o filtro de card    │
 * │ NÃO contamina os KPIs (clicar num card não pode zerar os outros).                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Seis pessoas, uma candidatura cada, desenhadas para separar ETAPA de SITUAÇÃO:
 *  - p1, p2: ENTREVISTA_SOULAN / ATIVO  (em seleção, nesta etapa)
 *  - p3, p4: APROVACAO / APROVADO       (etapa APROVACAO, mas NÃO em seleção, o caso do bug)
 *  - p5:     CAPTACAO / DESCARTADO      (saiu, etapa CAPTACAO gravada)
 *  - p6:     CAPTACAO / ATIVO           (em seleção, em CAPTACAO)
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

describe("`porEtapa` conta só quem está em seleção (ATIVO)", () => {
  it("candidatura em etapa APROVACAO mas APROVADO NÃO entra em porEtapa; entra em porSituacao", async () => {
    const { service } = cenario();

    const pagina = await service.buscar({});

    // porEtapa: só os ATIVO. ENTREVISTA_SOULAN tem 2, CAPTACAO tem 1 (p6; p5 é DESCARTADO).
    expect(pagina.kpis!.porEtapa).toEqual({ ENTREVISTA_SOULAN: 2, CAPTACAO: 1 });
    // APROVACAO tem gente (p3, p4), mas APROVADO, então NÃO aparece no card de etapa.
    expect(
      pagina.kpis!.porEtapa.APROVACAO,
      "a situação vence a etapa: APROVADO não conta no card da etapa APROVACAO",
    ).toBeUndefined();

    // porSituacao conta TODAS: 3 ATIVO, 2 APROVADO, 1 DESCARTADO.
    expect(pagina.kpis!.porSituacao).toEqual({ ATIVO: 3, APROVADO: 2, DESCARTADO: 1 });
  });
});

describe("o filtro de card traz da BASE INTEIRA, pela régua do cardDaCandidatura", () => {
  it("filtroCardEtapa traz só quem tem candidatura ATIVO naquela etapa", async () => {
    const { service } = cenario();

    const pagina = await service.buscar({ filtroCardEtapa: "ENTREVISTA_SOULAN" });

    const ids = pagina.itens.map((i) => i.id).sort();
    expect(ids, "só p1 e p2 estão ATIVO em ENTREVISTA_SOULAN").toEqual(["p1", "p2"]);
    expect(pagina.total).toBe(2);
  });

  it("filtroCardEtapa numa etapa sem ninguém ATIVO traz vazio (p3/p4 são APROVADO)", async () => {
    const { service } = cenario();

    const pagina = await service.buscar({ filtroCardEtapa: "APROVACAO" });

    expect(pagina.itens, "etapa APROVACAO só tem APROVADO, que não é card de etapa").toEqual([]);
    expect(pagina.total).toBe(0);
  });

  it("filtroCardSituacao traz os da situação, em qualquer etapa", async () => {
    const { service } = cenario();

    const aprovados = await service.buscar({ filtroCardSituacao: "APROVADO" });
    expect(aprovados.itens.map((i) => i.id).sort()).toEqual(["p3", "p4"]);

    const descartados = await service.buscar({ filtroCardSituacao: "DESCARTADO" });
    expect(descartados.itens.map((i) => i.id)).toEqual(["p5"]);

    const ativos = await service.buscar({ filtroCardSituacao: "ATIVO" });
    expect(ativos.itens.map((i) => i.id).sort()).toEqual(["p1", "p2", "p6"]);
  });
});

describe("o filtro de card NÃO muda os KPIs (clicar num card não zera os outros)", () => {
  it("os KPIs com filtroCardSituacao são idênticos aos da base, e só a lista encolhe", async () => {
    const { service } = cenario();

    const base = await service.buscar({});
    const comCard = await service.buscar({ filtroCardSituacao: "APROVADO" });

    // A LISTA mudou: o card filtrou de 6 para 2.
    expect(base.total).toBe(6);
    expect(comCard.total).toBe(2);

    // OS KPIS NÃO mudaram: são contados sobre a base SEM o filtro de card.
    expect(comCard.kpis!.porEtapa).toEqual(base.kpis!.porEtapa);
    expect(comCard.kpis!.porSituacao).toEqual(base.kpis!.porSituacao);
  });

  it("os KPIs com filtroCardEtapa também ficam intactos", async () => {
    const { service } = cenario();

    const base = await service.buscar({});
    const comCard = await service.buscar({ filtroCardEtapa: "ENTREVISTA_SOULAN" });

    expect(comCard.total).toBe(2);
    expect(comCard.kpis!.porEtapa).toEqual(base.kpis!.porEtapa);
    expect(comCard.kpis!.porSituacao).toEqual(base.kpis!.porSituacao);
  });

  it("a agregação do KPI NÃO carrega o filtro de card na sua cláusula", async () => {
    // O objeto é mantido (e não desestruturado) porque `agregacoes` é um GETTER: lê as consultas
    // registradas no momento do acesso, que tem de ser DEPOIS do `buscar`.
    const banco = cenario();

    await banco.service.buscar({ filtroCardSituacao: "APROVADO" });

    // As agregações (groupBy) são as consultas do KPI. Nenhuma pode conter a cláusula de card:
    // o card entra só na lista de pessoas, nunca no WHERE que alimenta os cards.
    const agregacoes = banco.agregacoes;
    expect(agregacoes.length).toBe(2);
    for (const q of agregacoes) {
      expect(
        q.where.includes("APROVADO"),
        "o filtro de card vazou para o KPI: clicar num card zeraria os outros cards.",
      ).toBe(false);
    }
  });
});
