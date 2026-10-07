import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ QA INDEPENDENTE (tester, §A.38): F4, A RECUSA DA LIBERAÇÃO É PERSISTENTE E COM TRILHA ────────
 *
 * Prova a máquina de estados da recusa pela porta de VERDADE (`recusarLiberacao`/`devolverRevisao`),
 * com banco fingido que devolve a linha `SELECT ... FOR UPDATE` e CAPTURA os writes. Verifico:
 *   . recusar SÓ a partir do papel REVISAO (de ABERTA, ou de já recusada, recusa a transição);
 *   . devolver SÓ a partir de recusada;
 *   . o AUTOR gravado é o da SESSÃO (user.id), nunca do corpo (não há corpo);
 *   . a trilha `vaga_recusa_eventos` recebe RECUSOU / DEVOLVEU com o autor.
 *
 * §A.6: autor por id (uuid sintético), zero PII. §A.11: sem travessão.
 */

const dialeto = new PgDialect();
const ID_VAGA = "00000000-0000-4000-8000-00000000000a";
const USER_ID = "00000000-0000-4000-8000-00000000beef";
const user = { id: USER_ID } as never;

type LinhaDaVaga = { status: string; recusada_em: Date | string | null } | null;

/**
 * Serviço com uma transação fingida. O `SELECT ... FOR UPDATE` devolve a linha configurada; todo
 * outro `execute` (update/insert) é capturado com seu SQL compilado e seus parâmetros ligados.
 */
function servicoF4(linha: LinhaDaVaga) {
  const writes: { sql: string; params: readonly unknown[] }[] = [];
  const tx = {
    execute: (q: unknown) => {
      const compilado = dialeto.sqlToQuery(q as never);
      const low = compilado.sql.toLowerCase();
      if (/from vagas where id =/.test(low) && /for update/.test(low)) {
        return Promise.resolve(linha === null ? [] : [linha]);
      }
      writes.push({ sql: low, params: compilado.params });
      return Promise.resolve([]);
    },
  };
  const db = {
    transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const service = new VagasService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
  );
  return { service, writes };
}

describe("QA F4: recusarLiberacao", () => {
  it("de PENDENTE_REVISAO: marca a recusa com o autor da SESSÃO e grava RECUSOU na trilha", async () => {
    const { service, writes } = servicoF4({ status: "PENDENTE_REVISAO", recusada_em: null });

    await service.recusarLiberacao(ID_VAGA, user);

    const update = writes.find((w) => /update\s+vagas/.test(w.sql));
    const evento = writes.find((w) => /insert\s+into\s+vaga_recusa_eventos/.test(w.sql));
    expect(update, "deveria carimbar a marca de recusa").toBeTruthy();
    expect(/recusada_em\s*=\s*now\(\)/.test(update!.sql)).toBe(true);
    expect(/recusada_por_id/.test(update!.sql)).toBe(true);
    // AUTOR DA SESSÃO: o user.id entra como parâmetro ligado, não um valor do corpo.
    expect(update!.params).toContain(USER_ID);

    expect(evento, "deveria gravar a trilha RECUSOU").toBeTruthy();
    expect(/'recusou'/.test(evento!.sql)).toBe(true);
    expect(evento!.params).toContain(ID_VAGA);
    expect(evento!.params).toContain(USER_ID);
  });

  it("de ABERTA (papel que NÃO é REVISAO): recusa a transição e NÃO escreve nada", async () => {
    const { service, writes } = servicoF4({ status: "ABERTA", recusada_em: null });

    await expect(service.recusarLiberacao(ID_VAGA, user)).rejects.toBeInstanceOf(ConflictException);
    expect(writes).toHaveLength(0);
  });

  it("de uma vaga JÁ RECUSADA: recusa a transição (idempotência defensiva) e NÃO reescreve", async () => {
    const { service, writes } = servicoF4({
      status: "PENDENTE_REVISAO",
      recusada_em: "2026-10-05T00:00:00.000Z",
    });

    await expect(service.recusarLiberacao(ID_VAGA, user)).rejects.toBeInstanceOf(ConflictException);
    expect(writes).toHaveLength(0);
  });

  it("vaga inexistente: NotFound e nenhum write", async () => {
    const { service, writes } = servicoF4(null);

    await expect(service.recusarLiberacao(ID_VAGA, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toHaveLength(0);
  });
});

describe("QA F4: devolverRevisao (o inverso, só a partir de recusada)", () => {
  it("de recusada: limpa a marca e grava DEVOLVEU na trilha com o autor da sessão", async () => {
    const { service, writes } = servicoF4({
      status: "PENDENTE_REVISAO",
      recusada_em: "2026-10-05T00:00:00.000Z",
    });

    await service.devolverRevisao(ID_VAGA, user);

    const update = writes.find((w) => /update\s+vagas/.test(w.sql));
    const evento = writes.find((w) => /insert\s+into\s+vaga_recusa_eventos/.test(w.sql));
    expect(update, "deveria limpar a marca").toBeTruthy();
    expect(/recusada_em\s*=\s*null/.test(update!.sql)).toBe(true);
    expect(/recusada_por_id\s*=\s*null/.test(update!.sql)).toBe(true);

    expect(evento, "deveria gravar a trilha DEVOLVEU").toBeTruthy();
    expect(/'devolveu'/.test(evento!.sql)).toBe(true);
    expect(evento!.params).toContain(ID_VAGA);
    expect(evento!.params).toContain(USER_ID);
  });

  it("de uma vaga NÃO recusada: recusa a transição e NÃO escreve nada", async () => {
    const { service, writes } = servicoF4({ status: "PENDENTE_REVISAO", recusada_em: null });

    await expect(service.devolverRevisao(ID_VAGA, user)).rejects.toBeInstanceOf(ConflictException);
    expect(writes).toHaveLength(0);
  });

  it("vaga inexistente: NotFound e nenhum write", async () => {
    const { service, writes } = servicoF4(null);

    await expect(service.devolverRevisao(ID_VAGA, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toHaveLength(0);
  });
});

describe("QA F4: recusar e devolver são inversos exatos (o ciclo completo da marca)", () => {
  it("RECUSOU grava a marca; DEVOLVEU a limpa; a trilha fica com os dois eventos e o mesmo autor", async () => {
    const r = servicoF4({ status: "PENDENTE_REVISAO", recusada_em: null });
    await r.service.recusarLiberacao(ID_VAGA, user);

    const d = servicoF4({ status: "PENDENTE_REVISAO", recusada_em: "2026-10-05T00:00:00.000Z" });
    await d.service.devolverRevisao(ID_VAGA, user);

    const acaoDe = (writes: { sql: string }[]) =>
      writes.find((w) => /insert\s+into\s+vaga_recusa_eventos/.test(w.sql))!.sql;
    expect(/'recusou'/.test(acaoDe(r.writes))).toBe(true);
    expect(/'devolveu'/.test(acaoDe(d.writes))).toBe(true);
  });
});
