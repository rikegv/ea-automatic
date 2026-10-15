import { afterEach, describe, expect, it, vi } from "vitest";
import { admissoes } from "../db/schema";
import { ReconciliacaoAuditoriaScheduler } from "./reconciliacao-auditoria.scheduler";
import { ATOR_SISTEMA_POS_VEREDITO } from "./auditoria.service";

/**
 * Cobertura do miolo `reconciliar` e do kill-switch do `ReconciliacaoAuditoriaScheduler`.
 *
 * A fake do drizzle só precisa responder a UMA consulta (`candidatos`): `select(...).from(admissoes)
 * .where(...)` devolve o alvo. O scheduler NÃO escreve nada por si (é a prova de que delega ao
 * `aplicarPosVeredito` idempotente): a fake não tem `insert` nem `update`, e ainda assim passa.
 */
function makeDb(alvo: Array<{ id: string; codCliente: string | null; cargoId: string | null }>) {
  const db = {
    select: vi.fn(() => ({
      from: (tabela: unknown) => ({ where: async () => (tabela === admissoes ? alvo : []) }),
    })),
  };
  return { db };
}

function makeCompletude(porId: Record<string, boolean>) {
  return {
    progresso: vi.fn(async (id: string) => ({ completa: porId[id] ?? false })),
  };
}

afterEach(() => {
  delete process.env.AUDITORIA_RECONCILIACAO;
  vi.restoreAllMocks();
});

describe("ReconciliacaoAuditoriaScheduler.reconciliar", () => {
  it("alvo vazio: devolve zeros e não chama o pós-veredito", async () => {
    const { db } = makeDb([]);
    const completude = makeCompletude({});
    const auditoria = { aplicarPosVeredito: vi.fn(async () => ({})) };
    const svc = new ReconciliacaoAuditoriaScheduler(db as never, auditoria as never, completude as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ varridos: 0, avancados: 0, pulos: 0, falhas: 0 });
    expect(auditoria.aplicarPosVeredito).not.toHaveBeenCalled();
  });

  it("duas candidatas com régua COMPLETA: avança as duas com o ator SISTEMA de id NULO", async () => {
    const { db } = makeDb([
      { id: "a1", codCliente: "500", cargoId: "c1" },
      { id: "a2", codCliente: "501", cargoId: "c2" },
    ]);
    const completude = makeCompletude({ a1: true, a2: true });
    const auditoria = { aplicarPosVeredito: vi.fn(async () => ({})) };
    const svc = new ReconciliacaoAuditoriaScheduler(db as never, auditoria as never, completude as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ varridos: 2, avancados: 2, pulos: 0, falhas: 0 });
    expect(auditoria.aplicarPosVeredito).toHaveBeenCalledTimes(2);
    expect(auditoria.aplicarPosVeredito).toHaveBeenCalledWith("a1", ATOR_SISTEMA_POS_VEREDITO);
    expect(auditoria.aplicarPosVeredito).toHaveBeenCalledWith("a2", ATOR_SISTEMA_POS_VEREDITO);
    expect(ATOR_SISTEMA_POS_VEREDITO.id).toBeNull();
  });

  it("régua INCOMPLETA: NÃO avança (vira pulo), não chama o pós-veredito naquela", async () => {
    const { db } = makeDb([
      { id: "a1", codCliente: "500", cargoId: "c1" }, // completa
      { id: "a2", codCliente: "501", cargoId: "c2" }, // incompleta
    ]);
    const completude = makeCompletude({ a1: true, a2: false });
    const auditoria = { aplicarPosVeredito: vi.fn(async () => ({})) };
    const svc = new ReconciliacaoAuditoriaScheduler(db as never, auditoria as never, completude as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ varridos: 2, avancados: 1, pulos: 1, falhas: 0 });
    expect(auditoria.aplicarPosVeredito).toHaveBeenCalledTimes(1);
    expect(auditoria.aplicarPosVeredito).toHaveBeenCalledWith("a1", ATOR_SISTEMA_POS_VEREDITO);
  });

  it("candidata sem cliente/cargo é filtrada fora do alvo (nem varrida)", async () => {
    const { db } = makeDb([
      { id: "a1", codCliente: "500", cargoId: "c1" },
      { id: "a2", codCliente: null, cargoId: "c2" }, // pré-admissão: fora
    ]);
    const completude = makeCompletude({ a1: true });
    const auditoria = { aplicarPosVeredito: vi.fn(async () => ({})) };
    const svc = new ReconciliacaoAuditoriaScheduler(db as never, auditoria as never, completude as never);

    const r = await svc.reconciliar();

    expect(r.varridos).toBe(1);
    expect(r.avancados).toBe(1);
    expect(auditoria.aplicarPosVeredito).toHaveBeenCalledTimes(1);
  });

  it("idempotência delegada: o pós-veredito lançar vira FALHA e não derruba a passada", async () => {
    const { db } = makeDb([
      { id: "a1", codCliente: "500", cargoId: "c1" },
      { id: "a2", codCliente: "501", cargoId: "c2" },
    ]);
    const completude = makeCompletude({ a1: true, a2: true });
    const auditoria = {
      aplicarPosVeredito: vi
        .fn()
        .mockRejectedValueOnce(new Error("falha transitoria"))
        .mockResolvedValueOnce({}),
    };
    const svc = new ReconciliacaoAuditoriaScheduler(db as never, auditoria as never, completude as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ varridos: 2, avancados: 1, pulos: 0, falhas: 1 });
  });
});

describe("ReconciliacaoAuditoriaScheduler kill-switch", () => {
  it("AUDITORIA_RECONCILIACAO=off: INERTE, não agenda timer nenhum", () => {
    process.env.AUDITORIA_RECONCILIACAO = "off";
    const setT = vi.spyOn(global, "setTimeout");
    const setI = vi.spyOn(global, "setInterval");
    const svc = new ReconciliacaoAuditoriaScheduler(
      makeDb([]).db as never,
      {} as never,
      {} as never,
    );

    svc.onModuleInit();

    expect(setT).not.toHaveBeenCalled();
    expect(setI).not.toHaveBeenCalled();
    svc.onModuleDestroy();
  });

  it("sem a env: agenda a primeira passada atrasada e o intervalo", () => {
    delete process.env.AUDITORIA_RECONCILIACAO;
    const setT = vi.spyOn(global, "setTimeout");
    const setI = vi.spyOn(global, "setInterval");
    const svc = new ReconciliacaoAuditoriaScheduler(
      makeDb([]).db as never,
      {} as never,
      {} as never,
    );

    svc.onModuleInit();

    expect(setT).toHaveBeenCalledTimes(1);
    expect(setI).toHaveBeenCalledTimes(1);
    svc.onModuleDestroy();
  });
});
