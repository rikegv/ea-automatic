import { describe, expect, it, vi } from "vitest";
import { admissoes } from "../db/schema";
import type { GiEnvioResultado } from "./enviar-para-gi.service";
import { ReconciliacaoGiScheduler } from "./reconciliacao-gi.scheduler";

/**
 * Fake do drizzle para o miolo `reconciliar`: a única consulta é `select().from(admissoes).where()`,
 * que devolve os candidatos (MANUAL + vivos + auditoria OK + nunca enviados). O serviço de envio é um
 * dublê cujo `enviar` devolve o desfecho roteirizado por admissão.
 */
function makeDb(candidatos: { id: string; farolGlobal: string | null; pausadaEm: Date | null }[]) {
  return {
    select: vi.fn(() => ({
      from: (tabela: unknown) => ({
        where: async () => (tabela === admissoes ? candidatos : []),
      }),
    })),
  };
}

const ENVIADO: GiEnvioResultado = { enviado: true, motivo: "GI_ENVIADO" };
const RECUSA: GiEnvioResultado = { enviado: false, motivo: "GI_SALARIO_SEM_UNIDADE" };
const JA: GiEnvioResultado = { enviado: false, motivo: "GI_JA_ENVIADO" };
const FALHA: GiEnvioResultado = { enviado: false, motivo: "GI_FALHA_ENVIO" };

describe("ReconciliacaoGiScheduler.reconciliar", () => {
  it("alvo vazio: nao chama enviar, devolve zeros", async () => {
    const db = makeDb([]);
    const enviarParaGi = { enviar: vi.fn() };
    const svc = new ReconciliacaoGiScheduler(db as never, enviarParaGi as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ candidatos: 0, enviados: 0, recusados: 0, falhas: 0 });
    expect(enviarParaGi.enviar).not.toHaveBeenCalled();
  });

  it("reenvia cada candidato pela cadeia unica do enviar() e conta os desfechos", async () => {
    const db = makeDb([
      { id: "a1", farolGlobal: "EM_ADMISSAO", pausadaEm: null },
      { id: "a2", farolGlobal: "BANCO_AGUARDAR", pausadaEm: null },
      { id: "a3", farolGlobal: "EM_ADMISSAO", pausadaEm: null },
      { id: "a4", farolGlobal: "EM_ADMISSAO", pausadaEm: null },
    ]);
    // a1 envia, a2 recusa por guarda (salario sem unidade), a3 falha de rede, a4 ja enviado (idempotente).
    const enviar = vi
      .fn(async (): Promise<GiEnvioResultado> => ENVIADO)
      .mockResolvedValueOnce(ENVIADO)
      .mockResolvedValueOnce(RECUSA)
      .mockResolvedValueOnce(FALHA)
      .mockResolvedValueOnce(JA);
    const svc = new ReconciliacaoGiScheduler(db as never, { enviar } as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ candidatos: 4, enviados: 1, recusados: 2, falhas: 1 });
    // Uma chamada por candidato, na cadeia unica do automatico, com o contexto da linha e o autor SISTEMA.
    expect(enviar).toHaveBeenCalledTimes(4);
    expect(enviar).toHaveBeenNthCalledWith(1, "a1", {
      farolGlobal: "EM_ADMISSAO",
      pausadaEm: null,
      autorId: ReconciliacaoGiScheduler.AUTOR_SISTEMA,
    });
    expect(enviar).toHaveBeenNthCalledWith(2, "a2", {
      farolGlobal: "BANCO_AGUARDAR",
      pausadaEm: null,
      autorId: ReconciliacaoGiScheduler.AUTOR_SISTEMA,
    });
  });

  it("GI_JA_ENVIADO conta como recusado, nao como enviado (idempotencia: nao duplica)", async () => {
    const db = makeDb([{ id: "a1", farolGlobal: "EM_ADMISSAO", pausadaEm: null }]);
    const enviar = vi.fn(async () => JA);
    const svc = new ReconciliacaoGiScheduler(db as never, { enviar } as never);

    const r = await svc.reconciliar();

    expect(r).toEqual({ candidatos: 1, enviados: 0, recusados: 1, falhas: 0 });
  });
});
