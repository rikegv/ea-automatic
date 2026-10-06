import { describe, expect, it } from "vitest";
import {
  bancoDaCentral,
  type CandidatoFingido,
  type CandidaturaFingida,
} from "./central-candidatos-conserto.tester-fake";

/**
 * ─ QA ADVERSARIAL (§A.38): "numero do card = resultado do filtro" quando UMA PESSOA tem VARIAS ──
 *
 * NAO escrito pelo autor do conserto. O requisito do diretor e: clicar no card traz EXATAMENTE o
 * que o card contou. O card conta CANDIDATURAS (porEtapa/porSituacao sao agregacoes de
 * `as_candidaturas`), mas a LISTA do backend devolve PESSOAS (uma linha por `as_candidatos`, via
 * `exists`). Estes dois universos so coincidem quando cada pessoa tem no maximo UMA candidatura que
 * casa o card. Com DUAS, o backend sozinho ja diverge, e a igualdade "card = linhas" passa a
 * depender inteiramente de o FRONTEND expandir a lista por candidatura (`linhasBase.flatMap`).
 *
 * Estes testes DOCUMENTAM esse contrato implicito: provam que o numero do backend (pessoas) NAO e o
 * numero do card (candidaturas) no caso multiplo, para que ninguem "simplifique" o front para listar
 * por pessoa achando que o backend ja garante a igualdade. Ele nao garante.
 */

describe("card = filtro quando a MESMA pessoa tem duas candidaturas que casam o card", () => {
  it("duas ATIVO na MESMA etapa: porEtapa conta 2, mas a lista do backend traz 1 PESSOA", async () => {
    const candidatos: CandidatoFingido[] = [{ id: "p1", nome: "Ana", origem: "PANDAPE" }];
    const candidaturas: CandidaturaFingida[] = [
      { id: "c1", candidatoId: "p1", vagaId: "v1", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" },
      { id: "c2", candidatoId: "p1", vagaId: "v2", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" },
    ];
    const { service } = bancoDaCentral({ candidatos, candidaturas });

    const base = await service.buscar({});
    // O CARD conta CANDIDATURAS: duas ATIVO em ENTREVISTA_SOULAN.
    expect(base.kpis!.porEtapa).toEqual({ ENTREVISTA_SOULAN: 2 });

    const comCard = await service.buscar({ filtroCardEtapa: "ENTREVISTA_SOULAN" });
    // A LISTA conta PESSOAS: uma unica pessoa (p1), com as DUAS candidaturas na projecao.
    expect(comCard.itens.map((i) => i.id)).toEqual(["p1"]);
    expect(comCard.total).toBe(1);
    const candsDeP1 = comCard.itens[0].candidaturas ?? [];
    expect(candsDeP1).toHaveLength(2);

    // ESTE E O PONTO: o numero do card (2) NAO e o numero de linhas do backend (1). A igualdade so
    // nasce quando o front expande por candidatura e filtra por `cardDaCandidatura`. Se alguem fizer
    // a tela listar por PESSOA, o card dira 2 e a tela mostrara 1, e este teste explica por que.
    const candidaturasDaEtapa = candsDeP1.filter(
      (c) => c.etapa === "ENTREVISTA_SOULAN" && c.situacao === "ATIVO",
    ).length;
    expect(
      candidaturasDaEtapa,
      "o front precisa de 2 LINHAS (uma por candidatura) para bater com o card = 2",
    ).toBe(base.kpis!.porEtapa.ENTREVISTA_SOULAN);
  });

  it("duas candidaturas, uma ATIVO numa etapa e outra APROVADO: o card da etapa conta so a ATIVO", async () => {
    const candidatos: CandidatoFingido[] = [{ id: "p1", nome: "Ana", origem: "PANDAPE" }];
    const candidaturas: CandidaturaFingida[] = [
      { id: "c1", candidatoId: "p1", vagaId: "v1", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" },
      { id: "c2", candidatoId: "p1", vagaId: "v2", etapa: "APROVACAO", situacao: "APROVADO" },
    ];
    const { service } = bancoDaCentral({ candidatos, candidaturas });

    const base = await service.buscar({});
    expect(base.kpis!.porEtapa).toEqual({ ENTREVISTA_SOULAN: 1 });
    // porSituacao conta TODAS: a ATIVO e a APROVADO.
    expect(base.kpis!.porSituacao).toEqual({ ATIVO: 1, APROVADO: 1 });

    // Clicar no card da ETAPA ENTREVISTA_SOULAN traz a pessoa (exists ATIVO naquela etapa), mas a
    // projecao vem com as DUAS candidaturas. O front TEM de filtrar por `cardDaCandidatura` para nao
    // mostrar a linha APROVADO sob o card de etapa; o backend por si nao separa isso.
    const comCard = await service.buscar({ filtroCardEtapa: "ENTREVISTA_SOULAN" });
    expect(comCard.itens.map((i) => i.id)).toEqual(["p1"]);
    const projetadas = comCard.itens[0].candidaturas ?? [];
    expect(projetadas).toHaveLength(2);
    const soDoCard = projetadas.filter(
      (c) => c.etapa === "ENTREVISTA_SOULAN" && c.situacao === "ATIVO",
    );
    expect(
      soDoCard,
      "sem o filtro client-side por candidatura, a linha APROVADA apareceria sob o card da etapa",
    ).toHaveLength(1);
  });

  it("card de SITUACAO: duas APROVADO na mesma pessoa contam 2 no card, 1 pessoa na lista", async () => {
    const candidatos: CandidatoFingido[] = [{ id: "p1", nome: "Ana", origem: "PANDAPE" }];
    const candidaturas: CandidaturaFingida[] = [
      { id: "c1", candidatoId: "p1", vagaId: "v1", etapa: "APROVACAO", situacao: "APROVADO" },
      { id: "c2", candidatoId: "p1", vagaId: "v2", etapa: "APROVACAO", situacao: "APROVADO" },
    ];
    const { service } = bancoDaCentral({ candidatos, candidaturas });

    const base = await service.buscar({});
    expect(base.kpis!.porSituacao).toEqual({ APROVADO: 2 });

    const comCard = await service.buscar({ filtroCardSituacao: "APROVADO" });
    expect(comCard.itens.map((i) => i.id)).toEqual(["p1"]);
    expect(comCard.total).toBe(1);
    expect(
      (comCard.itens[0].candidaturas ?? []).filter((c) => c.situacao === "APROVADO"),
      "o card = 2 so bate se o front expandir em 2 linhas",
    ).toHaveLength(2);
  });
});
