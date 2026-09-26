import { vi } from "vitest";
import {
  asCandidaturaEtapas,
  asCandidaturas,
  asVagaStatusEventos,
  vagas as vagasTabela,
} from "../../db/schema";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";
import { idDoFiltro } from "./fronteira-encerrada.tester-fake";

/**
 * ─ O BANCO FINGIDO DA REPROVAÇÃO PELO CLIENTE (infraestrutura de teste, nada roda em produção) ──
 *
 * ┌─ POR QUE ELE EXISTE, SE JÁ HÁ `fronteira-encerrada.tester-fake` ─────────────────────────────┐
 * │ Aquele fake devolve a vaga SEM a coluna `status_manual_em`, então ela chega `undefined` na   │
 * │ derivação de status. E `undefined !== null` é VERDADEIRO: a derivação conclui "o status foi   │
 * │ posto à mão" e SAI ANTES de contar o funil. Para as specs dele isso é inócuo (elas não são    │
 * │ sobre derivação), mas aqui seria fatal: o efeito mais caro de esquecer neste gesto é          │
 * │ justamente a vaga deixar de estar ENTREGUE (§A.27), e um fake que desliga a derivação faria   │
 * │ o teste passar com o efeito ausente.                                                          │
 * │                                                                                               │
 * │ CONSERTAR AQUELE ALCANÇARIA AS ~14 SPECS QUE O USAM (§A.26), ligando a derivação em todas de │
 * │ uma vez e mudando a contagem de escritas que várias delas afirmam. Fake próprio, no molde     │
 * │ `*.tester-fake.ts` que a casa já usa para não haver dois `fake-db.ts` se sobrescrevendo.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE MODELA, e só isto: UMA candidatura, UMA vaga com `status_manual_em` NULO (o caso
 * normal: status derivado, não travado à mão) e a contagem de "existe alguém vivo em etapa de
 * entrega ao cliente", que a derivação faz lendo `as_candidaturas`.
 *
 * §A.6: nomes inventados e ids técnicos. Nenhum CPF, e a leitura da ponte para a Admissão nem
 * chega a ser exercitada por este caminho (reprovar pelo cliente não é saída).
 */

const AGORA = new Date("2026-09-26T12:00:00.000Z");

export interface LinhaDaReprovacao {
  id: string;
  candidatoId: string;
  vagaId: string;
  etapa: string;
  situacao: string;
}

export interface EscritaDaReprovacao {
  tabela: unknown;
  valores: Record<string, unknown>;
}

export function linhaDaReprovacao(over: Partial<LinhaDaReprovacao> = {}): LinhaDaReprovacao {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "ENTREVISTA_CLIENTE",
    situacao: "ATIVO",
    ...over,
  };
}

export interface CenarioDaReprovacao {
  candidaturas: LinhaDaReprovacao[];
  /** O status da vaga. `ENTREGUE` é o normal de quem tem gente com o cliente. */
  vagaStatus?: string;
  /**
   * O CARIMBO DO MOVIMENTO MANUAL. NULO é o padrão, e é o caso em que a derivação atua. Preenchido
   * modela o status PEGAJOSO: o time moveu a vaga à mão, e a derivação não encosta (Frente B).
   */
  statusManualEm?: Date | null;
  /** O catálogo de etapas do cenário. Padrão: a semente inteira (Captação é a inicial). */
  etapas?: readonly string[];
}

export function bancoDaReprovacao(cenario: CenarioDaReprovacao) {
  const linhas = cenario.candidaturas.map((l) => ({ ...l }));
  const vaga = {
    id: "vaga-1",
    status: cenario.vagaStatus ?? "ENTREGUE",
    statusManualEm: cenario.statusManualEm === undefined ? null : cenario.statusManualEm,
  };

  const updates: EscritaDaReprovacao[] = [];
  const inserts: EscritaDaReprovacao[] = [];

  const ehIdDeLinha = (valor: string) => linhas.some((l) => l.id === valor);
  const acharLinha = (id: string | null) => linhas.find((l) => l.id === id) ?? null;

  /** AS ETAPAS DE ENTREGA, como o catálogo fingido as declara. Fonte única do cenário. */
  const etapasDeEntrega = new Set(["ENTREVISTA_CLIENTE"]);

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.where = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    /**
     * A LEITURA DA FICHA, no fim de cada ação (`candidaturasPor`). Ela devolve a linha JÁ
     * ATUALIZADA, que é o que o banco faria: o service lê depois de gravar, e um dublê que
     * devolvesse a linha antiga faria a resposta da rota mentir sem nada falhar.
     */
    b.orderBy = () => {
      if (tabela !== asCandidaturas) return Promise.resolve([]);
      const c = linhas[0];
      if (!c) return Promise.resolve([]);
      return Promise.resolve([
        {
          c: {
            ...c,
            motivoDescarte: null,
            posicaoLado: null,
            pretensaoSalarial: null,
            alocadoEm: AGORA,
            atualizadoEm: AGORA,
            ultimoContatoEm: null,
          },
          candidatoNome: "Fulano",
          vagaCodigo: "PS-1",
          vagaNome: "Vaga",
          autor: "Consultor",
        },
      ]);
    };
    /**
     * A leitura da vaga com `FOR UPDATE`, dentro da derivação.
     *
     * DEVOLVE UMA CÓPIA, E NÃO O OBJETO VIVO, e isso não é detalhe: a derivação guarda a linha lida
     * e usa `vaga.status` DEPOIS do `update`, para escrever o `de` do evento da trilha. Com o
     * objeto vivo, o `update` do fake mutaria o mesmo `status` que a rotina ainda vai ler, e o
     * evento nasceria dizendo "de ABERTA para ABERTA". O banco devolve um retrato, não um ponteiro.
     */
    b.for = () => Promise.resolve([{ ...vaga }]);
    /**
     * A CONTAGEM DO FUNIL da derivação: "existe candidatura VIVA em etapa de entrega?". O fake
     * responde sobre o estado JÁ ATUALIZADO das linhas, que é o que o banco faria dentro da mesma
     * transação. É isso que faz o caso do "último a sair devolve a vaga para Aberta" ser real.
     */
    b.limit = () => {
      if (tabela !== asCandidaturas) return Promise.resolve([]);
      const vivo = linhas.find(
        (l) => etapasDeEntrega.has(l.etapa) && l.situacao !== "DESCARTADO" && l.situacao !== "DESISTIU",
      );
      return Promise.resolve(vivo ? [{ id: vivo.id }] : []);
    };
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: (filtro: unknown) => {
        updates.push({ tabela, valores });
        if (tabela === asCandidaturas) {
          const alvo = acharLinha(idDoFiltro(filtro, ehIdDeLinha));
          if (alvo) Object.assign(alvo, valores);
        }
        if (tabela === vagasTabela && typeof valores.status === "string") {
          vaga.status = valores.status;
        }
        return {
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
          returning: async () => [{ id: "vaga-1" }],
        };
      },
    }),
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      inserts.push({ tabela, valores });
      return {
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        returning: async () => [{ id: "novo" }],
      };
    },
  }));

  const query = {
    asCandidaturas: {
      findFirst: async (args?: { where?: unknown }) => {
        const alvo = acharLinha(idDoFiltro(args?.where, ehIdDeLinha));
        return alvo ? { ...alvo } : undefined;
      },
    },
    vagas: { findFirst: async () => vaga },
  };

  const tx = { select, update, insert, query };
  const db = {
    select,
    update,
    insert,
    query,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  return {
    service: new CandidatosService(
      db as never,
      catalogoDeEtapasFingido(cenario.etapas) as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    ),
    linhas,
    updates,
    inserts,
    vaga,
    /** O evento gravado no histórico de etapas, quando houve. */
    eventoDeEtapa: () =>
      inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? null,
    /** O evento da trilha da VAGA, que só existe quando a derivação atuou. */
    eventoDaVaga: () => inserts.find((i) => i.tabela === asVagaStatusEventos)?.valores ?? null,
    /** O que foi gravado NA CANDIDATURA. */
    updateDaCandidatura: () =>
      updates.find((u) => u.tabela === asCandidaturas)?.valores ?? null,
  };
}
