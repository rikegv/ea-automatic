import { describe, expect, it, vi } from "vitest";
import { KitRegrasService } from "./kit-regras.service";

/**
 * Documentos de um KIT, campo `padrao` (OST do Gerador de Kit).
 *
 * `padrao` separa o documento de INSTRUÇÃO GERAL (o mesmo manual para todos, sem nome de
 * funcionário na página) do INDIVIDUAL (documento da pessoa). O que estes testes travam é que a
 * regra é CADASTRO, no mesmo espírito do `exigeValor` de benefícios:
 *  - nasce `false` por omissão, então nenhum documento já existente muda de comportamento;
 *  - é gravado na criação quando vem `true`;
 *  - é editável na atualização, e omiti-lo NÃO mexe no valor guardado (o toggle da tela manda só o
 *    campo que mudou).
 *
 * A marcação nunca é deduzida do texto do título: adivinhar pelo nome é exatamente o vício que
 * esta OST elimina.
 */

interface Estado {
  maxOrdem: number;
  titulosExistentes: { id: string }[];
  ultimoInsert?: Record<string, unknown>;
  ultimoSet?: Record<string, unknown>;
}

const DOC_ATUAL = {
  id: "doc-1",
  kitTipoId: "kit-1",
  titulo: "MANUAL DE PROCEDIMENTOS",
  ordem: 9,
  ativo: true,
  padrao: false,
};

function makeDb() {
  const estado: Estado = { maxOrdem: 8, titulosExistentes: [] };
  // `where()` serve os dois usos do service: o `limit(1)` da checagem de título livre e o await
  // direto do `max(ordem)` (o builder do Drizzle é thenable).
  const where = () => ({
    limit: () => Promise.resolve(estado.titulosExistentes),
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve([{ max: estado.maxOrdem }]).then(ok, err),
  });
  const db = {
    select: () => ({ from: () => ({ where }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        estado.ultimoInsert = v;
        return { returning: () => Promise.resolve([{ id: "novo", ...v }]) };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        estado.ultimoSet = v;
        return {
          where: () => ({ returning: () => Promise.resolve([{ ...DOC_ATUAL, ...v }]) }),
        };
      },
    }),
    query: {
      kitTipo: { findFirst: vi.fn().mockResolvedValue({ id: "kit-1", nome: "KIT TEMPORÁRIO" }) },
      kitRegraDocumento: { findFirst: vi.fn().mockResolvedValue(DOC_ATUAL) },
    },
  };
  return { db, estado };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = (db: unknown) => new KitRegrasService(db as any);

describe("KitRegrasService, campo padrao", () => {
  it("nasce INDIVIDUAL (padrao=false) quando a criação não fala nada", async () => {
    const { db, estado } = makeDb();
    await svc(db).criar({ kitTipoId: "kit-1", titulo: "REGISTRO DE EMPREGADO" });
    expect(estado.ultimoInsert?.padrao).toBe(false);
  });

  it("grava padrao=true na criação quando pedido", async () => {
    const { db, estado } = makeDb();
    await svc(db).criar({ kitTipoId: "kit-1", titulo: "MANUAL", padrao: true });
    expect(estado.ultimoInsert?.padrao).toBe(true);
  });

  it("marca um documento existente como PADRÃO", async () => {
    const { db, estado } = makeDb();
    const row = await svc(db).atualizar("doc-1", { padrao: true });
    expect(estado.ultimoSet?.padrao).toBe(true);
    expect(row.padrao).toBe(true);
  });

  it("desmarca, voltando o documento a INDIVIDUAL", async () => {
    const { db, estado } = makeDb();
    await svc(db).atualizar("doc-1", { padrao: false });
    expect(estado.ultimoSet?.padrao).toBe(false);
  });

  it("não toca em padrao quando a atualização é de outro campo", async () => {
    const { db, estado } = makeDb();
    await svc(db).atualizar("doc-1", { ativo: false });
    expect(estado.ultimoSet).not.toHaveProperty("padrao");
    expect(estado.ultimoSet?.ativo).toBe(false);
  });
});
