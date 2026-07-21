import { describe, expect, it, vi } from "vitest";
import { CODIGOS_REGUA_PADRAO } from "@ea/shared-types";
import { ReguaService } from "./regua.service";

/**
 * Documentos padrão da régua: a FONTE ÚNICA e a semântica da aplicação em massa (só adiciona onde não
 * há nada, nunca sobrescreve, nunca apaga).
 */

type Row = Record<string, unknown>;

/** Fake do Drizzle cobrindo só o que `aplicarPadraoNosPendentes` toca. */
function montar(tipos: Row[]) {
  let inseridas: Row[] = [];
  let usouOnConflictDoNothing = false;
  const deletes: unknown[] = [];

  const db = {
    select: vi.fn(() => ({ from: () => ({ where: async () => tipos }) })),
    insert: vi.fn(() => ({
      values: (rows: Row[]) => {
        inseridas = rows;
        return {
          onConflictDoNothing: () => {
            usouOnConflictDoNothing = true;
            return { returning: async () => rows.map(() => ({ codCliente: "x" })) };
          },
        };
      },
    })),
    // Se algum dia alguém plugar um delete aqui, o teste denuncia.
    delete: vi.fn(() => {
      deletes.push(true);
      return { where: async () => undefined };
    }),
  };

  return {
    service: new ReguaService(db as never),
    getInseridas: () => inseridas,
    usouOnConflictDoNothing: () => usouOnConflictDoNothing,
    deletes,
    db,
  };
}

const TIPOS_PADRAO = CODIGOS_REGUA_PADRAO.map((codigo, i) => ({ id: `td-${i}`, codigo }));

describe("Documentos padrão da régua (fonte única)", () => {
  it("tem os 7 códigos definidos pelo diretor", () => {
    expect([...CODIGOS_REGUA_PADRAO].sort()).toEqual(
      [
        "COMPROVANTE_ESCOLARIDADE",
        "COMPROVANTE_RESIDENCIA",
        "CPF",
        "CTPS",
        "DADOS_BANCARIOS",
        "RESERVISTA",
        "RG",
      ].sort(),
    );
  });

  it("NÃO inclui o ASO (quem controla o exame é a frente EXAME, §A.16)", () => {
    expect(CODIGOS_REGUA_PADRAO).not.toContain("ASO");
  });
});

describe("ReguaService.aplicarPadraoNosPendentes", () => {
  it("insere os 7 documentos como OBRIGATORIO em cada par pendente", async () => {
    const ctx = montar(TIPOS_PADRAO);
    vi.spyOn(ctx.service, "paresPendentesPadrao").mockResolvedValue([
      { codCliente: "100", cliente: "ACME", cargoId: "cg-1", cargo: "Auxiliar", admissoes: 1 },
      { codCliente: "200", cliente: "BETA", cargoId: "cg-2", cargo: "Analista", admissoes: 2 },
    ]);

    const r = await ctx.service.aplicarPadraoNosPendentes();

    expect(r.paresAplicados).toHaveLength(2);
    expect(r.documentosPorPar).toBe(7);
    expect(ctx.getInseridas()).toHaveLength(14); // 2 pares × 7 documentos
    expect(ctx.getInseridas().every((v) => v.exigencia === "OBRIGATORIO")).toBe(true);
  });

  it("só ADICIONA: usa onConflictDoNothing e nunca apaga régua existente", async () => {
    const ctx = montar(TIPOS_PADRAO);
    vi.spyOn(ctx.service, "paresPendentesPadrao").mockResolvedValue([
      { codCliente: "100", cliente: "ACME", cargoId: "cg-1", cargo: "Auxiliar", admissoes: 1 },
    ]);

    await ctx.service.aplicarPadraoNosPendentes();

    expect(ctx.usouOnConflictDoNothing()).toBe(true);
    expect(ctx.deletes).toHaveLength(0);
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });

  it("sem pares pendentes, não insere nada", async () => {
    const ctx = montar(TIPOS_PADRAO);
    vi.spyOn(ctx.service, "paresPendentesPadrao").mockResolvedValue([]);

    const r = await ctx.service.aplicarPadraoNosPendentes();

    expect(r.linhasInseridas).toBe(0);
    expect(r.paresAplicados).toHaveLength(0);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
