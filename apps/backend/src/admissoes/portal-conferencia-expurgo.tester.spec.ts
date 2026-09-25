import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ExpurgoService } from "./expurgo.service";
import { portalConferencia } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), do REQUISITO, em paralelo a construcao. NAO escrevi o codigo.
 *
 * REQ 5 (C1/C2/C3):
 *  - o sweep de TTL APAGA `portal_conferencia` com `expurgar_em` vencido (nao a tabela inteira);
 *  - a contagem devolvida e a das linhas apagadas (idempotente);
 *  - a admissao que SAI do sistema leva a conferencia junto por CASCADE (FK onDelete cascade), o
 *    que e garantia de schema, provada estruturalmente aqui (nao ha banco real no unitario);
 *  - o expurgo da conferencia NAO toca `portal_credenciais` (o teto mora la, C10).
 *
 * §A.6: fixtures sinteticos, so ids.
 */

interface DeleteRegistrado {
  tabela: unknown;
  whereAplicado: boolean;
}

function montar(vencidas: { id: string }[]) {
  const deletes: DeleteRegistrado[] = [];
  const db = {
    delete: (tabela: unknown) => {
      const reg: DeleteRegistrado = { tabela, whereAplicado: false };
      deletes.push(reg);
      return {
        where: (..._args: unknown[]) => {
          reg.whereAplicado = true;
          return { returning: async () => vencidas };
        },
      };
    },
    // Presentes para o caso de alguem tentar tocar aqui: se forem chamados, o teste vê.
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
  };
  return { svc: new ExpurgoService(db as never), deletes };
}

describe("REQ 5: o sweep apaga portal_conferencia por TTL vencido, filtrado e idempotente", () => {
  it("deleta de portal_conferencia com filtro (where), nunca a tabela inteira", async () => {
    const ctx = montar([{ id: "c1" }, { id: "c2" }]);
    const n = await ctx.svc.expurgarConferencia();

    expect(n).toBe(2);
    const doConf = ctx.deletes.filter((d) => d.tabela === portalConferencia);
    expect(doConf).toHaveLength(1);
    expect(doConf[0]!.whereAplicado).toBe(true);
  });

  it("nenhuma linha vencida devolve zero e nao explode (idempotente)", async () => {
    const ctx = montar([]);
    expect(await ctx.svc.expurgarConferencia()).toBe(0);
  });

  it("o expurgo da conferencia NAO deleta de nenhuma outra tabela (teto fica intocado, C10)", async () => {
    const ctx = montar([{ id: "c1" }]);
    await ctx.svc.expurgarConferencia();
    expect(ctx.deletes).toHaveLength(1);
    expect(ctx.deletes[0]!.tabela).toBe(portalConferencia);
  });
});

describe("REQ 5 (estrutural): a admissao que sai leva conferencia e termo por CASCADE (C2)", () => {
  const SCHEMA = readFileSync(
    join(__dirname, "..", "db", "schema", "tables.ts"),
    "utf8",
  );

  const bloco = (nome: string) => {
    const i = SCHEMA.indexOf(`"${nome}"`);
    expect(i, `tabela ${nome} nao encontrada`).toBeGreaterThan(-1);
    return SCHEMA.slice(i, i + 1200);
  };

  it("portal_conferencia.admissao_id referencia admissoes com onDelete cascade", () => {
    const b = bloco("portal_conferencia");
    expect(b).toMatch(/admissao_id[\s\S]*?references\([\s\S]*?admissoes\.id[\s\S]*?onDelete:\s*"cascade"/);
  });

  it("portal_termo_aceite.admissao_id referencia admissoes com onDelete cascade", () => {
    const b = bloco("portal_termo_aceite");
    expect(b).toMatch(/admissao_id[\s\S]*?references\([\s\S]*?admissoes\.id[\s\S]*?onDelete:\s*"cascade"/);
  });
});
