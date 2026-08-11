import "reflect-metadata";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { AltoVolumeVinculosService } from "./alto-volume-vinculos.service";
import {
  AtualizarVinculoDto,
  VincularAdmissaoDto,
  VincularEmLoteDto,
} from "./alto-volume.dto";

/**
 * ALTO VOLUME (onda 3): vínculo por correção, troca, desvínculo e a lista de órfãos.
 *
 * O QUE ESTES TESTES PROTEGEM. A onda 3 existe para consertar contagem errada, então o erro que
 * importa aqui é o vínculo TORTO: gente de outro cliente entrando no projeto, admissão vinculada por
 * cima de outro projeto, grupo de um projeto pendurado em outro. Cada um deles faz a contagem mentir
 * em silêncio, que é pior que a ação recusada com uma frase.
 *
 * O segundo grupo protege a promessa da §A.26: esta onda escreve em UMA tabela só. Desvincular não
 * pode encostar em admissão, frente nem documento, e há teste afirmando exatamente isso.
 */

const USER: AuthUser = {
  id: "user-3",
  email: "gerencial@ea.local",
  papel: "MASTER",
  senhaTemporaria: false,
};

const PROJETO = "22222222-2222-4222-8222-222222222222";
const PROJETO_OUTRO = "33333333-3333-4333-8333-333333333333";
const GRUPO = "44444444-4444-4444-8444-444444444444";
const ADMISSAO = "55555555-5555-4555-8555-555555555555";
const VINCULO = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown>;

const PROJETO_OK: Row = {
  id: PROJETO,
  codCliente: "100",
  ativo: true,
  dataInicio: "2026-09-01",
  dataFim: "2026-09-30",
};
const ADMISSAO_OK: Row = { id: ADMISSAO, codCliente: "100", farolGlobal: "EM_ADMISSAO" };
const GRUPO_OK: Row = { id: GRUPO, projetoId: PROJETO };
const VINCULO_OK: Row = { id: VINCULO, admissaoId: ADMISSAO, projetoId: PROJETO, grupoId: null };

interface Cenario {
  projeto?: Row | null;
  /** Projeto de DESTINO da troca, quando diferente do de origem. */
  projetoDestino?: Row | null;
  admissao?: Row | null;
  grupo?: Row | null;
  /** Vínculo já existente da admissão (`null` = nenhum, o caso do órfão). */
  vinculoDaAdmissao?: Row | null;
  vinculo?: Row | null;
  /** Linhas que a consulta de leitura devolve. */
  linhas?: Row[];
}

/**
 * Fake do Drizzle que CAPTURA a tabela de cada escrita, e não só os valores: o ponto da §A.26 é que
 * só `admissao_projeto` é tocada, e isso não dá para afirmar sem saber em qual tabela o insert caiu.
 */
function montar(cen: Cenario = {}) {
  const escritas: { verbo: string; tabela: unknown; valores?: Row }[] = [];
  const wheres: unknown[] = [];
  const linhas = cen.linhas ?? [];

  const leitura = {
    from: () => leitura,
    innerJoin: () => leitura,
    leftJoin: () => leitura,
    where: (cond: unknown) => {
      wheres.push(cond);
      return leitura;
    },
    orderBy: async () => linhas,
  };

  const db = {
    query: {
      projetosAltoVolume: {
        // Na TROCA o único projeto lido é o de DESTINO (o de origem vem do próprio vínculo), então
        // o cenário de troca sobrescreve o projeto por aqui.
        findFirst: vi.fn(async () => {
          if (cen.projetoDestino !== undefined) return cen.projetoDestino;
          return cen.projeto === undefined ? PROJETO_OK : cen.projeto;
        }),
      },
      admissoes: {
        findFirst: vi.fn(async () => (cen.admissao === undefined ? ADMISSAO_OK : cen.admissao)),
      },
      projetoGrupoEntrada: {
        findFirst: vi.fn(async () => (cen.grupo === undefined ? GRUPO_OK : cen.grupo)),
      },
      admissaoProjeto: {
        findFirst: vi.fn(async () => {
          // O mesmo `findFirst` serve a dois usos: achar o vínculo pela admissão (vincular) e achar
          // o vínculo pelo id (troca). O cenário diz qual deles está em jogo.
          if (cen.vinculo !== undefined) return cen.vinculo;
          return cen.vinculoDaAdmissao === undefined ? null : cen.vinculoDaAdmissao;
        }),
      },
    },
    select: vi.fn(() => leitura),
    insert: vi.fn((tabela: unknown) => ({
      values: (valores: Row) => {
        escritas.push({ verbo: "insert", tabela, valores });
        return { returning: async () => [{ id: "novo", ...valores }] };
      },
    })),
    update: vi.fn((tabela: unknown) => ({
      set: (valores: Row) => {
        escritas.push({ verbo: "update", tabela, valores });
        return { where: () => ({ returning: async () => [{ id: VINCULO, ...valores }] }) };
      },
    })),
    delete: vi.fn((tabela: unknown) => {
      escritas.push({ verbo: "delete", tabela });
      return {
        where: () => ({
          returning: async () => (cen.vinculo === null ? [] : [{ id: VINCULO }]),
        }),
      };
    }),
  };

  return {
    db,
    escritas,
    wheres,
    service: new AltoVolumeVinculosService(db as never),
  };
}

/** Junta os PARÂMETROS de uma condição SQL do drizzle, para conferir o que chegou na consulta. */
function parametros(cond: unknown): unknown[] {
  const out: unknown[] = [];
  const visitar = (no: unknown) => {
    // Um chunk pode ser um ARRAY de parâmetros (é assim que o `not in (…)` chega).
    if (Array.isArray(no)) {
      for (const c of no) visitar(c);
      return;
    }
    if (!no || typeof no !== "object") return;
    const rec = no as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(rec.queryChunks)) {
      for (const c of rec.queryChunks) visitar(c);
      return;
    }
    if ("value" in rec) out.push(rec.value);
  };
  visitar(cond);
  return out;
}

// ── VINCULAR (a correção posterior) ─────────────────────────────────────────

describe("vincular por correção", () => {
  it("grava UMA linha em admissao_projeto, origem CORRECAO, com autor", async () => {
    const ctx = montar();

    await ctx.service.vincular(PROJETO, { admissaoId: ADMISSAO }, USER);

    expect(ctx.escritas).toHaveLength(1);
    expect(ctx.escritas[0].verbo).toBe("insert");
    expect(ctx.escritas[0].valores).toEqual({
      admissaoId: ADMISSAO,
      projetoId: PROJETO,
      grupoId: null,
      origem: "CORRECAO",
      vinculadoPorId: "user-3",
    });
  });

  it("o grupo é opcional e, quando vem, é gravado junto", async () => {
    const ctx = montar();

    await ctx.service.vincular(PROJETO, { admissaoId: ADMISSAO, grupoId: GRUPO }, USER);

    expect(ctx.escritas[0].valores).toMatchObject({ grupoId: GRUPO });
  });

  it("recusa admissão de OUTRO cliente", async () => {
    const ctx = montar({ admissao: { id: ADMISSAO, codCliente: "999" } });

    const err = await ctx.service
      .vincular(PROJETO, { admissaoId: ADMISSAO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("outro cliente");
    expect(ctx.escritas).toEqual([]);
  });

  it("recusa projeto INATIVO, e a mensagem diz o caminho (reativar)", async () => {
    const ctx = montar({ projeto: { ...PROJETO_OK, ativo: false } });

    const err = await ctx.service
      .vincular(PROJETO, { admissaoId: ADMISSAO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("Reative");
    expect(ctx.escritas).toEqual([]);
  });

  it("recusa grupo de OUTRO projeto", async () => {
    const ctx = montar({ grupo: { id: GRUPO, projetoId: PROJETO_OUTRO } });

    const err = await ctx.service
      .vincular(PROJETO, { admissaoId: ADMISSAO, grupoId: GRUPO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("não pertence a este projeto");
    expect(ctx.escritas).toEqual([]);
  });

  /**
   * O CASO QUE O UNIQUE DO BANCO JÁ PEGARIA. O teste existe pela MENSAGEM: sem ele o time levaria um
   * erro de constraint sem saber que o caminho é desvincular ou trocar.
   */
  it("recusa admissão que já está em OUTRO projeto, oferecendo o caminho", async () => {
    const ctx = montar({ vinculoDaAdmissao: { id: VINCULO, projetoId: PROJETO_OUTRO } });

    const err = await ctx.service
      .vincular(PROJETO, { admissaoId: ADMISSAO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(String((err as Error).message)).toContain("já está em outro projeto");
    expect(ctx.escritas).toEqual([]);
  });

  it("recusa admissão que já está NESTE projeto", async () => {
    const ctx = montar({ vinculoDaAdmissao: { id: VINCULO, projetoId: PROJETO } });

    const err = await ctx.service
      .vincular(PROJETO, { admissaoId: ADMISSAO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(String((err as Error).message)).toContain("já está neste projeto");
  });

  it("recusa projeto inexistente", async () => {
    const ctx = montar({ projeto: null });

    const err = await ctx.service
      .vincular(PROJETO, { admissaoId: ADMISSAO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(NotFoundException);
  });

  it("recusa admissão inexistente", async () => {
    const ctx = montar({ admissao: null });

    const err = await ctx.service
      .vincular(PROJETO, { admissaoId: ADMISSAO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(NotFoundException);
  });
});

// ── ADICIONAR VÁRIAS DE UMA VEZ ─────────────────────────────────────────────

describe("adicionar em lote", () => {
  const A1 = "aaaaaaaa-1111-4111-8111-111111111111";
  const A2 = "aaaaaaaa-2222-4222-8222-222222222222";
  const A3 = "aaaaaaaa-3333-4333-8333-333333333333";

  /** Fake por admissão: o lote lê uma a uma, então o cenário precisa responder por id. */
  function montarLote(porAdmissao: Record<string, Row | null>, vinculoPorAdmissao: Record<string, Row> = {}) {
    const ctx = montar();
    // O id vem do PARÂMETRO da condição `eq(...)`. Os chunks de texto do SQL entram como array,
    // então o primeiro parâmetro que é string é o uuid procurado.
    const idDe = (where: unknown) =>
      parametros(where).find((v) => typeof v === "string") as string;
    ctx.db.query.admissoes.findFirst = vi.fn(async (args: { where?: unknown }) => {
      return porAdmissao[idDe(args?.where)] ?? null;
    }) as never;
    ctx.db.query.admissaoProjeto.findFirst = vi.fn(async (args: { where?: unknown }) => {
      return vinculoPorAdmissao[idDe(args?.where)] ?? null;
    }) as never;
    return ctx;
  }

  const OK = (id: string): Row => ({ id, codCliente: "100" });

  it("grava UM insert com todas as aprovadas, origem CORRECAO", async () => {
    const ctx = montarLote({ [A1]: OK(A1), [A2]: OK(A2), [A3]: OK(A3) });

    const r = await ctx.service.vincularEmLote(PROJETO, { admissaoIds: [A1, A2, A3] }, USER);

    expect(r).toEqual({ adicionadas: 3, falhas: [] });
    expect(ctx.escritas).toHaveLength(1);
    const linhas = ctx.escritas[0].valores as unknown as Row[];
    expect(linhas.map((l) => l.admissaoId)).toEqual([A1, A2, A3]);
    for (const l of linhas) {
      expect(l).toMatchObject({ projetoId: PROJETO, origem: "CORRECAO", vinculadoPorId: "user-3" });
    }
  });

  it("o grupo escolhido vale para TODAS, como no individual", async () => {
    const ctx = montarLote({ [A1]: OK(A1), [A2]: OK(A2) });

    await ctx.service.vincularEmLote(PROJETO, { admissaoIds: [A1, A2], grupoId: GRUPO }, USER);

    const linhas = ctx.escritas[0].valores as unknown as Row[];
    for (const l of linhas) expect(l).toMatchObject({ grupoId: GRUPO });
  });

  /** O caso real: uma pessoa errada no meio de cem não pode derrubar as outras noventa e nove. */
  it("uma admissão ruim vira FALHA e as demais entram", async () => {
    const ctx = montarLote({ [A1]: OK(A1), [A2]: { id: A2, codCliente: "999" }, [A3]: null });

    const r = await ctx.service.vincularEmLote(PROJETO, { admissaoIds: [A1, A2, A3] }, USER);

    expect(r.adicionadas).toBe(1);
    expect(r.falhas).toHaveLength(2);
    expect(r.falhas[0]).toMatchObject({ admissaoId: A2 });
    expect(String(r.falhas[0].motivo)).toContain("outro cliente");
    expect(String(r.falhas[1].motivo)).toContain("não encontrada");
  });

  it("quem já está em outro projeto vira falha, não vínculo por cima", async () => {
    const ctx = montarLote({ [A1]: OK(A1) }, { [A1]: { id: VINCULO, projetoId: PROJETO_OUTRO } });

    const r = await ctx.service.vincularEmLote(PROJETO, { admissaoIds: [A1] }, USER);

    expect(r.adicionadas).toBe(0);
    expect(String(r.falhas[0].motivo)).toContain("já está em outro projeto");
    expect(ctx.escritas).toEqual([]);
  });

  it("id repetido no mesmo pedido entra UMA vez (clique duplo não derruba o lote)", async () => {
    const ctx = montarLote({ [A1]: OK(A1) });

    const r = await ctx.service.vincularEmLote(PROJETO, { admissaoIds: [A1, A1, A1] }, USER);

    expect(r.adicionadas).toBe(1);
    expect((ctx.escritas[0].valores as unknown as Row[]).length).toBe(1);
  });

  it("nenhuma aprovada NÃO grava nada", async () => {
    const ctx = montarLote({ [A1]: null });

    const r = await ctx.service.vincularEmLote(PROJETO, { admissaoIds: [A1] }, USER);

    expect(r.adicionadas).toBe(0);
    expect(ctx.escritas).toEqual([]);
  });

  it("projeto inativo barra o lote inteiro antes de ler admissão nenhuma", async () => {
    const ctx = montar({ projeto: { ...PROJETO_OK, ativo: false } });

    const err = await ctx.service
      .vincularEmLote(PROJETO, { admissaoIds: [A1, A2] }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(ctx.escritas).toEqual([]);
    expect(ctx.db.query.admissoes.findFirst).not.toHaveBeenCalled();
  });

  it("grupo de outro projeto barra o lote inteiro", async () => {
    const ctx = montar({ grupo: { id: GRUPO, projetoId: PROJETO_OUTRO } });

    const err = await ctx.service
      .vincularEmLote(PROJETO, { admissaoIds: [A1], grupoId: GRUPO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(ctx.escritas).toEqual([]);
  });
});

// ── TROCAR de projeto e de grupo ────────────────────────────────────────────

describe("trocar o vínculo de projeto ou de grupo", () => {
  it("troca de projeto por UPDATE, sem passar por um estado desvinculado", async () => {
    const ctx = montar({
      vinculo: VINCULO_OK,
      projetoDestino: { ...PROJETO_OK, id: PROJETO_OUTRO },
    });

    await ctx.service.atualizarVinculo(VINCULO, { projetoId: PROJETO_OUTRO }, USER);

    expect(ctx.escritas.map((e) => e.verbo)).toEqual(["update"]);
    expect(ctx.escritas[0].valores).toMatchObject({
      projetoId: PROJETO_OUTRO,
      origem: "CORRECAO",
      vinculadoPorId: "user-3",
    });
  });

  it("trocar de PROJETO limpa o grupo: grupo é do projeto antigo", async () => {
    const ctx = montar({
      vinculo: { ...VINCULO_OK, grupoId: GRUPO },
      projetoDestino: { ...PROJETO_OK, id: PROJETO_OUTRO },
    });

    await ctx.service.atualizarVinculo(VINCULO, { projetoId: PROJETO_OUTRO }, USER);

    expect(ctx.escritas[0].valores).toMatchObject({ grupoId: null });
  });

  it("trocar só o GRUPO mantém o projeto", async () => {
    const ctx = montar({ vinculo: VINCULO_OK });

    await ctx.service.atualizarVinculo(VINCULO, { grupoId: GRUPO }, USER);

    expect(ctx.escritas[0].valores).toMatchObject({ projetoId: PROJETO, grupoId: GRUPO });
  });

  /** `null` explícito é o desfazer do grupo escolhido por engano (o campo ausente não mexe nele). */
  it("grupoId null tira do grupo e devolve à cota do projeto inteiro", async () => {
    const ctx = montar({ vinculo: { ...VINCULO_OK, grupoId: GRUPO } });

    await ctx.service.atualizarVinculo(VINCULO, { grupoId: null }, USER);

    expect(ctx.escritas[0].valores).toMatchObject({ projetoId: PROJETO, grupoId: null });
  });

  it("recusa projeto de destino de OUTRO cliente", async () => {
    const ctx = montar({
      vinculo: VINCULO_OK,
      projetoDestino: { ...PROJETO_OK, id: PROJETO_OUTRO, codCliente: "999" },
    });

    const err = await ctx.service
      .atualizarVinculo(VINCULO, { projetoId: PROJETO_OUTRO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("outro cliente");
    expect(ctx.escritas).toEqual([]);
  });

  it("recusa projeto de destino INATIVO", async () => {
    const ctx = montar({
      vinculo: VINCULO_OK,
      projetoDestino: { ...PROJETO_OK, id: PROJETO_OUTRO, ativo: false },
    });

    const err = await ctx.service
      .atualizarVinculo(VINCULO, { projetoId: PROJETO_OUTRO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(ctx.escritas).toEqual([]);
  });

  it("recusa grupo que não é do projeto de destino", async () => {
    const ctx = montar({ vinculo: VINCULO_OK, grupo: { id: GRUPO, projetoId: PROJETO_OUTRO } });

    const err = await ctx.service
      .atualizarVinculo(VINCULO, { grupoId: GRUPO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(ctx.escritas).toEqual([]);
  });

  it("recusa troca que não muda nada, em vez de gravar trilha falsa", async () => {
    const ctx = montar({ vinculo: VINCULO_OK });

    const err = await ctx.service
      .atualizarVinculo(VINCULO, { projetoId: PROJETO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("Nada mudou");
    expect(ctx.escritas).toEqual([]);
  });

  it("recusa vínculo inexistente", async () => {
    const ctx = montar({ vinculo: null });

    const err = await ctx.service
      .atualizarVinculo(VINCULO, { projetoId: PROJETO_OUTRO }, USER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(NotFoundException);
  });
});

// ── DESVINCULAR ─────────────────────────────────────────────────────────────

describe("desvincular", () => {
  it("apaga UMA linha e não escreve em mais nada (§A.26)", async () => {
    const ctx = montar();

    const r = await ctx.service.desvincular(VINCULO);

    expect(r).toEqual({ ok: true });
    expect(ctx.escritas.map((e) => e.verbo)).toEqual(["delete"]);
    // A admissão não é tocada: nenhum update saiu daqui.
    expect(ctx.escritas.some((e) => e.verbo === "update")).toBe(false);
  });

  it("vínculo inexistente é 404, não um ok silencioso", async () => {
    const ctx = montar({ vinculo: null });

    const err = await ctx.service.desvincular(VINCULO).catch((e: Error) => e);

    expect(err).toBeInstanceOf(NotFoundException);
  });
});

// ── ÓRFÃOS (o join do preenchimento, negado) ────────────────────────────────

describe("lista de órfãos", () => {
  it("consulta pelo cliente e pelo PERÍODO do projeto", async () => {
    const ctx = montar({ linhas: [{ admissaoId: ADMISSAO, candidatoNome: "Fulano" }] });

    const linhas = await ctx.service.listarOrfaos(PROJETO);

    expect(linhas).toHaveLength(1);
    const p = parametros(ctx.wheres[0]);
    expect(p).toContain("100");
    expect(p).toContain("2026-09-01");
    expect(p).toContain("2026-09-30");
  });

  /**
   * §A.16 travada em teste: declínio não entra em fila operacional, "em nenhuma superfície", e a
   * lista de órfãos é fila de trabalho. Pré-admissão (em espera ou recusada) também fica fora.
   */
  it("exclui declínio, rescisão e pré-admissão da fila", async () => {
    const ctx = montar();

    await ctx.service.listarOrfaos(PROJETO);

    const p = parametros(ctx.wheres[0]);
    for (const farol of ["DECLINOU", "RESCISAO", "AGUARDANDO_LIBERACAO", "LIBERACAO_RECUSADA"]) {
      expect(p, farol).toContain(farol);
    }
  });

  it("projeto inexistente é 404 antes de qualquer consulta", async () => {
    const ctx = montar({ projeto: null });

    const err = await ctx.service.listarOrfaos(PROJETO).catch((e: Error) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    expect(ctx.db.select).not.toHaveBeenCalled();
  });

  it("a leitura NÃO escreve nada", async () => {
    const ctx = montar();

    await ctx.service.listarOrfaos(PROJETO);
    await ctx.service.listarVinculos(PROJETO);

    expect(ctx.escritas).toEqual([]);
  });
});

// ── DTOs ────────────────────────────────────────────────────────────────────

describe("DTOs dos vínculos", () => {
  it("vincular exige uuid de admissão", () => {
    expect(
      validateSync(plainToInstance(VincularAdmissaoDto, { admissaoId: ADMISSAO }), {
        whitelist: true,
      }),
    ).toHaveLength(0);
    expect(
      validateSync(plainToInstance(VincularAdmissaoDto, { admissaoId: "a1" }), { whitelist: true })
        .length,
    ).toBeGreaterThan(0);
  });

  it("atualizar aceita null no grupo (o desfazer) e recusa lixo", () => {
    const limpar = plainToInstance(AtualizarVinculoDto, { grupoId: null });
    expect(validateSync(limpar, { whitelist: true })).toHaveLength(0);
    expect(limpar.grupoId).toBeNull();

    const lixo = plainToInstance(AtualizarVinculoDto, { grupoId: "grupo-1" });
    expect(validateSync(lixo, { whitelist: true }).length).toBeGreaterThan(0);
  });

  it("lote exige pelo menos uma admissão e recusa id que não é uuid", () => {
    expect(
      validateSync(plainToInstance(VincularEmLoteDto, { admissaoIds: [ADMISSAO] }), {
        whitelist: true,
      }),
    ).toHaveLength(0);
    expect(
      validateSync(plainToInstance(VincularEmLoteDto, { admissaoIds: [] }), { whitelist: true })
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(plainToInstance(VincularEmLoteDto, { admissaoIds: ["a1"] }), { whitelist: true })
        .length,
    ).toBeGreaterThan(0);
  });

  it("atualizar sem campo nenhum é válido no DTO: quem barra é o serviço", () => {
    expect(validateSync(plainToInstance(AtualizarVinculoDto, {}), { whitelist: true })).toHaveLength(
      0,
    );
  });
});
