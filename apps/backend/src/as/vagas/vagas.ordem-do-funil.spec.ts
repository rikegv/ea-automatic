import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { asCandidaturas } from "../../db/schema";
import { VagasService } from "./vagas.service";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ A ORDEM DO FUNIL NA FILA DE PENDENTES: O DEFEITO QUE NÃO QUEBRA, SÓ MENTE ────────────────────
 *
 * ┌─ POR QUE ESTE É O RISCO Nº 1 DA FRENTE DAS ETAPAS ────────────────────────────────────────────┐
 * │ A lista de candidatos que segura o fechamento da vaga é ordenada DO FIM DO FUNIL PARA O COMEÇO:│
 * │ quem está na última etapa é o mais caro de esquecer e tem de aparecer primeiro. Isso era       │
 * │ `CANDIDATURA_ETAPAS.indexOf(...)`, sobre uma constante de código.                              │
 * │                                                                                                │
 * │ COM A LISTA VIRANDO DADO, um `indexOf` sobre qualquer outra lista CONTINUA COMPILANDO e passa a│
 * │ ordenar errado, sem erro nenhum, sem alarme nenhum. É por isso que a ordem tem teste próprio:  │
 * │ nada mais nesta frente falha em silêncio desse jeito.                                          │
 * │                                                                                                │
 * │ E TEM O CASO DO `-1`: `indexOf` de quem não está na lista devolve `-1`, o que jogava a etapa   │
 * │ DESCONHECIDA (uma inativada, por exemplo) para ANTES da primeira do funil, isto é, para o fim  │
 * │ da fila de urgência. `posicaoNoFunil` a manda para o FIM DO FUNIL, que é o lado certo.         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a lista de pendentes carrega nome (a tela precisa dizer QUEM está pendurado) e nunca CPF.
 * Este teste não introduz campo nenhum: afirma só a ORDEM do que já saía.
 */

/** Um funil do diretor, com uma etapa NOVA no meio e uma etapa INATIVADA fora da fila oferecida. */
function catalogoComEtapaNoMeio() {
  const ordem = new Map<string, number>([
    ["CAPTACAO", 1],
    ["TRIAGEM", 2],
    // A etapa que o diretor criou e reordenou para o MEIO. Ela não pode aparecer nem no começo nem
    // no fim da fila só por ter sido criada por último.
    ["PROVA_PRATICA", 3],
    ["APROVACAO", 4],
    // INATIVADA, e ainda assim NO MAPA: quem ficou parado nela precisa de um lugar, não de um buraco.
    ["ETAPA_APOSENTADA", 5],
  ]);
  return { ordemPorCodigo: async () => ordem };
}

function pendente(nome: string, etapa: string) {
  return {
    candidaturaId: `cand-${nome}`,
    candidatoId: `pessoa-${nome}`,
    candidatoNome: nome,
    etapa,
    situacao: "ATIVO",
    posicaoLado: null,
  };
}

function makeDb(linhas: ReturnType<typeof pendente>[], catalogo: unknown) {
  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    b.for = () => Promise.resolve([{ id: "vaga-1", status: "ABERTA", posicoesOficiais: 5 }]);
    b.orderBy = () => (tabela === asCandidaturas ? Promise.resolve(linhas) : Promise.resolve([]));
    b.groupBy = () => Promise.resolve([]);
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
    return b;
  });

  const tx = { select, update: () => ({ set: () => ({ where: async () => undefined }) }) };
  const db = {
    select,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return new VagasService(db as never, catalogo as never, catalogoDeStatusFingido() as never);
}

/** A fila de pendentes que a recusa devolve, na ordem em que ela foi montada. */
async function filaDaRecusa(linhas: ReturnType<typeof pendente>[], catalogo: unknown) {
  const service = makeDb(linhas, catalogo);
  const erro = await service
    .fechar("vaga-1", { dataFechamento: "2026-09-09" } as never, { id: "user-1" } as never)
    .catch((e) => e);

  expect(erro).toBeInstanceOf(ConflictException);
  const corpo = (erro as ConflictException).getResponse() as {
    pendentes: { candidatoNome: string; etapa: string }[];
  };
  return corpo.pendentes.map((p) => p.candidatoNome);
}

describe("a fila de pendentes do fechamento ordena pela `ordem` do CATÁLOGO", () => {
  it("do FIM do funil para o COMEÇO: quem está mais adiantado aparece primeiro", async () => {
    const fila = await filaDaRecusa(
      [
        pendente("Ana", "CAPTACAO"),
        pendente("Bruno", "APROVACAO"),
        pendente("Célia", "TRIAGEM"),
      ],
      catalogoComEtapaNoMeio(),
    );

    expect(fila).toEqual(["Bruno", "Célia", "Ana"]);
  });

  /**
   * A ETAPA CRIADA PELO DIRETOR E ARRASTADA PARA O MEIO. Com o `indexOf` da constante antiga, ela
   * nem existiria na lista e cairia em `-1`; com o catálogo, ela fica exatamente onde ele a pôs.
   */
  it("a etapa NOVA no meio do funil fica entre as vizinhas, sem ninguém tocar nesta tela", async () => {
    const fila = await filaDaRecusa(
      [
        pendente("Ana", "CAPTACAO"),
        pendente("Bruno", "APROVACAO"),
        pendente("Dora", "PROVA_PRATICA"),
        pendente("Célia", "TRIAGEM"),
      ],
      catalogoComEtapaNoMeio(),
    );

    expect(fila).toEqual(["Bruno", "Dora", "Célia", "Ana"]);
  });

  /**
   * O CASO DO `-1`, QUE É O QUE A FUNÇÃO NOVA CONSERTA. Uma etapa fora do mapa (apontada por linha
   * antiga, ou por um catálogo que encolheu) vai para o FIM da urgência, e não para o começo.
   */
  it("a etapa DESCONHECIDA do catálogo vai para o fim da fila, nunca para o topo", async () => {
    const fila = await filaDaRecusa(
      [
        pendente("Ana", "CAPTACAO"),
        pendente("Zeca", "ETAPA_QUE_SUMIU_DO_CATALOGO"),
        pendente("Bruno", "APROVACAO"),
      ],
      catalogoComEtapaNoMeio(),
    );

    // Zeca vem ANTES de todo mundo na ordem do funil (posição máxima = mais adiantado), e é isso que
    // se afirma: ele NÃO é tratado como quem está na Captação, que é o que o `-1` fazia.
    expect(fila[0]).toBe("Zeca");
    expect(fila.at(-1)).toBe("Ana");
  });
});
