import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { asShortlistItens, asShortlists, vagas as vagasTabela } from "../../db/schema";
import {
  MOTIVO_DE_REENVIO_VALIDO,
  respostaDoCatalogoDeReenvio,
} from "../motivos-reenvio-shortlist/motivos-reenvio-shortlist.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { ShortlistsService } from "./shortlists.service";

/**
 * ─ A SHORTLIST DEPOIS QUE ALGUÉM DELA MUDA DE VAGA (cobertura independente, §A.38) ─────────────
 *
 * ESTE ARQUIVO É DO `tester`, e ele cobre o cruzamento que `shortlists.spec.ts` NÃO PODE cobrir:
 * o dublê de lá (`shortlists.tester-fake.ts`) NÃO MODELA a coluna `vaga_id` da candidatura. A
 * conferência de elegíveis dele filtra só por SITUAÇÃO, então a metade "é DESTA VAGA" da consulta
 * real passa verde por construção, e não por medição.
 *
 * ┌─ POR QUE ISSO IMPORTA AGORA, E NÃO IMPORTAVA ANTES ────────────────────────────────────────────┐
 * │ A TRANSFERÊNCIA DE CANDIDATO DEIXOU DE SER DE MASTER nesta mesma sessão (Frente D). O gesto    │
 * │ que tira alguém da vaga A e o põe na B passou a ser de QUALQUER consultor, e a pessoa na       │
 * │ shortlist já enviada da A é justamente quem se costuma mover (o cliente demorou, apareceu      │
 * │ outra vaga). O conjunto ENVIADO é congelado; o conjunto ELEGÍVEL para o próximo envio não é.   │
 * │                                                                                                │
 * │ O CAMINHO DO DEFEITO, se a metade "é desta vaga" caísse: o REENVIO da vaga A aceitaria um      │
 * │ candidato que hoje pertence à vaga B, o cliente da A receberia o nome de quem não está mais no │
 * │ processo dele, e o unique de `as_shortlist_itens` não pegaria nada (é outro envio, outro id).  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nomes inventados, ids técnicos e datas. Nenhum CPF.
 */

interface CandidaturaFingida {
  id: string;
  candidatoId: string;
  nome: string;
  situacao: string;
  etapa: string;
  /** A COLUNA QUE O DUBLÊ VIZINHO NÃO TEM, e que é o ponto deste arquivo. */
  vagaId: string;
}

/** Os valores de parâmetro que um filtro do Drizzle carrega (mesmo extrator do dublê vizinho). */
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

interface ShortlistGravada {
  id: string;
  numero: number;
  enviadaEm: string;
  motivoReenvioId: string | null;
  avisoCurtaAceito: boolean;
  itens: string[];
}

function banco(cenario: {
  candidaturas: CandidaturaFingida[];
  jaEnviadas?: { numero: number; itens: string[] }[];
}) {
  const VAGA = "vaga-A";
  const vaga = { id: VAGA, status: "ABERTA", envioShortlist: null as string | null };
  const candidaturas = cenario.candidaturas.map((c) => ({ ...c }));
  const shortlists: ShortlistGravada[] = (cenario.jaEnviadas ?? []).map((s) => ({
    id: `sl-${s.numero}`,
    numero: s.numero,
    enviadaEm: "2026-09-01",
    motivoReenvioId: s.numero === 1 ? null : MOTIVO_DE_REENVIO_VALIDO,
    avisoCurtaAceito: false,
    itens: [...s.itens],
  }));

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
    b.for = () => Promise.resolve([{ ...vaga }]);
    b.orderBy = () => {
      // O CATÁLOGO DE MOTIVOS DE REENVIO, lido pelo `enviar` antes da transação.
      const catalogo = respostaDoCatalogoDeReenvio(tabela);
      if (catalogo) return Promise.resolve(catalogo);
      if (tabela === asShortlists) {
        const alvo = parametros(filtro).filter((p) => p.startsWith("sl-"));
        const recorte = alvo.length ? shortlists.filter((s) => alvo.includes(s.id)) : shortlists;
        return Promise.resolve(
          [...recorte]
            .sort((a, z) => a.numero - z.numero)
            .map((s) => ({
              s: { ...s, vagaId: VAGA },
              autor: "Consultor",
              motivoNome: s.motivoReenvioId ? "Cliente Pediu Outro Perfil" : null,
            })),
        );
      }
      if (tabela === asShortlistItens) {
        const alvo = parametros(filtro).filter((p) => p.startsWith("sl-"));
        const linhas: Record<string, unknown>[] = [];
        for (const s of shortlists) {
          if (alvo.length && !alvo.includes(s.id)) continue;
          for (const id of s.itens) {
            const c = candidaturas.find((x) => x.id === id);
            if (!c) continue;
            /*
             * O `innerJoin` COM `as_candidaturas` É INCONDICIONAL na leitura real: ela NÃO filtra
             * por vaga, e é isso que congela o conjunto. O item sobrevive à transferência, e é
             * este ramo do dublê que permite prová-lo.
             */
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
        return Promise.resolve(linhas);
      }
      return Promise.resolve([]);
    };
    b.then = (r: (v: unknown) => unknown) => {
      if (projecao && "maximo" in projecao) {
        return Promise.resolve([
          { maximo: shortlists.reduce((m, s) => Math.max(m, s.numero), 0) },
        ]).then(r);
      }
      /*
       * A CONFERÊNCIA DE ELEGÍVEIS, COM AS DUAS METADES DA CONSULTA REAL:
       *   . `eq(vagaId, <vaga>)`  a pessoa é DESTA vaga  <- a metade que o dublê vizinho não tem;
       *   . situação VIVA.
       */
      const pedidos = parametros(filtro).filter((p) => candidaturas.some((c) => c.id === p));
      const elegiveis = candidaturas.filter(
        (c) =>
          pedidos.includes(c.id) &&
          c.vagaId === VAGA &&
          c.situacao !== "DESCARTADO" &&
          c.situacao !== "DESISTIU",
      );
      return Promise.resolve(elegiveis.map((c) => ({ id: c.id }))).then(r);
    };
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: () => {
        if (tabela === vagasTabela && typeof valores.envioShortlist === "string") {
          vaga.envioShortlist = valores.envioShortlist;
        }
        const pronto = Promise.resolve(undefined);
        return { then: pronto.then.bind(pronto), returning: async () => [{ id: vaga.id }] };
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
      const pronto = Promise.resolve(undefined);
      return {
        then: pronto.then.bind(pronto),
        returning: async () => [
          { id: `sl-${(valores as Record<string, unknown>).numero as number}` },
        ],
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
    /** Move a candidatura para outra vaga, que é o efeito do `trocarVaga` na linha. */
    transferir: (id: string, paraVaga: string) => {
      const c = candidaturas.find((x) => x.id === id);
      if (c) c.vagaId = paraVaga;
    },
  };
}

const pessoa = (over: Partial<CandidaturaFingida> = {}): CandidaturaFingida => ({
  id: "k1",
  candidatoId: "p1",
  nome: "Fulano Inventado",
  situacao: "ATIVO",
  etapa: "SHORTLIST",
  vagaId: "vaga-A",
  ...over,
});

const ENVIO = { enviadaEm: "2026-09-20" };

describe("1. o conjunto ENVIADO é congelado: a transferência não apaga ninguém da lista", () => {
  it("quem foi transferido para outra vaga CONTINUA na shortlist que já foi ao cliente", async () => {
    const { service, transferir } = banco({
      candidaturas: [
        pessoa({ id: "k1", nome: "Ana" }),
        pessoa({ id: "k2", candidatoId: "p2", nome: "Bruno" }),
        pessoa({ id: "k3", candidatoId: "p3", nome: "Carla" }),
      ],
      jaEnviadas: [{ numero: 1, itens: ["k1", "k2", "k3"] }],
    });

    // O CLIENTE DEMOROU, E O BRUNO FOI REALOCADO EM OUTRA VAGA (Frente D, qualquer consultor).
    transferir("k2", "vaga-B");

    const [primeira] = await service.listar("vaga-A");
    expect(primeira.itens.map((i) => i.candidaturaId).sort()).toEqual(["k1", "k2", "k3"]);
  });

  /**
   * E A ETAPA MOSTRADA É A DE HOJE, na vaga NOVA: é escolha do requisito ("o item é congelado, mas
   * a `etapaAtual` é de hoje"), e é o que permite ao consultor ver que aquela pessoa saiu dali.
   */
  it("o item transferido mostra a etapa ATUAL, que é a da vaga nova", async () => {
    const { service, transferir } = banco({
      candidaturas: [pessoa({ id: "k1", nome: "Ana", etapa: "SHORTLIST" })],
      jaEnviadas: [{ numero: 1, itens: ["k1"] }],
    });

    transferir("k1", "vaga-B");

    const [primeira] = await service.listar("vaga-A");
    expect(primeira.itens[0].etapaAtual).toBe("SHORTLIST");
  });
});

describe("2. o conjunto ELEGÍVEL não é congelado: o REENVIO recusa quem já não é desta vaga", () => {
  it("o reenvio que inclui o transferido é RECUSADO, e nenhuma lista nasce", async () => {
    const { service, shortlists, transferir } = banco({
      candidaturas: [
        pessoa({ id: "k1", nome: "Ana" }),
        pessoa({ id: "k2", candidatoId: "p2", nome: "Bruno" }),
        pessoa({ id: "k3", candidatoId: "p3", nome: "Carla" }),
      ],
      jaEnviadas: [{ numero: 1, itens: ["k1", "k2", "k3"] }],
    });

    transferir("k2", "vaga-B");

    await expect(
      service.enviar(
        "vaga-A",
        { ...ENVIO, candidaturaIds: ["k1", "k2", "k3"], motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(shortlists).toHaveLength(1);
  });

  /** §A.6: a recusa é por CONTAGEM. O nome de quem saiu não viaja numa mensagem de erro. */
  it("a recusa não diz QUEM foi transferido", async () => {
    const { service, transferir } = banco({
      candidaturas: [pessoa({ id: "k1", nome: "Ana" }), pessoa({ id: "k2", candidatoId: "p2", nome: "Bruno" })],
      jaEnviadas: [{ numero: 1, itens: ["k1", "k2"] }],
    });

    transferir("k2", "vaga-B");

    const erro = await service
      .enviar(
        "vaga-A",
        { ...ENVIO, candidaturaIds: ["k1", "k2"], motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO },
        "user-1",
      )
      .catch((e: unknown) => e);

    expect(String((erro as Error).message)).not.toContain("Bruno");
    expect(String((erro as Error).message)).toContain("1 de 2");
  });

  it("o reenvio SEM o transferido passa, e a lista nova tem só quem ficou", async () => {
    const { service, shortlists, transferir } = banco({
      candidaturas: [
        pessoa({ id: "k1", nome: "Ana" }),
        pessoa({ id: "k2", candidatoId: "p2", nome: "Bruno" }),
        pessoa({ id: "k3", candidatoId: "p3", nome: "Carla" }),
      ],
      jaEnviadas: [{ numero: 1, itens: ["k1", "k2", "k3"] }],
    });

    transferir("k2", "vaga-B");

    /*
     * A CIÊNCIA ENTROU AQUI PORQUE O REQUISITO MUDOU, e não para fazer o teste passar: a lista que
     * sobrou tem DOIS, e desde a decisão do diretor todo envio com menos de três avisa, inclusive o
     * reenvio. Este é o cenário que o próprio arquivo descreve (a vaga encolheu por transferência),
     * então ele passou a ser justamente o caso em que o aviso existe para aparecer.
     */
    const criada = await service.enviar(
      "vaga-A",
      {
        ...ENVIO,
        candidaturaIds: ["k1", "k3"],
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
        cienteShortlistCurta: true,
      },
      "user-1",
    );

    expect(criada.numero).toBe(2);
    expect(criada.itens.map((i) => i.candidaturaId).sort()).toEqual(["k1", "k3"]);
    expect(shortlists[0].itens.sort()).toEqual(["k1", "k2", "k3"]);
  });

  /**
   * ─ A BORDA QUE O `tester` REPORTOU, E QUE O DIRETOR DECIDIU (decisão 2) ───────────────────────
   *
   * ESTE CASO AFIRMAVA O CONTRÁRIO, de propósito e com o nome dizendo por quê: o aviso da lista
   * curta exigia `numero === 1`, isso era ESCOLHA DE QUEM ESCREVEU e não leitura do requisito, e o
   * caso existia para ficar VERMELHO no dia em que o diretor decidisse o outro lado. Ele decidiu.
   *
   * E O CENÁRIO É JUSTAMENTE O DESTE ARQUIVO, que é o que tornou a decisão óbvia: transferir dois
   * dos três para fora deixa a vaga com UM, e o reenvio de um só era exatamente a lista que passava
   * calada. Depois de transferência e descarte, reenvio curto é o caso NORMAL.
   *
   * O AVISO CONTINUA NÃO BLOQUEANTE, e a segunda metade mede isso: com a ciência, o mesmo envio
   * passa, e o aceite fica GRAVADO (§A.3 regra 8).
   */
  it("o REENVIO com UM candidato AVISA, e passa com a ciência registrada", async () => {
    const cenario = () => ({
      candidaturas: [
        pessoa({ id: "k1", nome: "Ana" }),
        pessoa({ id: "k2", candidatoId: "p2", nome: "Bruno" }),
        pessoa({ id: "k3", candidatoId: "p3", nome: "Carla" }),
      ],
      jaEnviadas: [{ numero: 1, itens: ["k1", "k2", "k3"] }],
    });

    const primeiro = banco(cenario());
    primeiro.transferir("k2", "vaga-B");
    primeiro.transferir("k3", "vaga-B");

    const erro = await primeiro.service
      .enviar(
        "vaga-A",
        { ...ENVIO, candidaturaIds: ["k1"], motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO },
        "user-1",
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(
      ((erro as ConflictException).getResponse() as Record<string, unknown>).quantidade,
    ).toBe(1);
    expect(primeiro.shortlists).toHaveLength(1);

    const segundo = banco(cenario());
    segundo.transferir("k2", "vaga-B");
    segundo.transferir("k3", "vaga-B");

    const criada = await segundo.service.enviar(
      "vaga-A",
      {
        ...ENVIO,
        candidaturaIds: ["k1"],
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
        cienteShortlistCurta: true,
      },
      "user-1",
    );

    expect(criada.numero).toBe(2);
    expect(criada.itens).toHaveLength(1);
    expect(criada.avisoCurtaAceito).toBe(true);
  });
});
