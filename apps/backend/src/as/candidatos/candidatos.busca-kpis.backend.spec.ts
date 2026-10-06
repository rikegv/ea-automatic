import { describe, expect, it } from "vitest";
import { bancoDaBuscaComFunil } from "./busca-funil.tester-fake";

/**
 * ─ OS KPIS CONTAM O CONJUNTO FILTRADO INTEIRO, NUNCA A PAGINA (06/10/2026) ───────────────────────
 *
 * A tela derivava os cards de etapa/situacao das linhas CARREGADAS. Com 200 de 81 mil, o time lia
 * "95 em Captacao" quando sao dezenas de milhares. O `buscar` passou a devolver `kpis` contados no
 * servidor, sobre os MESMOS filtros, ANTES do `limit`. §A.6: sao agregados, nenhum identificado desce.
 */

/** Cinco pessoas, uma candidatura cada: 3 CAPTACAO / 2 TRIAGEM, e 4 ATIVO / 1 DESCARTADO. */
function cincoCandidaturas(origem?: string) {
  return bancoDaBuscaComFunil({
    pessoas: [
      { id: "p1", nome: "Ana", origem },
      { id: "p2", nome: "Bia", origem },
      { id: "p3", nome: "Caio", origem },
      { id: "p4", nome: "Duda", origem },
      { id: "p5", nome: "Eva", origem },
    ],
    candidaturas: [
      { id: "c1", candidatoId: "p1", vagaId: "v1", etapa: "CAPTACAO", situacao: "ATIVO" },
      { id: "c2", candidatoId: "p2", vagaId: "v1", etapa: "CAPTACAO", situacao: "ATIVO" },
      { id: "c3", candidatoId: "p3", vagaId: "v1", etapa: "CAPTACAO", situacao: "ATIVO" },
      { id: "c4", candidatoId: "p4", vagaId: "v2", etapa: "TRIAGEM", situacao: "ATIVO" },
      { id: "c5", candidatoId: "p5", vagaId: "v2", etapa: "TRIAGEM", situacao: "DESCARTADO" },
    ],
  });
}

describe("os KPIs do `buscar` refletem a base filtrada, e nao a pagina", () => {
  it("com a pagina em 2, os KPIs ainda contam as 5 candidaturas", async () => {
    const { service } = cincoCandidaturas();

    const pagina = await service.buscar({ limite: 2 });

    // A PAGINA e de 2, o total e 5: o corte existe e e dizivel.
    expect(pagina.itens).toHaveLength(2);
    expect(pagina.total).toBe(5);

    // OS KPIS veem as 5, nao as 2 carregadas: a prova de que a agregacao nao leva o `limit`.
    expect(pagina.kpis).toBeDefined();
    /*
     * `porEtapa` CONTA SO QUEM ESTA EM SELECAO (06/10/2026): a quinta candidatura e TRIAGEM mas
     * DESCARTADO, entao ela NAO entra no `porEtapa` (a situacao vence a etapa) e TRIAGEM e 1, nao 2.
     * Ela aparece no `porSituacao` como DESCARTADO. Antes desta correcao o card de etapa somava o
     * descartado e o clique no card vinha vazio.
     */
    expect(pagina.kpis!.porEtapa).toEqual({ CAPTACAO: 3, TRIAGEM: 1 });
    expect(pagina.kpis!.porSituacao).toEqual({ ATIVO: 4, DESCARTADO: 1 });
  });

  it("o filtro de origem PROPAGA para a consulta dos KPIs", async () => {
    const { service, consultas } = cincoCandidaturas("DIGAI");

    await service.buscar({ origem: "DIGAI" });

    // As consultas de agregacao (as que levam `groupBy`) tem de carregar o MESMO filtro do `buscar`.
    const agregacoes = consultas.filter((q) => q.grupo.length > 0);
    expect(agregacoes.length).toBe(2);
    for (const q of agregacoes) {
      expect(
        q.where,
        "o filtro do `buscar` nao chegou ao KPI: os cards contariam a base inteira, nao o recorte.",
      ).toContain("DIGAI");
    }
  });

  it("a chamada `semCandidatura` nao calcula KPI (nao ha funil a contar)", async () => {
    const { service, consultas } = cincoCandidaturas();

    const pagina = await service.buscar({ semCandidatura: true });

    expect(pagina.kpis).toBeUndefined();
    // E nem foi ao banco agregar: nenhuma consulta com `groupBy`.
    expect(consultas.filter((q) => q.grupo.length > 0)).toHaveLength(0);
  });
});
