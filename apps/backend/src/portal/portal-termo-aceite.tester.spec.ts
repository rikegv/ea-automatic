import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { PortalTermoService } from "./portal-termo.service";
import { portalTermoAceite } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), do REQUISITO, em paralelo a construcao. NAO escrevi o codigo.
 *
 * REQ 7 (C12): POST /portal/termo grava o aceite pela admissao da SESSAO (nunca do corpo), e um
 * corpo que aponte para admissao DIFERENTE e RECUSADO (defesa em profundidade). A trilha passa a
 * devolver `termoAceito=true` (a leitura esta provada em `portal-conferencia-na-trilha.tester.spec`).
 *
 * §A.6: aceite e prova de consentimento LGPD; guarda so admissao + carimbo + jti, nunca CPF/nome.
 */

interface Insert {
  tabela: unknown;
  valores: Record<string, unknown>;
}

const SESSAO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JTI = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function montar(gravado: Date | null = new Date("2026-09-23T12:00:00.000Z")) {
  const inserts: Insert[] = [];
  const db = {
    insert: (tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => {
        inserts.push({ tabela, valores });
        return { onConflictDoNothing: async () => undefined };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (gravado ? [{ aceitoEm: gravado }] : []) }),
      }),
    }),
  };
  return { svc: new PortalTermoService(db as never), inserts };
}

describe("REQ 7: o aceite do termo grava pela admissao da SESSAO, nunca do corpo", () => {
  it("sem corpo divergente, grava na admissao da sessao com o jti da sessao", async () => {
    const ctx = montar();
    const r = await ctx.svc.aceitar({ admissaoId: SESSAO, jtiLink: JTI });

    expect(r.aceito).toBe(true);
    expect(typeof r.aceitoEm).toBe("string");
    const aceites = ctx.inserts.filter((i) => i.tabela === portalTermoAceite);
    expect(aceites).toHaveLength(1);
    expect(aceites[0]!.valores.admissaoId).toBe(SESSAO);
    expect(aceites[0]!.valores.jtiLink).toBe(JTI);
  });

  it("corpo apontando para admissao DIFERENTE e recusado, e nada e gravado (C12)", async () => {
    const ctx = montar();
    await expect(
      ctx.svc.aceitar({ admissaoId: SESSAO, jtiLink: JTI, admissaoNoCorpo: OUTRA }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.inserts).toHaveLength(0);
  });

  it("corpo apontando para a MESMA admissao da sessao e aceito (defesa em profundidade nao barra o legitimo)", async () => {
    const ctx = montar();
    const r = await ctx.svc.aceitar({ admissaoId: SESSAO, jtiLink: JTI, admissaoNoCorpo: SESSAO });
    expect(r.aceito).toBe(true);
    expect(ctx.inserts.filter((i) => i.tabela === portalTermoAceite)).toHaveLength(1);
  });

  it("a resposta reflete o carimbo GRAVADO (o primeiro aceite), nao um do request", async () => {
    const primeiro = new Date("2026-01-01T00:00:00.000Z");
    const ctx = montar(primeiro);
    const r = await ctx.svc.aceitar({ admissaoId: SESSAO, jtiLink: JTI });
    expect(r.aceitoEm).toBe(primeiro.toISOString());
  });
});

describe("REQ 7 (estrutural): o controller usa a admissao da SESSAO e so passa o corpo como guarda", () => {
  const CTRL = readFileSync(join(__dirname, "portal-termo.controller.ts"), "utf8");

  it("grava com req.portal.admissaoId, nunca com dto.admissaoId como origem", () => {
    expect(CTRL).toMatch(/admissaoId:\s*req\.portal!?\.admissaoId/);
    // O corpo so entra como `admissaoNoCorpo` (para o servico recusar a divergencia), nunca como
    // origem da gravacao.
    expect(CTRL).toMatch(/admissaoNoCorpo:\s*dto\.admissaoId/);
    expect(CTRL).not.toMatch(/admissaoId:\s*dto\.admissaoId/);
  });

  it("a rota e protegida pelo guard de sessao do portal", () => {
    expect(CTRL).toMatch(/@UseGuards\(PortalSessaoGuard\)/);
    expect(CTRL).toMatch(/@Post\("termo"\)/);
  });
});
