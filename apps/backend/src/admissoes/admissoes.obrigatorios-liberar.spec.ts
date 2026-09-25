import "reflect-metadata";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import { liberacaoOverrideAceites } from "../db/schema";
import type { AuthUser } from "../auth/auth.types";

/**
 * ITEM 6 DO DIRETOR — obrigatórios-para-liberar na Liberação Admissional.
 *
 * A liberação exige 6 campos próprios deste gate (Cargo, Sexo, Tipo de contrato, Data de admissão,
 * Pacote de benefícios, Escala). Comum NÃO libera com faltante; só MASTER/SUPER_ADMIN, e só com
 * aceite explícito, e cada aceite deixa um rastro (quem, papel, quais campos faltavam). O conjunto é
 * PRÓPRIO deste gate, distinto da régua unificada (§A.19) — Sexo não vira pendência de esteira.
 *
 * Sexo é individual-only: no LOTE o gate checa os outros 5 (o `LiberarEmLoteDto` nem carrega Sexo).
 */

const CARGO = "11111111-1111-4111-8111-111111111111";
const CPF_OK = "52998224725";

const COMUM: AuthUser = { id: "u-comum", email: "c@ea.local", papel: "COMUM", senhaTemporaria: false };
const MASTER: AuthUser = { id: "u-master", email: "m@ea.local", papel: "MASTER", senhaTemporaria: false };

/** DTO que preenche TODOS os 6: liberação sem faltante. Uniforme respondido (trava da Onda 3). */
const DTO_COMPLETO = {
  codCliente: "100",
  cargoId: CARGO,
  tipoContrato: "Interno",
  dataAdmissao: "2026-10-01",
  vagaFolha: { escala: "12x36" },
  pacoteBeneficios: [{ beneficioId: "b-1" }],
  sexo: "MASCULINO" as const,
  uniforme: { possui: false },
};

/** DTO cru: só cliente + cargo + uniforme. Sexo, tipo, data, benefícios e escala faltam. */
const DTO_CRU = { codCliente: "100", cargoId: CARGO, uniforme: { possui: false } };

interface Cenario {
  /** Sexo já gravado no candidato (o DTO tem precedência). */
  candidatoSexo?: string | null;
  admStored?: { tipoContrato?: string | null; dataAdmissao?: string | null };
}

function montar(cen: Cenario = {}) {
  const inserts: { tabela: unknown; rows: Record<string, unknown>[] }[] = [];
  let transacoes = 0;

  const tx = {
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    insert: vi.fn((tabela: unknown) => ({
      values: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        inserts.push({ tabela, rows: Array.isArray(rows) ? rows : [rows] });
        return undefined;
      },
    })),
    select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
  };

  const db = {
    query: {
      admissoes: {
        findFirst: async () => ({
          id: "a1",
          candidatoCpf: CPF_OK,
          farolGlobal: "AGUARDANDO_LIBERACAO",
          isBanco: false,
          possivelDuplicata: false,
          tipoContrato: cen.admStored?.tipoContrato ?? null,
          dataAdmissao: cen.admStored?.dataAdmissao ?? null,
        }),
      },
      clientes: { findFirst: async () => ({ codCliente: "100" }) },
      cargos: { findFirst: async () => ({ id: CARGO }) },
      candidatos: { findFirst: async () => ({ nome: "Fulano", cpf: CPF_OK, sexo: cen.candidatoSexo ?? null }) },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
    },
    // Sem join = régua do par (uma linha obrigatória, para o lote não cair na barra "par sem régua")
    // e catálogo de benefícios (as linhas da régua não casam por id, então `validarValoresDoPacote`
    // passa). Com leftJoin = trava de duplicidade (sem outras admissões vivas).
    select: vi.fn(() => ({
      from: () => {
        const comJoin = { leftJoin: () => comJoin, where: async () => [] };
        return { ...comJoin, where: async () => [{ tipoDocumentoId: "td1", exigencia: "OBRIGATORIO" }] };
      },
    })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes += 1;
      return fn(tx);
    },
  };

  const fila = { enfileirarPullDocumentos: vi.fn().mockResolvedValue(true) };
  return {
    service: new AdmissoesService(db as never, fila as never),
    rastros: () => inserts.filter((i) => i.tabela === liberacaoOverrideAceites).flatMap((i) => i.rows),
    contarTransacoes: () => transacoes,
  };
}

describe("item 6: gate dos obrigatórios-para-liberar (INDIVIDUAL)", () => {
  it("COMUM com campos faltando é RECUSADO (Forbidden) e nada é escrito", async () => {
    const ctx = montar();
    const err = await ctx.service.liberar("a1", DTO_CRU, COMUM).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    expect(ctx.contarTransacoes()).toBe(0);
  });

  it("MASTER com campos faltando SEM aceite é RECUSADO (Conflict pedindo aceite)", async () => {
    const ctx = montar();
    const err = await ctx.service.liberar("a1", DTO_CRU, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ needsConfirmation: true });
    expect(ctx.contarTransacoes()).toBe(0);
  });

  it("MASTER com aceite LIBERA e grava o rastro com os rótulos dos campos faltantes", async () => {
    const ctx = montar();
    const r = await ctx.service.liberar(
      "a1",
      { ...DTO_CRU, aceiteObrigatoriosFaltantes: true },
      MASTER,
    );

    expect(r.admissaoId).toBe("a1");
    const rastros = ctx.rastros();
    expect(rastros).toHaveLength(1);
    expect(rastros[0]).toMatchObject({ admissaoId: "a1", autorId: "u-master", papelAutor: "MASTER" });
    const campos = String(rastros[0].camposFaltantes);
    // Os 5 que faltam no DTO cru (Cargo vem preenchido). Sexo entra no INDIVIDUAL.
    expect(campos).toContain("Sexo");
    expect(campos).toContain("Tipo de contrato");
    expect(campos).toContain("Data de admissão");
    expect(campos).toContain("Pacote de benefícios");
    expect(campos).toContain("Escala");
    // §A.6: nunca CPF, nome ou valor.
    expect(campos).not.toContain(CPF_OK);
    expect(campos).not.toContain("Fulano");
  });

  it("sem nenhum faltante LIBERA normal, sem rastro, mesmo COMUM", async () => {
    const ctx = montar();
    const r = await ctx.service.liberar("a1", DTO_COMPLETO, COMUM);

    expect(r.admissaoId).toBe("a1");
    expect(ctx.rastros()).toHaveLength(0);
    expect(ctx.contarTransacoes()).toBe(1);
  });

  it("Sexo já gravado no candidato conta como preenchido (não vira faltante)", async () => {
    const ctx = montar({ candidatoSexo: "FEMININO" });
    // DTO completo, mas sem sexo no corpo: o sexo vem do candidato.
    const semSexo = {
      codCliente: "100",
      cargoId: CARGO,
      tipoContrato: "Interno",
      dataAdmissao: "2026-10-01",
      vagaFolha: { escala: "12x36" },
      pacoteBeneficios: [{ beneficioId: "b-1" }],
      uniforme: { possui: false },
    };
    const r = await ctx.service.liberar("a1", semSexo, COMUM);

    expect(r.admissaoId).toBe("a1");
    expect(ctx.rastros()).toHaveLength(0);
  });
});

describe("item 6: gate no LOTE exclui Sexo (individual-only)", () => {
  const idsUm = ["a1"];

  it("COMUM em lote com campos faltando: a linha FALHA no relatório, não libera", async () => {
    const ctx = montar();
    const r = await ctx.service.liberarEmLote(idsUm, DTO_CRU, COMUM);

    expect(r.liberadas).toHaveLength(0);
    expect(r.falhas).toHaveLength(1);
  });

  it("MASTER em lote com aceite libera e grava rastro SEM Sexo (os 5, não os 6)", async () => {
    const ctx = montar();
    const r = await ctx.service.liberarEmLote(
      idsUm,
      { ...DTO_CRU, aceiteObrigatoriosFaltantes: true },
      MASTER,
    );

    expect(r.liberadas).toHaveLength(1);
    const rastros = ctx.rastros();
    expect(rastros).toHaveLength(1);
    const campos = String(rastros[0].camposFaltantes);
    expect(campos).not.toContain("Sexo");
    expect(campos).toContain("Escala");
    expect(campos).toContain("Tipo de contrato");
  });

  it("lote com os 5 preenchidos (sem Sexo no corpo) LIBERA sem rastro, mesmo COMUM", async () => {
    const ctx = montar();
    // O lote não usa Sexo nem uniforme; mantém os 5 do gate do lote.
    const dtoLote = {
      codCliente: "100",
      cargoId: CARGO,
      tipoContrato: "Interno",
      dataAdmissao: "2026-10-01",
      vagaFolha: { escala: "12x36" },
      pacoteBeneficios: [{ beneficioId: "b-1" }],
    };
    const r = await ctx.service.liberarEmLote(idsUm, dtoLote, COMUM);

    expect(r.liberadas).toHaveLength(1);
    expect(ctx.rastros()).toHaveLength(0);
  });
});
