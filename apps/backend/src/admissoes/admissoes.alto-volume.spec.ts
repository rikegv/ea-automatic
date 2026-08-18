import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { admissaoProjeto } from "../db/schema";
import { AdmissoesService } from "./admissoes.service";
import { LiberarAdmissaoDto } from "./dto/liberar-admissao.dto";
import { LiberarEmLoteDto } from "./dto/liberar-lote.dto";

/**
 * Fake do `select()` do Drizzle com DUAS respostas, e o que as distingue é o JOIN.
 *
 * A liberação faz duas leituras por `select`: a RÉGUA do par (sem join) e a TRAVA DE CPF DUPLICADO
 * (item 3 da OST dos 3 ajustes, que usa leftJoin em cliente e cargo). O fake devolve as linhas da
 * régua na consulta sem join e VAZIO na com join, que é o cenário destes testes: nenhum outro CPF
 * vivo, então a trava não dispara e o caminho medido segue sendo o de sempre.
 */
function selectFake(linhasRegua: unknown[]) {
  return () => ({
    from: () => {
      const comJoin: { leftJoin: () => typeof comJoin; where: () => Promise<unknown[]> } = {
        leftJoin: () => comJoin,
        where: async () => [],
      };
      return { ...comJoin, where: async () => linhasRegua };
    },
  });
}


/**
 * ALTO VOLUME (onda 2): o flag da Liberação.
 *
 * O QUE ESTES TESTES PROTEGEM, e é por isso que eles existem antes de qualquer outra coisa: a
 * liberação é a tela crítica da operação, e esta onda só pode ACRESCENTAR. Metade dos casos abaixo
 * não testa o Alto Volume, testa que ele NÃO ACONTECE quando ninguém pediu, no individual e no lote.
 *
 * O caso que mais importa é o do LOTE, que é o caminho real da frente: projeto sazonal entra em leva
 * de dezenas, não de um em um.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "c@ea.local",
  papel: "COMUM",
  senhaTemporaria: false,
};

const CPF_OK = "52998224725";
const CARGO = "11111111-1111-4111-8111-111111111111";
const PROJETO = "22222222-2222-4222-8222-222222222222";
const PROJETO_OUTRO = "33333333-3333-4333-8333-333333333333";
const GRUPO = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

interface Cenario {
  /** Projeto que o banco devolve. `null` = não existe. */
  projeto?: Row | null;
  /** Grupo que o banco devolve. `null` = não existe. */
  grupo?: Row | null;
  admissoes?: string[];
}

const PROJETO_OK: Row = { id: PROJETO, codCliente: "100", ativo: true };
const GRUPO_OK: Row = { id: GRUPO, projetoId: PROJETO };

/**
 * Fake do Drizzle que CAPTURA A TABELA de cada insert, e não só as linhas: sem isso não dá para
 * afirmar que o vínculo foi (ou não foi) gravado, porque a liberação insere frentes e documentos na
 * mesma transação e todos cairiam no mesmo balde.
 */
function montar(cen: Cenario = {}) {
  const inserts: { tabela: unknown; rows: Row[] }[] = [];
  const atualizados: Row[] = [];
  let transacoes = 0;

  const tx = {
    update: vi.fn(() => ({
      set: (v: Row) => {
        atualizados.push(v);
        return { where: async () => undefined };
      },
    })),
    insert: vi.fn((tabela: unknown) => ({
      values: async (rows: Row | Row[]) => {
        inserts.push({ tabela, rows: Array.isArray(rows) ? rows : [rows] });
        return undefined;
      },
    })),
    // A régua do par é lida DENTRO da transação no individual (`lerReguaDoPar` aceita db ou tx), e
    // FORA dela no lote. As duas leituras têm de devolver a mesma coisa, senão o fake mente.
    select: vi.fn(selectFake([{ tipoDocumentoId: "td1", exigencia: "OBRIGATORIO" }])),
  };

  const ids = cen.admissoes ?? ["a1"];
  let i = 0;
  const db = {
    query: {
      admissoes: {
        findFirst: async () => {
          const id = ids[Math.min(i++, ids.length - 1)];
          return {
            id,
            candidatoCpf: CPF_OK,
            farolGlobal: "AGUARDANDO_LIBERACAO",
            isBanco: false,
            possivelDuplicata: false,
            tipoContrato: null,
            dataAdmissao: null,
          };
        },
      },
      clientes: { findFirst: async () => ({ codCliente: "100" }) },
      cargos: { findFirst: async () => ({ id: CARGO }) },
      candidatos: { findFirst: async () => ({ nome: "Fulano", cpf: CPF_OK }) },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
      projetosAltoVolume: {
        findFirst: async () => (cen.projeto === undefined ? PROJETO_OK : cen.projeto),
      },
      projetoGrupoEntrada: {
        findFirst: async () => (cen.grupo === undefined ? GRUPO_OK : cen.grupo),
      },
    },
    // Régua do par: uma linha obrigatória, para o lote não cair na barra de "par sem régua".
    select: vi.fn(selectFake([{ tipoDocumentoId: "td1", exigencia: "OBRIGATORIO" }])),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes += 1;
      return fn(tx);
    },
  };

  const fila = { enfileirarPullDocumentos: vi.fn().mockResolvedValue(true) };
  return {
    db,
    inserts,
    atualizados,
    contarTransacoes: () => transacoes,
    /** As linhas gravadas em `admissao_projeto`, que é o que esta onda acrescenta. */
    vinculos: () => inserts.filter((x) => x.tabela === admissaoProjeto).flatMap((x) => x.rows),
    service: new AdmissoesService(db as never, fila as never),
  };
}

const DTO_INDIVIDUAL = { codCliente: "100", cargoId: CARGO, uniforme: { possui: false } };
const DTO_LOTE = { codCliente: "100", cargoId: CARGO };

// ── NÃO REGRESSÃO: sem flag, nada muda ──────────────────────────────────────

describe("§A.26: liberação SEM Alto Volume sai idêntica à de hoje", () => {
  it("individual sem flag NÃO grava vínculo nenhum", async () => {
    const ctx = montar();

    const r = await ctx.service.liberar("a1", DTO_INDIVIDUAL, USER);

    expect(r.admissaoId).toBe("a1");
    expect(ctx.vinculos()).toEqual([]);
  });

  it("individual sem flag NEM CONSULTA a tabela de projetos", async () => {
    const ctx = montar();
    // Projeto que existiria: se a liberação sem flag o lesse, este espião acusaria.
    const espiao = vi.fn(async () => PROJETO_OK);
    ctx.db.query.projetosAltoVolume.findFirst = espiao;

    await ctx.service.liberar("a1", DTO_INDIVIDUAL, USER);

    expect(espiao).not.toHaveBeenCalled();
  });

  it("lote sem flag libera as N e não grava vínculo nenhum", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({ admissoes: ids });

    const r = await ctx.service.liberarEmLote(ids, DTO_LOTE, USER);

    expect(r.liberadas).toHaveLength(3);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.contarTransacoes()).toBe(3); // uma transação por admissão, como sempre
    expect(ctx.vinculos()).toEqual([]);
  });

  it("o nascimento continua o mesmo: frentes e documentos seguem sendo gravados", async () => {
    const ctx = montar();

    await ctx.service.liberar("a1", DTO_INDIVIDUAL, USER);

    const todas = ctx.inserts.flatMap((x) => x.rows);
    expect(todas.filter((r) => r.tipo === "AUDITORIA")).toHaveLength(1);
    expect(todas.filter((r) => r.tipo === "EXAME")).toHaveLength(1);
    expect(todas.filter((r) => r.tipoDocumentoId === "td1")).toHaveLength(1);
  });
});

// ── COM flag: o vínculo nasce ───────────────────────────────────────────────

describe("liberação COM Alto Volume", () => {
  it("individual grava UM vínculo, origem LIBERACAO, com autor", async () => {
    const ctx = montar();

    await ctx.service.liberar("a1", { ...DTO_INDIVIDUAL, projetoId: PROJETO }, USER);

    expect(ctx.vinculos()).toEqual([
      {
        admissaoId: "a1",
        projetoId: PROJETO,
        grupoId: null,
        origem: "LIBERACAO",
        vinculadoPorId: "user-1",
      },
    ]);
  });

  it("o grupo é OPCIONAL: sem ele o vínculo nasce preso só ao projeto", async () => {
    const ctx = montar();

    await ctx.service.liberar("a1", { ...DTO_INDIVIDUAL, projetoId: PROJETO }, USER);

    expect(ctx.vinculos()[0]).toMatchObject({ grupoId: null });
  });

  it("com grupo escolhido, o grupo é gravado junto", async () => {
    const ctx = montar();

    await ctx.service.liberar(
      "a1",
      { ...DTO_INDIVIDUAL, projetoId: PROJETO, grupoEntradaId: GRUPO },
      USER,
    );

    expect(ctx.vinculos()[0]).toMatchObject({ projetoId: PROJETO, grupoId: GRUPO });
  });

  /**
   * O CASO PRINCIPAL DA FRENTE. Também é o teste que pega a armadilha dos três dtos tipados inline:
   * se o campo faltar em qualquer um dos três, o valor some em silêncio e este teste vê zero vínculo
   * em vez de três.
   */
  it("LOTE: o projeto vale para TODAS as N, um vínculo por admissão", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({ admissoes: ids });

    const r = await ctx.service.liberarEmLote(
      ids,
      { ...DTO_LOTE, projetoId: PROJETO, grupoEntradaId: GRUPO },
      USER,
    );

    expect(r.liberadas).toHaveLength(3);
    const vinculos = ctx.vinculos();
    expect(vinculos).toHaveLength(3);
    expect(vinculos.map((v) => v.admissaoId)).toEqual(ids);
    for (const v of vinculos) {
      expect(v).toMatchObject({ projetoId: PROJETO, grupoId: GRUPO, origem: "LIBERACAO" });
    }
  });

  it("LOTE valida o projeto UMA vez, não uma por admissão", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({ admissoes: ids });
    const espiao = vi.fn(async () => PROJETO_OK);
    ctx.db.query.projetosAltoVolume.findFirst = espiao;

    await ctx.service.liberarEmLote(ids, { ...DTO_LOTE, projetoId: PROJETO }, USER);

    expect(espiao).toHaveBeenCalledTimes(1);
  });
});

// ── O que o validador recusa, e quando ele recusa ───────────────────────────

describe("validação do projeto escolhido", () => {
  it("projeto de OUTRO cliente é recusado", async () => {
    const ctx = montar({ projeto: { id: PROJETO_OUTRO, codCliente: "999", ativo: true } });

    const err = await ctx.service
      .liberar("a1", { ...DTO_INDIVIDUAL, projetoId: PROJETO_OUTRO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("outro cliente");
  });

  it("projeto INATIVO é recusado (encerrado não recebe gente nova)", async () => {
    const ctx = montar({ projeto: { id: PROJETO, codCliente: "100", ativo: false } });

    const err = await ctx.service
      .liberar("a1", { ...DTO_INDIVIDUAL, projetoId: PROJETO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("inativo");
  });

  it("projeto inexistente é recusado", async () => {
    const ctx = montar({ projeto: null });

    const err = await ctx.service
      .liberar("a1", { ...DTO_INDIVIDUAL, projetoId: PROJETO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(NotFoundException);
  });

  it("grupo de OUTRO projeto é recusado", async () => {
    const ctx = montar({ grupo: { id: GRUPO, projetoId: PROJETO_OUTRO } });

    const err = await ctx.service
      .liberar("a1", { ...DTO_INDIVIDUAL, projetoId: PROJETO, grupoEntradaId: GRUPO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("não pertence a este projeto");
  });

  it("projeto errado BARRA O LOTE INTEIRO antes do laço: ninguém é liberado", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({ admissoes: ids, projeto: { id: PROJETO, codCliente: "999", ativo: true } });

    const err = await ctx.service
      .liberarEmLote(ids, { ...DTO_LOTE, projetoId: PROJETO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(ctx.contarTransacoes()).toBe(0); // nenhuma admissão chegou a nascer
    expect(ctx.vinculos()).toEqual([]);
  });

  it("a recusa acontece ANTES da transação: nada é gravado pela metade", async () => {
    const ctx = montar({ projeto: { id: PROJETO, codCliente: "999", ativo: true } });

    await ctx.service
      .liberar("a1", { ...DTO_INDIVIDUAL, projetoId: PROJETO }, USER)
      .catch(() => undefined);

    expect(ctx.contarTransacoes()).toBe(0);
    expect(ctx.atualizados).toEqual([]);
  });
});

// ── DTOs: os dois campos, nos dois contratos de entrada ─────────────────────

describe("DTOs da liberação aceitam os campos do Alto Volume", () => {
  const baseInd = { codCliente: "100", cargoId: CARGO };
  const baseLote = { admissaoIds: ["55555555-5555-4555-8555-555555555555"], ...baseInd };

  it("individual: ausentes é válido (o caminho de quem não usa o flag)", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, baseInd);
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
  });

  it("individual: uuid nos dois campos é válido", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, {
      ...baseInd,
      projetoId: PROJETO,
      grupoEntradaId: GRUPO,
    });
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.projetoId).toBe(PROJETO);
    expect(dto.grupoEntradaId).toBe(GRUPO);
  });

  it("individual: valor que não é uuid é recusado", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, { ...baseInd, projetoId: "projeto-1" });
    expect(validateSync(dto, { whitelist: true }).length).toBeGreaterThan(0);
  });

  it("lote: uuid nos dois campos é válido e SOBREVIVE ao whitelist", () => {
    const dto = plainToInstance(LiberarEmLoteDto, {
      ...baseLote,
      projetoId: PROJETO,
      grupoEntradaId: GRUPO,
    });
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.projetoId).toBe(PROJETO);
    expect(dto.grupoEntradaId).toBe(GRUPO);
  });

  it("lote: ausentes é válido", () => {
    const dto = plainToInstance(LiberarEmLoteDto, baseLote);
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
  });
});
