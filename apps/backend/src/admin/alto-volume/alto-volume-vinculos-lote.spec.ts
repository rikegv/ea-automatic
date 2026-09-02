import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { AltoVolumeVinculosService } from "./alto-volume-vinculos.service";
import { DesvincularEmLoteDto, TrocarVinculosEmLoteDto } from "./alto-volume.dto";

/**
 * TROCAR E DESVINCULAR EM MASSA na tabela "Admissões No Projeto".
 *
 * O QUE ESTES TESTES PROTEGEM, e é o mesmo risco da ação individual multiplicado pelo tamanho da
 * seleção: mover gente para um projeto de outro cliente, mexer no vínculo de um projeto pela tela de
 * outro, e o lote inteiro cair por causa de uma linha. Uma contagem errada aqui não aparece: aparece
 * semanas depois, no painel, com o projeto errado cheio.
 *
 * A PROMESSA DA §A.26 também é testada: desvincular escreve em UMA tabela só, `admissao_projeto`.
 * Quem sai do projeto continua na esteira exatamente como estava.
 */

const USER: AuthUser = {
  id: "user-3",
  email: "gerencial@ea.local",
  papel: "MASTER",
  senhaTemporaria: false,
};

const ORIGEM = "11111111-1111-4111-8111-111111111111";
const DESTINO = "22222222-2222-4222-8222-222222222222";
const GRUPO = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const PROJETOS: Record<string, Row> = {
  [ORIGEM]: { id: ORIGEM, codCliente: "100", ativo: true },
  [DESTINO]: { id: DESTINO, codCliente: "100", ativo: true },
};

/** Três vínculos deste projeto, e um que é de outro. */
const VINCULOS: Record<string, Row> = {
  "v-1": { id: "v-1", admissaoId: "a-1", projetoId: ORIGEM, grupoId: null },
  "v-2": { id: "v-2", admissaoId: "a-2", projetoId: ORIGEM, grupoId: null },
  "v-3": { id: "v-3", admissaoId: "a-3", projetoId: ORIGEM, grupoId: null },
  "v-alheio": { id: "v-alheio", admissaoId: "a-9", projetoId: DESTINO, grupoId: null },
};

const ADMISSOES: Record<string, Row> = {
  "a-1": { id: "a-1", codCliente: "100" },
  "a-2": { id: "a-2", codCliente: "100" },
  // Pessoa de OUTRO cliente: a que o destino não pode receber.
  "a-3": { id: "a-3", codCliente: "999" },
  "a-9": { id: "a-9", codCliente: "100" },
};

interface Cenario {
  projetos?: Record<string, Row>;
  grupo?: Row | null;
}

/** Puxa os parâmetros de uma condição do drizzle, para o fake responder POR ID. */
function parametros(cond: unknown): unknown[] {
  const out: unknown[] = [];
  const visitar = (no: unknown) => {
    if (Array.isArray(no)) return no.forEach(visitar);
    if (!no || typeof no !== "object") return;
    const rec = no as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(rec.queryChunks)) return rec.queryChunks.forEach(visitar);
    if ("value" in rec) out.push(rec.value);
  };
  visitar(cond);
  return out;
}
const primeiroId = (arg: { where?: unknown }) =>
  parametros(arg.where).find((v) => typeof v === "string") as string | undefined;

function montar(cen: Cenario = {}) {
  const projetos = cen.projetos ?? PROJETOS;
  /** Toda escrita, com a TABELA: é como se afirma que só `admissao_projeto` foi tocada. */
  const escritas: { verbo: string; tabela: unknown; valores?: Row; ids: string[] }[] = [];

  const leitura = {
    from: () => leitura,
    where: async (cond: unknown) => {
      // O `select` do desvincular em lote: devolve os ids pedidos que SÃO deste projeto.
      const params = parametros(cond).filter((v) => typeof v === "string") as string[];
      const projetoId = params[0];
      return params
        .slice(1)
        .filter((id) => VINCULOS[id]?.projetoId === projetoId)
        .map((id) => ({ id }));
    },
  };

  const db = {
    query: {
      projetosAltoVolume: {
        findFirst: vi.fn(async (arg: { where?: unknown }) => projetos[primeiroId(arg) ?? ""] ?? null),
      },
      projetoGrupoEntrada: {
        findFirst: vi.fn(async () =>
          cen.grupo === undefined ? { id: GRUPO, projetoId: DESTINO } : cen.grupo,
        ),
      },
      admissaoProjeto: {
        findFirst: vi.fn(async (arg: { where?: unknown }) => VINCULOS[primeiroId(arg) ?? ""] ?? null),
      },
      admissoes: {
        findFirst: vi.fn(async (arg: { where?: unknown }) => ADMISSOES[primeiroId(arg) ?? ""] ?? null),
      },
    },
    select: vi.fn(() => leitura),
    update: vi.fn((tabela: unknown) => ({
      set: (valores: Row) => ({
        where: async (cond: unknown) => {
          escritas.push({
            verbo: "update",
            tabela,
            valores,
            ids: parametros(cond).filter((v) => typeof v === "string") as string[],
          });
        },
      }),
    })),
    delete: vi.fn((tabela: unknown) => ({
      where: async (cond: unknown) => {
        escritas.push({
          verbo: "delete",
          tabela,
          ids: parametros(cond).filter((v) => typeof v === "string") as string[],
        });
      },
    })),
  };

  return { db, escritas, service: new AltoVolumeVinculosService(db as never) };
}

// ── TROCAR EM MASSA ─────────────────────────────────────────────────────────

describe("trocar em massa: as travas da troca individual, uma por uma", () => {
  it("move os aprovados num update só, com origem CORRECAO e autor", async () => {
    const ctx = montar();

    const r = await ctx.service.trocarEmLote(
      ORIGEM,
      { vinculoIds: ["v-1", "v-2"], projetoDestinoId: DESTINO },
      USER,
    );

    expect(r.movidos).toBe(2);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.escritas).toHaveLength(1);
    expect(ctx.escritas[0].valores).toMatchObject({
      projetoId: DESTINO,
      origem: "CORRECAO",
      vinculadoPorId: USER.id,
    });
    expect(ctx.escritas[0].ids).toEqual(expect.arrayContaining(["v-1", "v-2"]));
  });

  it("RECUSA admissão de outro cliente, e move as demais", async () => {
    const ctx = montar();

    const r = await ctx.service.trocarEmLote(
      ORIGEM,
      { vinculoIds: ["v-1", "v-3"], projetoDestinoId: DESTINO },
      USER,
    );

    expect(r.movidos).toBe(1);
    expect(r.falhas[0]).toMatchObject({ vinculoId: "v-3" });
    expect(r.falhas[0].motivo).toContain("outro cliente");
    expect(ctx.escritas[0].ids).toEqual(["v-1"]);
  });

  it("NÃO toca vínculo de OUTRO projeto, mesmo se o id vier na lista", async () => {
    // A tela de um projeto não pode mexer no vínculo de outro sem mostrar.
    const ctx = montar();

    const r = await ctx.service.trocarEmLote(
      ORIGEM,
      { vinculoIds: ["v-1", "v-alheio"], projetoDestinoId: DESTINO },
      USER,
    );

    expect(r.movidos).toBe(1);
    expect(r.falhas[0].motivo).toContain("não é deste projeto");
    expect(ctx.escritas[0].ids).not.toContain("v-alheio");
  });

  it("RECUSA o lote inteiro quando o projeto de destino está INATIVO", async () => {
    const ctx = montar({
      projetos: { ...PROJETOS, [DESTINO]: { ...PROJETOS[DESTINO], ativo: false } },
    });

    const err = await ctx.service
      .trocarEmLote(ORIGEM, { vinculoIds: ["v-1"], projetoDestinoId: DESTINO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("Reative");
    expect(ctx.escritas).toEqual([]);
  });

  it("RECUSA grupo que não é do projeto de DESTINO", async () => {
    const ctx = montar({ grupo: { id: GRUPO, projetoId: ORIGEM } });

    const err = await ctx.service
      .trocarEmLote(ORIGEM, { vinculoIds: ["v-1"], projetoDestinoId: DESTINO, grupoId: GRUPO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(ctx.escritas).toEqual([]);
  });

  it("RECUSA trocar para o MESMO projeto: seria um lote que não faz nada", async () => {
    const ctx = montar();

    const err = await ctx.service
      .trocarEmLote(ORIGEM, { vinculoIds: ["v-1"], projetoDestinoId: ORIGEM }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(ctx.escritas).toEqual([]);
  });

  it("o GRUPO não atravessa a troca: sem grupo escolhido, vai para a cota do projeto inteiro", async () => {
    // Grupo é do projeto. Manter o antigo apontaria a leva de um projeto dentro de outro.
    const ctx = montar();

    await ctx.service.trocarEmLote(
      ORIGEM,
      { vinculoIds: ["v-1"], projetoDestinoId: DESTINO },
      USER,
    );

    expect(ctx.escritas[0].valores).toMatchObject({ grupoId: null });
  });

  it("id repetido vira um só", async () => {
    const ctx = montar();

    const r = await ctx.service.trocarEmLote(
      ORIGEM,
      { vinculoIds: ["v-1", "v-1", "v-1"], projetoDestinoId: DESTINO },
      USER,
    );

    expect(r.movidos).toBe(1);
    expect(r.falhas).toHaveLength(0);
  });

  it("lote SÓ com linha ruim não escreve nada", async () => {
    const ctx = montar();

    const r = await ctx.service.trocarEmLote(
      ORIGEM,
      { vinculoIds: ["v-fantasma"], projetoDestinoId: DESTINO },
      USER,
    );

    expect(r.movidos).toBe(0);
    expect(ctx.escritas).toEqual([]);
  });
});

// ── DESVINCULAR EM MASSA ────────────────────────────────────────────────────

describe("desvincular em massa", () => {
  it("tira os selecionados num delete só", async () => {
    const ctx = montar();

    const r = await ctx.service.desvincularEmLote(ORIGEM, { vinculoIds: ["v-1", "v-2"] });

    expect(r.removidos).toBe(2);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.escritas).toHaveLength(1);
    expect(ctx.escritas[0].verbo).toBe("delete");
    expect(ctx.escritas[0].ids).toEqual(expect.arrayContaining(["v-1", "v-2"]));
  });

  /** §A.26: a onda escreve em UMA tabela. Admissão, frente, documento e farol não são tocados. */
  it("escreve SÓ em admissao_projeto", async () => {
    const ctx = montar();

    await ctx.service.desvincularEmLote(ORIGEM, { vinculoIds: ["v-1"] });

    expect(ctx.escritas).toHaveLength(1);
    expect(ctx.db.update).not.toHaveBeenCalled();
  });

  it("NÃO tira vínculo de outro projeto, e diz por quê", async () => {
    const ctx = montar();

    const r = await ctx.service.desvincularEmLote(ORIGEM, { vinculoIds: ["v-1", "v-alheio"] });

    expect(r.removidos).toBe(1);
    expect(r.falhas[0]).toEqual({
      vinculoId: "v-alheio",
      motivo: "Vínculo não encontrado neste projeto.",
    });
    expect(ctx.escritas[0].ids).not.toContain("v-alheio");
  });

  it("lote SÓ com id inválido não chama o delete", async () => {
    const ctx = montar();

    const r = await ctx.service.desvincularEmLote(ORIGEM, { vinculoIds: ["v-fantasma"] });

    expect(r.removidos).toBe(0);
    expect(ctx.escritas).toEqual([]);
  });

  it("projeto inexistente recusa o lote inteiro", async () => {
    const ctx = montar({ projetos: {} });

    await expect(
      ctx.service.desvincularEmLote(ORIGEM, { vinculoIds: ["v-1"] }),
    ).rejects.toThrow();
    expect(ctx.escritas).toEqual([]);
  });
});

describe("os DTOs barram o pedido torto antes do serviço", () => {
  const erros = (cls: unknown, body: unknown) =>
    validateSync(plainToInstance(cls as never, body)).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it("trocar exige o projeto de DESTINO", () => {
    expect(erros(TrocarVinculosEmLoteDto, { vinculoIds: [ORIGEM] }).length).toBeGreaterThan(0);
  });

  it("trocar com destino válido passa", () => {
    expect(
      erros(TrocarVinculosEmLoteDto, { vinculoIds: [ORIGEM], projetoDestinoId: DESTINO }),
    ).toEqual([]);
  });

  it("desvincular recusa lista vazia com frase de gente", () => {
    expect(erros(DesvincularEmLoteDto, { vinculoIds: [] }).join(" ")).toContain(
      "Selecione pelo menos uma",
    );
  });

  it("acima do teto é recusado nos dois", () => {
    const muitos = Array.from({ length: 501 }, () => ORIGEM);
    expect(erros(DesvincularEmLoteDto, { vinculoIds: muitos }).join(" ")).toContain("no máximo 500");
    expect(
      erros(TrocarVinculosEmLoteDto, { vinculoIds: muitos, projetoDestinoId: DESTINO }).join(" "),
    ).toContain("no máximo 500");
  });
});
