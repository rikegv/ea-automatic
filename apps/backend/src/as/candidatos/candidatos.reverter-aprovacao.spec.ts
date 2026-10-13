import "reflect-metadata";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { CANDIDATURA_SITUACOES, candidaturaViva, consomePosicao } from "@ea/shared-types";
import {
  SITUACAO_APOS_REVERTER_APROVACAO,
  SITUACAO_QUE_A_REVERSAO_DE_APROVACAO_DESFAZ,
  podeReverterAprovacao,
} from "../../domain/candidatura";
import { CandidatosService } from "./candidatos.service";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ VOLTAR O STATUS DE QUEM FOI APROVADO, SEM REPROVAR ANTES (ITEM 5 do diretor) ─────────────────
 *
 * O QUE O DIRETOR PEDIU: voltar um APROVADO direto (sem reprovar), escolhendo PARA QUAL ETAPA a
 * pessoa vai, qualquer consultor, com a trilha registrando quem fez e o de/para.
 *
 * ┌─ O QUE ESTE ARQUIVO PROTEGE ────────────────────────────────────────────────────────────────┐
 * │ 1. SÓ REVERTE QUEM ESTÁ APROVADO, e a lista das recusadas é DERIVADA do vocabulário.          │
 * │ 2. A SITUAÇÃO VOLTA A `ATIVO` e a ETAPA é a ESCOLHIDA (não a atual, não a anterior fixa).      │
 * │ 3. A POSIÇÃO FICA LIVRE: destino `ATIVO` não consome posição, e a marca de posição é limpa.    │
 * │ 4. A CORRIDA NÃO FURA: a situação entra no `where`, então uma mudança concorrente recusa.      │
 * │ 5. NÃO VAI PELO CAMINHO TRAVADO: a reversão só subtrai ocupação (nenhum `for("update")`).      │
 * │ 6. O RASTRO EXISTE: etapaDe (a atual), etapaPara (a escolhida), situação `ATIVO` e quem fez.   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const AGORA = new Date("2026-10-13T12:00:00.000Z");
const PORID = "consultor-1";
const DESTINO = "TRIAGEM"; // etapa ativa no catálogo fingido

const AS_OUTRAS = CANDIDATURA_SITUACOES.filter(
  (s) => s !== SITUACAO_QUE_A_REVERSAO_DE_APROVACAO_DESFAZ,
);

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function candidatura(over: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "APROVACAO",
    situacao: SITUACAO_QUE_A_REVERSAO_DE_APROVACAO_DESFAZ,
    motivoDescarte: null,
    posicaoLado: "OFICIAL",
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    alocadoPorId: null,
    ...over,
  };
}

/** Renderiza o `where` de verdade e confere se a situação exigida ainda bate com a linha atual. */
function condicaoAindaCasa(cond: unknown, linha: Record<string, unknown>): boolean {
  const { params } = new PgDialect().sqlToQuery(cond as never);
  const situacoesExigidas = params.filter(
    (p): p is string =>
      typeof p === "string" && (CANDIDATURA_SITUACOES as readonly string[]).includes(p),
  );
  return situacoesExigidas.every((s) => s === linha.situacao);
}

function makeDb(
  cenario: {
    candidatura?: Record<string, unknown>;
    vaga?: Record<string, unknown>;
    entreALeituraEAEscrita?: (linha: Record<string, unknown>) => void;
  } = {},
) {
  const c: Record<string, unknown> = { ...candidatura(), ...(cenario.candidatura ?? {}) };
  const vaga = { id: "vaga-1", status: "ABERTA", posicoesOficiais: 5, posicoesBanco: 0, ...(cenario.vaga ?? {}) };

  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const ordem: string[] = [];

  const select = vi.fn(() => {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.where = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.orderBy = () =>
      Promise.resolve([
        { c, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "Vaga", autor: "Consultor" },
      ]);
    b.for = (modo: string) => {
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vaga]);
    };
    b.groupBy = () => Promise.resolve([]);
    b.then = (r: (v: unknown) => unknown) =>
      Promise.resolve([{ candCpf: "52998224725", candNome: "Fulano" }]).then(r);
    return b;
  });

  let corridaJaAconteceu = false;
  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });
      if (tabela === asCandidaturas && !corridaJaAconteceu) {
        corridaJaAconteceu = true;
        cenario.entreALeituraEAEscrita?.(c);
      }
      return {
        where: (cond: unknown) => {
          const casa = tabela !== asCandidaturas || condicaoAindaCasa(cond, c);
          if (casa && tabela === asCandidaturas) Object.assign(c, valores);
          const afetadas = casa ? [{ id: c.id }] : [];
          return {
            then: (r: (v: unknown) => unknown) => Promise.resolve(afetadas).then(r),
            returning: async () => afetadas,
          };
        },
      };
    },
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      inserts.push({ tabela, valores });
      return {
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        returning: async () => [{ id: "cand-1", etapa: c.etapa }],
      };
    },
  }));

  const tx = {
    select,
    update,
    insert,
    query: { asCandidaturas: { findFirst: async () => ({ ...c }) } },
  };

  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      asCandidaturas: { findFirst: async () => ({ ...c }) },
      asCandidatos: { findFirst: async () => ({ id: "pessoa-1", nome: "Fulano" }) },
      vagas: { findFirst: async () => vaga },
    },
  };

  return {
    service: new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    ),
    linha: c,
    updates,
    inserts,
    ordem,
  };
}

const daCandidatura = (updates: Escrita[]) =>
  updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
const doHistorico = (inserts: Escrita[]) =>
  inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? {};
const erroDe = (p: Promise<unknown>) =>
  p.then(() => null).catch((e: unknown) => e as Error);

// ── A RÉGUA, ANTES DO CAMINHO ────────────────────────────────────────────────

describe("a régua da reversão de aprovação, afirmada contra o vocabulário", () => {
  it("desfaz o APROVADO, e é dele que a reversão parte", () => {
    expect(SITUACAO_QUE_A_REVERSAO_DE_APROVACAO_DESFAZ).toBe("APROVADO");
  });

  it("o destino é `ATIVO`, que NÃO consome posição: por isso a posição fica livre sem escrita a mais", () => {
    expect(consomePosicao(SITUACAO_APOS_REVERTER_APROVACAO)).toBe(false);
  });

  it("o destino é VIVO, senão a reversão entregaria a pessoa ao expurgo da retenção", () => {
    expect(candidaturaViva(SITUACAO_APOS_REVERTER_APROVACAO)).toBe(true);
  });

  it("só o APROVADO é reversível por aqui, e a régua recusa TODAS as outras situações", () => {
    expect(podeReverterAprovacao(SITUACAO_QUE_A_REVERSAO_DE_APROVACAO_DESFAZ)).toBe(true);
    for (const s of AS_OUTRAS) expect(podeReverterAprovacao(s)).toBe(false);
  });
});

// ── O CAMINHO FELIZ ──────────────────────────────────────────────────────────

describe("reverter a aprovação volta a pessoa para a seleção na etapa escolhida", () => {
  it("grava situação ATIVO, a etapa ESCOLHIDA, e limpa a marca de posição e o motivo", async () => {
    const { service, updates } = makeDb();
    await service.reverterAprovacao("cand-1", { etapa: DESTINO }, PORID);

    const set = daCandidatura(updates);
    expect(set.situacao).toBe("ATIVO");
    expect(set.etapa).toBe(DESTINO);
    expect(set.posicaoLado).toBeNull();
    expect(set.motivoDescarte).toBeNull();
  });

  it("registra na trilha o de/para da etapa, a situação ATIVO e QUEM fez", async () => {
    const { service, inserts } = makeDb();
    await service.reverterAprovacao("cand-1", { etapa: DESTINO }, PORID);

    const ev = doHistorico(inserts);
    expect(ev.etapaDe).toBe("APROVACAO"); // a etapa em que a pessoa estava aprovada
    expect(ev.etapaPara).toBe(DESTINO); // a etapa escolhida
    expect(ev.situacao).toBe("ATIVO");
    expect(ev.porId).toBe(PORID);
  });

  it("deixa escolher QUALQUER etapa ativa, inclusive a etapa atual (o que muda é a situação)", async () => {
    const { service, updates } = makeDb();
    await service.reverterAprovacao("cand-1", { etapa: "APROVACAO" }, PORID);
    const set = daCandidatura(updates);
    expect(set.situacao).toBe("ATIVO");
    expect(set.etapa).toBe("APROVACAO");
  });

  it("NÃO vai pelo caminho travado: nenhum `for(update)` na linha da vaga (só subtrai ocupação)", async () => {
    const { service, ordem } = makeDb();
    await service.reverterAprovacao("cand-1", { etapa: DESTINO }, PORID);
    expect(ordem.filter((o) => o.startsWith("trava"))).toHaveLength(0);
  });
});

// ── AS RECUSAS ───────────────────────────────────────────────────────────────

describe("a reversão recusa o que não é uma aprovação viva", () => {
  it("recusa quem NÃO está aprovado, sem gravar nada", async () => {
    const { service, updates, inserts } = makeDb({ candidatura: { situacao: "ATIVO" } });
    const err = await erroDe(service.reverterAprovacao("cand-1", { etapa: DESTINO }, PORID));
    expect(err).toBeInstanceOf(ConflictException);
    expect(updates.find((u) => u.tabela === asCandidaturas)).toBeUndefined();
    expect(inserts).toHaveLength(0);
  });

  it("recusa a etapa de destino inexistente (exigirEtapaAtiva), sem gravar nada", async () => {
    const { service, updates } = makeDb();
    const err = await erroDe(service.reverterAprovacao("cand-1", { etapa: "NAO_EXISTE" }, PORID));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(updates.find((u) => u.tabela === asCandidaturas)).toBeUndefined();
  });

  it("recusa quando a vaga não está em processo (encerrada), sem gravar nada", async () => {
    const { service, updates } = makeDb({ vaga: { status: "CANCELADA" } });
    const err = await erroDe(service.reverterAprovacao("cand-1", { etapa: DESTINO }, PORID));
    expect(err).toBeInstanceOf(ConflictException);
    expect(updates.find((u) => u.tabela === asCandidaturas)).toBeUndefined();
  });

  it("a CORRIDA é fechada pelo `where`: mudou a situação entre ler e gravar, recusa e não grava evento", async () => {
    const { service, inserts } = makeDb({
      // Entre a leitura que decidiu e a escrita: alguém finalizou a posição (APROVADO -> ALOCADO).
      entreALeituraEAEscrita: (linha) => {
        linha.situacao = "ALOCADO";
      },
    });
    const err = await erroDe(service.reverterAprovacao("cand-1", { etapa: DESTINO }, PORID));
    expect(err).toBeInstanceOf(ConflictException);
    // O `throw` dentro da transação impede o evento órfão.
    expect(inserts.find((i) => i.tabela === asCandidaturaEtapas)).toBeUndefined();
  });
});
