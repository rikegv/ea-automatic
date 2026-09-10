import { describe, expect, it, vi } from "vitest";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { CandidatosService } from "./candidatos.service";

/**
 * ─ ONDE A CANDIDATURA NASCE: O DEFAULT DO BANCO MORREU, E ESTE TESTE É QUEM GUARDA O LUGAR ──────
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, e ele era SILENCIOSO ────────────────────────┐
 * │ A etapa de nascimento NÃO ESTAVA EM CÓDIGO NENHUM: era o `DEFAULT 'CAPTACAO'` da coluna. O    │
 * │ service inseria a candidatura SEM etapa e depois lia de volta (`returning({ etapa })`) o valor │
 * │ que o BANCO tinha escolhido, para gravar o evento de ENTRADA do histórico com ele.             │
 * │                                                                                                │
 * │ Com a lista virando dado do diretor, esse default seria um SEGUNDO DONO da decisão, capaz de   │
 * │ apontar para uma etapa que ele INATIVOU, sem erro nenhum: a FK só reclama de etapa APAGADA, e  │
 * │ etapa com histórico nunca é apagada, só inativada. A candidatura nasceria num lugar que sumiu  │
 * │ dos seletores, e ninguém saberia até alguém procurar a pessoa e não achar.                     │
 * │                                                                                                │
 * │ O DEFAULT FOI REMOVIDO NA MIGRATION 0100 e a etapa passou a ser LIDA do catálogo e PASSADA no  │
 * │ INSERT. Este teste afirma o elo, que é a parte que o compilador não vê: não basta o catálogo   │
 * │ saber quem é a inicial, o INSERT tem de usar essa resposta.                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A PROVA É COM UM CATÁLOGO QUE NÃO COMEÇA EM `CAPTACAO`. Um teste que semeasse a lista de hoje
 * passaria igual com o valor cravado no código, que é exatamente o defeito: ele afirmaria a
 * coincidência em vez do elo.
 *
 * §A.6: o candidato fingido tem id e nome. Sem CPF, sem contato.
 */

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/** O catálogo do diretor: três etapas dele, e a inicial NÃO é a primeira da fila nem `CAPTACAO`. */
function catalogoDoDiretor() {
  const linhas = [
    { id: 1, codigo: "ENTRADA", rotulo: "Entrada", ordem: 1, tom: "nt" as const, inicial: false, ativa: true },
    { id: 2, codigo: "PROVA_PRATICA", rotulo: "Prova Prática", ordem: 2, tom: "in" as const, inicial: true, ativa: true },
    { id: 3, codigo: "OFERTA", rotulo: "Oferta", ordem: 3, tom: "ok" as const, inicial: false, ativa: true },
  ];
  return {
    listar: async () => linhas,
    codigosAtivos: async () => linhas.map((e) => e.codigo),
    ordemPorCodigo: async () => new Map(linhas.map((e) => [e.codigo, e.ordem])),
    etapaInicial: async () => linhas.find((e) => e.inicial)!,
    exigirEtapaAtiva: async (codigo: string) => linhas.find((e) => e.codigo === codigo)!,
  };
}

function makeDb(catalogo: unknown) {
  const inserts: Escrita[] = [];

  /**
   * O `returning` DEVOLVE O QUE FOI ESCRITO, e não um valor fixo, de propósito: um fake que
   * devolvesse `"CAPTACAO"` sempre esconderia justamente a ligação sob teste, porque o evento de
   * ENTRADA do histórico é gravado com o que volta daqui.
   */
  const registrarInsert = (tabela: unknown) => ({
    values: (v: Record<string, unknown>) => {
      inserts.push({ tabela, valores: v });
      const p = Promise.resolve(undefined) as Promise<unknown> & {
        returning?: () => Promise<unknown[]>;
      };
      p.returning = async () => [{ id: "cand-nova", etapa: v.etapa }];
      return p;
    },
  });

  const select = vi.fn(() => {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.where = () => Promise.resolve([]); // nenhuma candidatura anterior nesta vaga
    return b;
  });

  const tx = { insert: vi.fn(registrarInsert) };
  const db = {
    select,
    insert: vi.fn(registrarInsert),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      asCandidatos: { findFirst: async () => ({ id: "pessoa-1", nome: "Fulano" }) },
      vagas: { findFirst: async () => ({ id: "vaga-1", status: "ABERTA" }) },
    },
  };

  const service = new CandidatosService(db as never, catalogo as never);
  // `candidatura(id)` monta a resposta com um join que este fake não serve, e ela não é o objeto do
  // teste: o que interessa é o que foi ESCRITO. A leitura final é neutralizada.
  vi.spyOn(service as never as { candidatura: () => Promise<unknown> }, "candidatura").mockResolvedValue(
    {} as never,
  );
  return { service, inserts };
}

const daCandidatura = (i: Escrita[]) => i.find((x) => x.tabela === asCandidaturas)?.valores ?? {};
const doHistorico = (i: Escrita[]) => i.find((x) => x.tabela === asCandidaturaEtapas)?.valores ?? {};

describe("a candidatura nasce na etapa MARCADA no catálogo, e não numa palavra escrita em código", () => {
  it("com o funil do diretor, ela nasce em PROVA_PRATICA, que é a marcada como inicial", async () => {
    const { service, inserts } = makeDb(catalogoDoDiretor());

    await service.alocar("pessoa-1", { vagaId: "vaga-1" } as never, "user-1");

    expect(daCandidatura(inserts).etapa).toBe("PROVA_PRATICA");
  });

  /**
   * O EVENTO DE ENTRADA TEM DE CONCORDAR COM A LINHA, senão a linha do tempo diz que a pessoa entrou
   * num lugar e a candidatura diz que ela está em outro, no mesmo instante.
   */
  it("o evento de ENTRADA do histórico é gravado na MESMA etapa, com `etapaDe` nula", async () => {
    const { service, inserts } = makeDb(catalogoDoDiretor());

    await service.alocar("pessoa-1", { vagaId: "vaga-1" } as never, "user-1");

    expect(doHistorico(inserts).etapaPara).toBe("PROVA_PRATICA");
    expect(doHistorico(inserts).etapaDe).toBeNull();
    expect(doHistorico(inserts).situacao).toBeNull();
  });

  it("com a semente de hoje, nasce em CAPTACAO: o comportamento de sempre continua igual", async () => {
    const { service, inserts } = makeDb(catalogoDeEtapasFingido());

    await service.alocar("pessoa-1", { vagaId: "vaga-1" } as never, "user-1");

    expect(daCandidatura(inserts).etapa).toBe("CAPTACAO");
  });

  /**
   * SEM ETAPA INICIAL, RECUSA ANTES DE ESCREVER. Melhor o cadastro falhar com uma frase que diz o
   * que fazer do que nascer candidatura sem lugar no funil, que a FK recusaria com violação crua.
   */
  it("catálogo sem nenhuma inicial: recusa e NÃO escreve nada", async () => {
    const semInicial = {
      ...catalogoDoDiretor(),
      etapaInicial: async () => {
        throw new Error("nenhuma etapa inicial");
      },
    };
    const { service, inserts } = makeDb(semInicial);

    await expect(service.alocar("pessoa-1", { vagaId: "vaga-1" } as never, "user-1")).rejects.toThrow();
    expect(inserts).toHaveLength(0);
  });
});
