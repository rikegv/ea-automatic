import { vi } from "vitest";
import { asShortlistItens, asShortlists, vagas as vagasTabela } from "../../db/schema";
import {
  MOTIVO_DE_REENVIO_VALIDO,
  NOME_DO_MOTIVO_DE_REENVIO_VALIDO,
  respostaDoCatalogoDeReenvio,
} from "../motivos-reenvio-shortlist/motivos-reenvio-shortlist.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { ShortlistsService } from "./shortlists.service";

/**
 * ─ O BANCO FINGIDO DA SHORTLIST (infraestrutura de teste, nada roda em produção) ────────────────
 *
 * ELE MODELA O QUE O GESTO TOCA, e nada além: a linha da VAGA (travada com `FOR UPDATE`), a
 * contagem `max(numero)` das shortlists daquela vaga, a conferência das candidaturas elegíveis e as
 * três escritas (shortlist, itens e o carimbo em `vagas.envio_shortlist`).
 *
 * ┌─ COMO ELE SEPARA AS CONSULTAS, e por que não é pelo formato da cláusula ─────────────────────┐
 * │ O critério é a TABELA que o `from()` recebeu, comparada por IDENTIDADE com o schema de        │
 * │ verdade, que é o mesmo critério de `respostaDoCatalogoDeDescarte`. Reconhecer por nome de     │
 * │ coluna ou por forma de `where` tornaria o fake sensível a qualquer refatoração da consulta    │
 * │ real, e um fake que quebra com refatoração legítima é um fake que as pessoas desligam.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NOME `*.tester-fake.ts`, pela razão da casa: em construção paralela, dois agentes criando
 * `fake-db.ts` se sobrescrevem em silêncio, e o segundo a gravar apaga o primeiro sem nada falhar.
 *
 * §A.6: nomes inventados de candidato, ids técnicos e datas. Nenhum CPF.
 */

export interface CandidaturaDaShortlist {
  id: string;
  candidatoId: string;
  nome: string;
  situacao: string;
  etapa: string;
}

export interface ShortlistGravada {
  id: string;
  numero: number;
  enviadaEm: string;
  motivoReenvioId: string | null;
  avisoCurtaAceito: boolean;
  itens: string[];
}

export interface CenarioDaShortlist {
  candidaturas: CandidaturaDaShortlist[];
  /** O status da vaga. `ABERTA` (papel ABERTURA) é o caso normal de quem monta shortlist. */
  vagaStatus?: string;
  /** As shortlists que a vaga JÁ tem. É delas que sai o `max(numero)`. */
  jaEnviadas?: { numero: number; enviadaEm: string }[];
  /**
   * A VAGA NÃO EXISTE: o `SELECT ... FOR UPDATE` volta VAZIO, que é o que o banco faz. Modelar
   * assim (e não devolvendo erro do dublê) é o que prova que a recusa vem do SERVICE, sob a trava.
   */
  semVaga?: boolean;
}

export function candidaturaDaShortlist(
  over: Partial<CandidaturaDaShortlist> = {},
): CandidaturaDaShortlist {
  return {
    id: "k1",
    candidatoId: "p1",
    nome: "Fulano Inventado",
    situacao: "ATIVO",
    etapa: "TRIAGEM",
    ...over,
  };
}

export function bancoDaShortlist(cenario: CenarioDaShortlist) {
  const candidaturas = cenario.candidaturas.map((c) => ({ ...c }));
  const vaga = { id: "vaga-1", status: cenario.vagaStatus ?? "ABERTA", envioShortlist: null as string | null };
  const shortlists: ShortlistGravada[] = (cenario.jaEnviadas ?? []).map((s, i) => ({
    id: `sl-${s.numero}`,
    numero: s.numero,
    enviadaEm: s.enviadaEm,
    motivoReenvioId: s.numero === 1 ? null : MOTIVO_DE_REENVIO_VALIDO,
    avisoCurtaAceito: false,
    itens: [],
    ...(i === -1 ? {} : {}),
  }));

  /** Os ids que a consulta de elegíveis recebeu, para a asserção sobre o `in (...)`. */
  const idsConferidos: string[][] = [];

  /**
   * ─ OS PARÂMETROS QUE UM FILTRO DO DRIZZLE CARREGA ─────────────────────────────────────────────
   *
   * ┌─ ELE DESCE EM QUALQUER ARRAY, E ISSO CUSTOU UMA RODADA DE VERMELHO PARA APARECER ──────────┐
   * │ O extrator irmão (`fronteira-encerrada.tester-fake`) só desce por `queryChunks`, e isso     │
   * │ basta para `eq(coluna, valor)`. Para `inArray`, NÃO basta: medido, não deduzido, o objeto   │
   * │ do drizzle guarda os valores em `queryChunks[3]`, que é um ARRAY DE PARÂMETROS, e não um    │
   * │ objeto com `queryChunks` dentro. Parando em `queryChunks`, a lista de ids voltava VAZIA, a  │
   * │ conferência de elegíveis não achava ninguém, e o teste acusava o service de recusar         │
   * │ candidato que ele nunca chegou a ver.                                                        │
   * │                                                                                             │
   * │ FALSO VERMELHO É BARATO QUANDO SE INVESTIGA E CARO QUANDO SE ACREDITA: a leitura errada     │
   * │ aqui parecia um defeito de régua no service.                                                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  function parametros(filtro: unknown): string[] {
    const achados: string[] = [];
    const vistos = new Set<unknown>();
    const visitar = (no: unknown) => {
      if (!no || typeof no !== "object" || vistos.has(no)) return;
      vistos.add(no);
      if (Array.isArray(no)) {
        for (const filho of no) visitar(filho);
        return;
      }
      const c = no as { encoder?: unknown; value?: unknown; queryChunks?: unknown[] };
      if ("encoder" in c && typeof c.value === "string") achados.push(c.value);
      if (Array.isArray(c.queryChunks)) for (const filho of c.queryChunks) visitar(filho);
      if (Array.isArray(c.value)) visitar(c.value);
    };
    visitar(filtro);
    return achados;
  }

  const select = vi.fn((projecao?: Record<string, unknown>) => {
    let tabela: unknown = null;
    let filtro: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = (f: unknown) => {
      filtro = f;
      return b;
    };
    /** A LINHA DA VAGA, TRAVADA (passo 2 da ordem). Cópia, e não o objeto vivo: o banco dá retrato. */
    b.for = () => Promise.resolve(cenario.semVaga ? [] : [{ ...vaga }]);
    b.orderBy = () => {
      /*
       * O CATÁLOGO DE MOTIVOS DE REENVIO, que o `enviar` lê ANTES da transação. Ele termina em
       * `orderBy` como as leituras abaixo, e o critério de separação é o mesmo do resto do arquivo:
       * a TABELA que o `from()` recebeu, por identidade.
       */
      const catalogo = respostaDoCatalogoDeReenvio(tabela);
      if (catalogo) return Promise.resolve(catalogo);
      // A LEITURA das shortlists (com autor) ou a dos ITENS. A projeção diz qual é.
      if (tabela === asShortlists) {
        const alvo = parametros(filtro).filter((p) => p.startsWith("sl-"));
        const recorte = alvo.length ? shortlists.filter((s) => alvo.includes(s.id)) : shortlists;
        return Promise.resolve(
          [...recorte]
            .sort((a, z) => a.numero - z.numero)
            .map((s) => ({
              s: {
                id: s.id,
                vagaId: vaga.id,
                numero: s.numero,
                enviadaEm: s.enviadaEm,
                motivoReenvioId: s.motivoReenvioId,
                avisoCurtaAceito: s.avisoCurtaAceito,
              },
              autor: "Consultor",
              // O NOME VEM DO `leftJoin` COM O CATÁLOGO, então ele é nulo exatamente quando o id é.
              motivoNome: s.motivoReenvioId ? NOME_DO_MOTIVO_DE_REENVIO_VALIDO : null,
            })),
        );
      }
      if (tabela === asShortlistItens) {
        const alvo = parametros(filtro).filter((p) => p.startsWith("sl-"));
        const linhas: Record<string, unknown>[] = [];
        for (const s of shortlists) {
          if (alvo.length && !alvo.includes(s.id)) continue;
          for (const candidaturaId of s.itens) {
            const c = candidaturas.find((x) => x.id === candidaturaId);
            if (!c) continue;
            linhas.push({
              shortlistId: s.id,
              candidaturaId: c.id,
              candidatoId: c.candidatoId,
              candidatoNome: c.nome,
              etapaAtual: c.etapa,
              situacaoAtual: c.situacao,
            });
          }
        }
        return Promise.resolve(linhas.sort((a, z) => String(a.candidatoNome).localeCompare(String(z.candidatoNome))));
      }
      return Promise.resolve([]);
    };
    /**
     * O `max(numero)` e a CONFERÊNCIA DOS ELEGÍVEIS terminam sem `orderBy`, então o `then` resolve
     * as duas. A projeção separa uma da outra sem depender da forma da cláusula.
     */
    b.then = (r: (v: unknown) => unknown) => {
      if (projecao && "maximo" in projecao) {
        const maximo = shortlists.reduce((m, s) => Math.max(m, s.numero), 0);
        return Promise.resolve([{ maximo }]).then(r);
      }
      const pedidos = parametros(filtro).filter((p) => candidaturas.some((c) => c.id === p));
      idsConferidos.push(pedidos);
      const vivos = candidaturas.filter(
        (c) => pedidos.includes(c.id) && c.situacao !== "DESCARTADO" && c.situacao !== "DESISTIU",
      );
      return Promise.resolve(vivos.map((c) => ({ id: c.id }))).then(r);
    };
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: () => {
        if (tabela === vagasTabela && typeof valores.envioShortlist === "string") {
          vaga.envioShortlist = valores.envioShortlist;
        }
        return {
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
          returning: async () => [{ id: vaga.id }],
        };
      },
    }),
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown> | Record<string, unknown>[]) => {
      if (tabela === asShortlists) {
        const v = valores as Record<string, unknown>;
        shortlists.push({
          id: `sl-${v.numero as number}`,
          numero: v.numero as number,
          enviadaEm: v.enviadaEm as string,
          motivoReenvioId: (v.motivoReenvioId as string | null) ?? null,
          avisoCurtaAceito: v.avisoCurtaAceito === true,
          itens: [],
        });
      }
      if (tabela === asShortlistItens) {
        for (const item of valores as Record<string, unknown>[]) {
          const alvo = shortlists.find((s) => s.id === item.shortlistId);
          if (alvo) alvo.itens.push(item.candidaturaId as string);
        }
      }
      return {
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        returning: async () => [{ id: `sl-${(valores as Record<string, unknown>).numero as number}` }],
      };
    },
  }));

  const tx = { select, update, insert };
  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  return {
    service: new ShortlistsService(db as never, catalogoDeStatusFingido() as never),
    shortlists,
    vaga,
    idsConferidos,
    insert,
  };
}
