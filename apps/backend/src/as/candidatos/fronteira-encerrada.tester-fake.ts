import { vi } from "vitest";
import { asCandidaturaEtapas, asCandidaturas, vagas as vagasTabela } from "../../db/schema";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ O BANCO FINGIDO DA FRONTEIRA ENCERRADA→VIVA (infraestrutura de teste, nada roda em produção) ─
 *
 * ┌─ POR QUE ELE EXISTE, SE JÁ HÁ FAKE DE BANCO NOS SPECS VIZINHOS ─────────────────────────────┐
 * │ Os fakes que existem (`candidatos.desvincular-da-vaga.spec`, `candidatos.lote-*.spec`)       │
 * │ guardam UMA candidatura só, porque as réguas que eles afirmam são de uma linha. A cobertura   │
 * │ que falta é sobre LOTE MISTO: três vivos e dois encerrados na MESMA seleção, com a exigência  │
 * │ de que os três gravem e os dois voltem em `falhas`. Isso é impossível de afirmar com um fake  │
 * │ de uma linha, e alterar os fakes vizinhos alcançaria spec de outras frentes (§A.26).          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NOME DE ARQUIVO QUE NINGUÉM MAIS ESCOLHERIA (`*.tester-fake.ts`), pela mesma razão da onda B1: em
 * construção paralela, dois agentes criando `fake-db.ts` se sobrescrevem em silêncio, e o segundo a
 * gravar apaga o primeiro sem nada falhar.
 *
 * ─ COMO ELE ACHA A LINHA CERTA, e por que isso precisou de um extrator ────────────────────────
 * O service filtra por `eq(asCandidaturas.id, x)`, e o fake precisa saber QUAL x para devolver a
 * linha certa num cenário de cinco candidaturas. O valor está num `Param` dentro de `queryChunks`
 * do objeto SQL do drizzle (medido, não suposto: o chunk com `encoder` carrega `value`). Sem isto o
 * fake devolveria sempre a mesma linha e o lote misto passaria afirmando o dublê, não o service.
 */

/** A candidatura como as consultas deste módulo a enxergam. */
export interface LinhaFingida {
  id: string;
  candidatoId: string;
  vagaId: string;
  etapa: string;
  situacao: string;
  motivoDescarte: string | null;
  posicaoLado: string | null;
  alocadoEm: Date;
  atualizadoEm: Date;
  ultimoContatoEm: Date | null;
}

export interface EscritaFingida {
  tabela: unknown;
  id: string | null;
  valores: Record<string, unknown>;
}

const AGORA = new Date("2026-09-11T12:00:00.000Z");

export function linhaFingida(over: Partial<LinhaFingida> = {}): LinhaFingida {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "TRIAGEM",
    situacao: "ATIVO",
    motivoDescarte: null,
    posicaoLado: null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    ...over,
  };
}

/**
 * O ID QUE UM `eq(coluna, valor)` DO DRIZZLE CARREGA.
 *
 * Ele varre `queryChunks` procurando o chunk de parâmetro (o que tem `encoder`) e devolve o `value`
 * dele. Devolve `null` quando não acha, e quem chama trata o `null` como "não sei filtrar", nunca
 * como "achei nada": um fake que silenciasse aqui devolveria a linha errada e o teste afirmaria uma
 * coisa que o service não fez.
 */
export function parametrosDoFiltro(filtro: unknown): string[] {
  const achados: string[] = [];
  const visitar = (no: unknown) => {
    const c = no as { encoder?: unknown; value?: unknown; queryChunks?: unknown[] } | null;
    if (!c || typeof c !== "object") return;
    if ("encoder" in c && typeof c.value === "string") achados.push(c.value);
    if (Array.isArray(c.queryChunks)) for (const filho of c.queryChunks) visitar(filho);
  };
  visitar(filtro);
  return achados;
}

/**
 * O ID DE CANDIDATURA QUE UM FILTRO DO DRIZZLE CARREGA.
 *
 * ─ A RECURSÃO NÃO É ZELO, e ela custou dois testes vermelhos para aparecer ────────────────────
 * A primeira versão olhava só o nível de cima e funcionava para `eq(id, x)`. A reversão do envio
 * filtra por `and(eq(id, x), eq(situacao, y))`, e num `and` os chunks do topo são os SQL FILHOS, que
 * não carregam parâmetro nenhum: o extrator devolvia `null`, o fake não achava a linha, e o teste
 * acusava o service de não ter gravado. Falso vermelho é barato quando se investiga; é caro quando
 * se acredita.
 *
 * ─ E O `conhecido` RESOLVE O SEGUNDO CASO, que é o inverso e é PIOR ────────────────────────────
 * A contagem por lado filtra por `and(eq(vagaId, ...), inArray(situacao, ...), ne(id, ...))`, e o
 * PRIMEIRO parâmetro ali é o id da VAGA, não o da candidatura. Pegar o primeiro devolveria um id
 * que não é de linha nenhuma, em silêncio. Com o `conhecido`, o fake escolhe o parâmetro que de
 * fato nomeia uma candidatura, e a exclusão da própria linha na contagem passa a acontecer como
 * acontece em produção.
 */
export function idDoFiltro(
  filtro: unknown,
  conhecido?: (valor: string) => boolean,
): string | null {
  const valores = parametrosDoFiltro(filtro);
  if (valores.length === 0) return null;
  if (conhecido) {
    const daLinha = valores.find(conhecido);
    if (daLinha) return daLinha;
  }
  return valores[0] ?? null;
}

/** As situações que TOMAM posição, para a contagem por lado do caminho travado. */
const CONSOMEM = new Set(["APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO"]);

export interface CenarioFingido {
  candidaturas: LinhaFingida[];
  /** O status da vaga. `ABERTA` (recebe candidato) é o padrão de quase todo caso. */
  vagaStatus?: string;
  posicoesOficiais?: number | null;
  posicoesBanco?: number | null;
  /** A escrita não alcança a linha (corrida entre a leitura e o `update`). */
  naoAlcanca?: boolean;
}

export function bancoFingido(cenario: CenarioFingido) {
  const linhas = cenario.candidaturas.map((l) => ({ ...l }));
  const vaga = {
    id: "vaga-1",
    status: cenario.vagaStatus ?? "ABERTA",
    posicoesOficiais: cenario.posicoesOficiais ?? 10,
    posicoesBanco: cenario.posicoesBanco ?? 10,
  };

  const updates: EscritaFingida[] = [];
  const inserts: EscritaFingida[] = [];

  const acharLinha = (id: string | null) => linhas.find((l) => l.id === id) ?? null;
  /** O filtro nomeia uma candidatura DESTE cenário? É o que separa o id da vaga do id da linha. */
  const ehIdDeLinha = (valor: string) => linhas.some((l) => l.id === valor);
  const idDaCandidatura = (filtro: unknown) => idDoFiltro(filtro, ehIdDeLinha);

  const select = vi.fn((projecao?: Record<string, unknown>) => {
    let tabela: unknown = null;
    let idFiltrado: string | null = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.where = (filtro: unknown) => {
      idFiltrado = idDaCandidatura(filtro);
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    /** A leitura da vaga com `FOR UPDATE` (passo 2 da trava 4). */
    b.for = () => Promise.resolve([vaga]);
    /** A contagem por lado, que EXCLUI a própria candidatura (o service passa um `ne`). */
    b.groupBy = () => {
      const porLado = new Map<string | null, number>();
      for (const l of linhas) {
        if (!CONSOMEM.has(l.situacao)) continue;
        if (idFiltrado && l.id === idFiltrado) continue;
        porLado.set(l.posicaoLado, (porLado.get(l.posicaoLado) ?? 0) + 1);
      }
      return Promise.resolve(
        [...porLado].map(([lado, quantas]) => ({ lado, quantas })),
      );
    };
    /** A leitura da ficha, no fim de cada ação. */
    b.orderBy = () => {
      const c = acharLinha(idFiltrado) ?? linhas[0];
      return Promise.resolve([
        { c, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "Vaga", autor: "Consultor" },
      ]);
    };
    /** A consulta das candidaturas ANTERIORES (alocação) termina no `where`. */
    b.then = (r: (v: unknown) => unknown) => {
      void projecao;
      return Promise.resolve(tabela === asCandidaturas ? [] : []).then(r);
    };
    return b;
  });

  /**
   * O `where` É AWAITABLE **E** TEM `.returning()`, e os dois são necessários: a saída
   * (`gravarSaidaDaCandidatura`) espera o `where` direto, e a reversão do envio encadeia
   * `.returning()` para saber se alcançou linha. Um dublê que só fizesse um dos dois
   * silenciosamente NÃO EXECUTARIA o caminho do outro, e o teste afirmaria o fake.
   *
   * `naoAlcanca` MODELA A CORRIDA: a escrita não encontra a linha no estado lido (alguém mexeu
   * entre a leitura e a escrita), que é o caso que a cláusula de situação no `where` existe para
   * pegar.
   */
  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: (filtro: unknown) => {
        const id = idDaCandidatura(filtro);
        updates.push({ tabela, id, valores });
        const alvo = tabela === asCandidaturas ? acharLinha(id) : null;
        if (alvo) Object.assign(alvo, valores);
        const alcancadas = cenario.naoAlcanca === true ? [] : [{ id: id ?? "cand-1" }];
        return {
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
          returning: async () => alcancadas,
        };
      },
    }),
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      inserts.push({
        tabela,
        id: (valores.candidaturaId as string | undefined) ?? null,
        valores,
      });
      return {
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        returning: async () => [{ id: "cand-novo", etapa: "CAPTACAO" }],
      };
    },
  }));

  const query = {
    asCandidaturas: {
      findFirst: async (args?: { where?: unknown }) => {
        const alvo = acharLinha(idDaCandidatura(args?.where));
        return alvo ? { ...alvo } : undefined;
      },
    },
    asCandidatos: { findFirst: async () => ({ id: "pessoa-1", nome: "Fulano" }) },
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
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
    ),
    linhas,
    updates,
    inserts,
    /** As situações gravadas, por candidatura, depois de tudo. */
    situacaoDe: (id: string) => acharLinha(id)?.situacao ?? null,
    /** O que foi gravado na CANDIDATURA de um id. */
    updateDa: (id: string) =>
      updates.find((u) => u.tabela === asCandidaturas && u.id === id)?.valores ?? null,
    /** O evento de histórico de um id. */
    eventoDe: (id: string) =>
      inserts.find((i) => i.tabela === asCandidaturaEtapas && i.id === id)?.valores ?? null,
    vagasTabela,
  };
}

/** O usuário da sessão, no formato que o service passa a receber (padrão `vagas.service.fechar`). */
export function usuarioFingido(papel: "COMUM" | "MASTER" | "SUPER_ADMIN", id = "user-1") {
  return { id, email: `${id}@soulan.com.br`, papel, senhaTemporaria: false };
}
