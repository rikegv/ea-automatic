import { describe, expect, it, vi } from "vitest";
import { admissoes, tiposDocumento } from "../db/schema";
import { ReconciliacaoReguaScheduler } from "./reconciliacao-regua.scheduler";

/**
 * Fake do drizzle para o miolo `reconciliar`. Distingue as consultas pela TABELA do `.from()`:
 * `admissoes` -> alvo (vivas sem régua); `tiposDocumento` -> tipos da régua padrão. O `insert`
 * devolve o que seria inserido (uma linha por valor) para checar a contagem.
 */
function makeDb(cen: {
  alvo: { id: string; codCliente: string | null; cargoId: string | null }[];
  tipos: { id: string }[];
}) {
  const inserts: unknown[][] = [];
  const db = {
    select: vi.fn(() => ({
      from: (tabela: unknown) => ({
        where: async () => {
          if (tabela === admissoes) return cen.alvo;
          if (tabela === tiposDocumento) return cen.tipos;
          return [];
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: (vals: unknown[]) => {
        inserts.push(vals);
        return {
          onConflictDoNothing: () => ({
            // Simula "só adiciona onde não há nada": devolve uma linha por valor pedido.
            returning: async () => vals.map(() => ({ codCliente: "x" })),
          }),
        };
      },
    })),
  };
  return { db, inserts };
}

describe("ReconciliacaoReguaScheduler.reconciliar", () => {
  it("alvo vazio: não insere régua nem materializa, devolve zeros", async () => {
    const { db, inserts } = makeDb({ alvo: [], tipos: [{ id: "t1" }] });
    const completude = { sincronizarDocumentosDaRegua: vi.fn(async () => {}) };
    const svc = new ReconciliacaoReguaScheduler(db as never, completude as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ pares: 0, linhasRegua: 0, admissoesMaterializadas: 0 });
    expect(inserts).toHaveLength(0);
    expect(completude.sincronizarDocumentosDaRegua).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("duas admissões no MESMO par: 1 par, 7 linhas padrão, materializa as 2", async () => {
    const tipos = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `t${n}` })); // os 7 CODIGOS_REGUA_PADRAO
    const { db, inserts } = makeDb({
      alvo: [
        { id: "a1", codCliente: "500", cargoId: "cargo-1" },
        { id: "a2", codCliente: "500", cargoId: "cargo-1" },
      ],
      tipos,
    });
    const completude = { sincronizarDocumentosDaRegua: vi.fn(async () => {}) };
    const svc = new ReconciliacaoReguaScheduler(db as never, completude as never);

    const r = await svc.reconciliar();

    expect(r.pares).toBe(1); // dedup por (cliente,cargo)
    expect(r.linhasRegua).toBe(7); // 1 par x 7 documentos padrão
    expect(r.admissoesMaterializadas).toBe(2); // uma materialização por admissão viva
    // Uma única chamada de insert com 7 valores (1 par x 7 tipos).
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toHaveLength(7);
    // Materializa pelo método autoritativo, por id de admissão.
    expect(completude.sincronizarDocumentosDaRegua).toHaveBeenCalledTimes(2);
    expect(completude.sincronizarDocumentosDaRegua).toHaveBeenCalledWith("a1");
    expect(completude.sincronizarDocumentosDaRegua).toHaveBeenCalledWith("a2");
  });

  it("dois pares distintos: 2 pares, 14 linhas, materializa os 2", async () => {
    const tipos = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `t${n}` }));
    const { db, inserts } = makeDb({
      alvo: [
        { id: "a1", codCliente: "500", cargoId: "cargo-1" },
        { id: "a2", codCliente: "501", cargoId: "cargo-1" },
      ],
      tipos,
    });
    const completude = { sincronizarDocumentosDaRegua: vi.fn(async () => {}) };
    const svc = new ReconciliacaoReguaScheduler(db as never, completude as never);

    const r = await svc.reconciliar();

    expect(r.pares).toBe(2);
    expect(r.linhasRegua).toBe(14); // 2 pares x 7
    expect(r.admissoesMaterializadas).toBe(2);
    expect(inserts[0]).toHaveLength(14);
  });
});
