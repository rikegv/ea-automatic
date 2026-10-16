import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { GruposClienteService } from "./grupos-cliente.service";
import { DefinirMetaCargoDto } from "./grupos-cliente.dto";
import { grupoClienteCargoMeta, gruposCliente } from "../../db/schema";

/**
 * AJUSTE 5: "VAGAS POR CARGO" no Alto Volume por grupo. Testes ADVERSARIAIS, por um autor que NÃO
 * escreveu o código. O que cada bloco tenta provar errado:
 *
 * - porCargo: `vagas`/`faltam` sempre presentes, meta vira `vagas`, `faltam = vagas - naEsteira`,
 *   e o cargo COM meta mas SEM admissão aparece mesmo assim (ponto 2 do contrato, o mais fácil de
 *   sumir numa agregação por admissão).
 * - totais.meta: SOMA das metas por cargo quando há alguma; senão o legado; senão nulo (ponto 3).
 * - definirMetaCargo: `null` apaga, `>=1` faz upsert, o total único do grupo acompanha a SOMA, e a
 *   remoção da ÚLTIMA meta NÃO derruba `grupos_cliente.meta` (ponto 4, o segundo foco).
 * - listarMetasCargo e o DTO (pontos 5 e 6).
 */

const GRUPO = "11111111-1111-4111-8111-111111111111";
const CARGO_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARGO_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARGO_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * FAKE DB para `analise` e `listarMetasCargo`. Mesma régua de resolução do spec vizinho: cada
 * `select()` é um builder chainable e thenable; a linha canned sai da PRESENÇA das colunas.
 * - TOTAL: sem `cargoId`.
 * - POR CARGO (admissões): `cargoId` + `naEsteira`.
 * - META POR CARGO: `cargoId` + `meta`, sem `naEsteira` (serve `analise.metasCargo` e `listarMetasCargo`).
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
function fakeDbLeitura(opts: {
  grupo: unknown;
  totais?: Record<string, number> | null;
  porCargo?: Record<string, unknown>[];
  metasCargo?: Record<string, unknown>[];
}) {
  const select = vi.fn((cols: Record<string, unknown> | undefined) => {
    const temCargoId = Boolean(cols && "cargoId" in cols);
    const ehMetasCargo =
      temCargoId && Boolean(cols && "meta" in cols) && !(cols && "naEsteira" in cols);
    const ehPorCargo = temCargoId && Boolean(cols && "naEsteira" in cols);
    const resultado = ehMetasCargo
      ? (opts.metasCargo ?? [])
      : ehPorCargo
        ? (opts.porCargo ?? [])
        : opts.totais
          ? [opts.totais]
          : [];
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.groupBy = () => b;
    b.orderBy = () => b;
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(resolve, reject);
    return b;
  });
  const db = {
    select,
    query: { gruposCliente: { findFirst: vi.fn().mockResolvedValue(opts.grupo) } },
  };
  return { db, select };
}

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * FAKE DB para `definirMetaCargo`. Captura delete/insert/update e deixa `somaMetasCargo`
 * (select com colunas `soma`/`qtd`) devolver o estado configurado APÓS a escrita.
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
interface EscritaMeta {
  op: "delete" | "insert" | "update";
  tabela: unknown;
  valores?: Record<string, unknown>;
  set?: Record<string, unknown>;
}
function fakeDbEscrita(opts: {
  grupo: unknown;
  cargo: unknown;
  /** O que `somaMetasCargo` enxerga DEPOIS do delete/upsert. */
  somaDepois: { soma: number | null; qtd: number };
}) {
  const escritas: EscritaMeta[] = [];
  const select = vi.fn((cols: Record<string, unknown> | undefined) => {
    const ehSoma = Boolean(cols && "soma" in cols && "qtd" in cols);
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.where = () => b;
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(ehSoma ? [opts.somaDepois] : []).then(resolve, reject);
    return b;
  });
  const db = {
    select,
    query: {
      gruposCliente: { findFirst: vi.fn().mockResolvedValue(opts.grupo) },
      cargos: { findFirst: vi.fn().mockResolvedValue(opts.cargo) },
    },
    delete: vi.fn((tabela: unknown) => ({
      where: async () => {
        escritas.push({ op: "delete", tabela });
        return undefined;
      },
    })),
    insert: vi.fn((tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => ({
        onConflictDoUpdate: async (cfg: { set?: Record<string, unknown> }) => {
          escritas.push({ op: "insert", tabela, valores, set: cfg?.set });
          return undefined;
        },
      }),
    })),
    update: vi.fn((tabela: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          escritas.push({ op: "update", tabela, set });
          return undefined;
        },
      }),
    })),
  };
  return { db, escritas };
}

/* ═══════════════════════════════ CONTRATO 1 + 2: porCargo ═══════════════════════════════ */
describe("analise(): porCargo carrega vagas/faltam e faz UNIÃO com as metas por cargo", () => {
  it("cargo COM meta mas SEM admissão aparece: vagas=meta, naEsteira=0, faltam=meta", async () => {
    // Ponto 2 do contrato: não basta somar à agregação de admissões; a linha nasce da meta.
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      totais: { naEsteira: 0, emBanco: 0, concluidas: 0, emAndamento: 0, pausadas: 0, declinios: 0 },
      porCargo: [], // ninguém na esteira
      metasCargo: [{ cargoId: CARGO_C, cargoNome: "Caixa", meta: 5 }],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);

    expect(r.porCargo).toHaveLength(1);
    expect(r.porCargo[0]).toMatchObject({
      cargoId: CARGO_C,
      cargoNome: "Caixa",
      vagas: 5,
      naEsteira: 0,
      faltam: 5,
      concluidas: 0,
      emAndamento: 0,
      pausadas: 0,
      declinios: 0,
    });
  });

  it("UNIÃO: cargo com meta+admissão, cargo só com admissão e cargo só com meta coexistem", async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      totais: { naEsteira: 5, emBanco: 0, concluidas: 0, emAndamento: 5, pausadas: 0, declinios: 0 },
      porCargo: [
        { cargoId: CARGO_A, cargoNome: "Atendente", naEsteira: 3, concluidas: 1, emAndamento: 2, pausadas: 0, declinios: 0 },
        { cargoId: CARGO_B, cargoNome: "Balconista", naEsteira: 2, concluidas: 0, emAndamento: 2, pausadas: 0, declinios: 0 },
      ],
      metasCargo: [
        { cargoId: CARGO_A, cargoNome: "Atendente", meta: 10 }, // tem admissão
        { cargoId: CARGO_C, cargoNome: "Caixa", meta: 4 }, // sem admissão
      ],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    const porId = new Map(r.porCargo.map((c) => [c.cargoId, c]));

    expect(r.porCargo).toHaveLength(3);
    // A: meta 10 contra 3 na esteira.
    expect(porId.get(CARGO_A)).toMatchObject({ vagas: 10, naEsteira: 3, faltam: 7 });
    // B: só admissão, sem meta => vagas/faltam nulos (nunca 0).
    expect(porId.get(CARGO_B)).toMatchObject({ vagas: null, naEsteira: 2, faltam: null });
    // C: só meta, sem admissão.
    expect(porId.get(CARGO_C)).toMatchObject({ vagas: 4, naEsteira: 0, faltam: 4 });
  });

  it("faltam é meta - naEsteira mesmo quando NEGATIVO (mais gente que meta), nunca clampa em 0", async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      totais: { naEsteira: 5, emBanco: 0, concluidas: 0, emAndamento: 5, pausadas: 0, declinios: 0 },
      porCargo: [
        { cargoId: CARGO_A, cargoNome: "Atendente", naEsteira: 5, concluidas: 0, emAndamento: 5, pausadas: 0, declinios: 0 },
      ],
      metasCargo: [{ cargoId: CARGO_A, cargoNome: "Atendente", meta: 2 }],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    expect(r.porCargo[0].faltam).toBe(-3); // 2 - 5
  });

  it('"Sem Cargo" (cargoId null) nunca recebe meta: vagas/faltam ficam nulos', async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      totais: { naEsteira: 4, emBanco: 0, concluidas: 0, emAndamento: 4, pausadas: 0, declinios: 0 },
      porCargo: [
        { cargoId: null, cargoNome: null, naEsteira: 4, concluidas: 0, emAndamento: 4, pausadas: 0, declinios: 0 },
      ],
      metasCargo: [{ cargoId: CARGO_A, cargoNome: "Atendente", meta: 9 }],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    const semCargo = r.porCargo.find((c) => c.cargoId === null);
    expect(semCargo).toBeTruthy();
    expect(semCargo!.cargoNome).toBe("Sem Cargo");
    expect(semCargo!.vagas).toBeNull();
    expect(semCargo!.faltam).toBeNull();
  });

  it('ordena alfabético e deixa "Sem Cargo" por último', async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      totais: { naEsteira: 0, emBanco: 0, concluidas: 0, emAndamento: 0, pausadas: 0, declinios: 0 },
      porCargo: [
        { cargoId: CARGO_B, cargoNome: "Zelador", naEsteira: 1, concluidas: 0, emAndamento: 1, pausadas: 0, declinios: 0 },
        { cargoId: null, cargoNome: null, naEsteira: 1, concluidas: 0, emAndamento: 1, pausadas: 0, declinios: 0 },
        { cargoId: CARGO_A, cargoNome: "Atendente", naEsteira: 1, concluidas: 0, emAndamento: 1, pausadas: 0, declinios: 0 },
      ],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    expect(r.porCargo.map((c) => c.cargoNome)).toEqual(["Atendente", "Zelador", "Sem Cargo"]);
  });
});

/* ═══════════════════════════════ CONTRATO 3: totais.meta é a SOMA ═══════════════════════════════ */
describe("analise(): totais.meta soma as metas por cargo, senão legado, senão nulo", () => {
  it("com metas por cargo, totais.meta é a SOMA (ignora o legado grupos_cliente.meta)", async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: 100 }, // legado deve ser ignorado
      totais: { naEsteira: 12, emBanco: 0, concluidas: 0, emAndamento: 12, pausadas: 0, declinios: 0 },
      porCargo: [],
      metasCargo: [
        { cargoId: CARGO_A, cargoNome: "Atendente", meta: 10 },
        { cargoId: CARGO_B, cargoNome: "Balconista", meta: 20 },
      ],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    expect(r.totais.meta).toBe(30);
    expect(r.grupo.meta).toBe(30);
    expect(r.totais.faltam).toBe(18); // 30 - 12
  });

  it("sem meta por cargo, cai no legado grupos_cliente.meta", async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: 50 },
      totais: { naEsteira: 20, emBanco: 0, concluidas: 0, emAndamento: 20, pausadas: 0, declinios: 0 },
      porCargo: [],
      metasCargo: [],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    expect(r.totais.meta).toBe(50);
    expect(r.totais.faltam).toBe(30);
  });

  it("sem meta nenhuma (nem por cargo, nem legado), meta e faltam nulos", async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      totais: { naEsteira: 7, emBanco: 0, concluidas: 0, emAndamento: 7, pausadas: 0, declinios: 0 },
      porCargo: [],
      metasCargo: [],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    expect(r.totais.meta).toBeNull();
    expect(r.totais.faltam).toBeNull();
  });

  it("grupo inexistente vira 404", async () => {
    const { db } = fakeDbLeitura({ grupo: undefined, totais: null });
    await expect(new GruposClienteService(db as never).analise(GRUPO)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/* ═══════════════════════════════ CONTRATO 4: definirMetaCargo ═══════════════════════════════ */
describe("definirMetaCargo(): upsert/remoção + sincronismo do total do grupo", () => {
  it("meta >= 1 faz UPSERT na (grupo, cargo) e NÃO apaga", async () => {
    const { db, escritas } = fakeDbEscrita({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      cargo: { id: CARGO_A, nome: "Atendente" },
      somaDepois: { soma: 10, qtd: 1 },
    });
    await new GruposClienteService(db as never).definirMetaCargo(GRUPO, CARGO_A, { meta: 10 });

    const ins = escritas.find((e) => e.op === "insert");
    expect(ins, "deve inserir/upsertar").toBeTruthy();
    expect(ins!.tabela).toBe(grupoClienteCargoMeta);
    expect(ins!.valores).toMatchObject({ grupoId: GRUPO, cargoId: CARGO_A, meta: 10 });
    expect(ins!.set).toMatchObject({ meta: 10 });
    expect(escritas.some((e) => e.op === "delete")).toBe(false);
  });

  it("após o upsert, grupos_cliente.meta é sincronizado com a SOMA das metas por cargo", async () => {
    const { db, escritas } = fakeDbEscrita({
      grupo: { id: GRUPO, nome: "CAGC", meta: 100 },
      cargo: { id: CARGO_A, nome: "Atendente" },
      somaDepois: { soma: 30, qtd: 2 },
    });
    const r = await new GruposClienteService(db as never).definirMetaCargo(GRUPO, CARGO_A, { meta: 20 });

    const upd = escritas.filter((e) => e.op === "update" && e.tabela === gruposCliente);
    expect(upd).toHaveLength(1);
    expect(upd[0].set).toMatchObject({ meta: 30 });
    expect(r.totalDoGrupo).toBe(30);
  });

  it("meta null APAGA a linha", async () => {
    const { db, escritas } = fakeDbEscrita({
      grupo: { id: GRUPO, nome: "CAGC", meta: 10 },
      cargo: { id: CARGO_A, nome: "Atendente" },
      somaDepois: { soma: null, qtd: 0 },
    });
    await new GruposClienteService(db as never).definirMetaCargo(GRUPO, CARGO_A, { meta: null });

    const del = escritas.find((e) => e.op === "delete");
    expect(del, "deve apagar").toBeTruthy();
    expect(del!.tabela).toBe(grupoClienteCargoMeta);
    expect(escritas.some((e) => e.op === "insert")).toBe(false);
  });

  it("remover a ÚLTIMA meta por cargo NÃO toca grupos_cliente.meta (não derruba para 0/nulo)", async () => {
    // Ponto 4, o segundo foco: somaMetasCargo devolve nulo (qtd=0) e o total único fica como estava.
    const { db, escritas } = fakeDbEscrita({
      grupo: { id: GRUPO, nome: "CAGC", meta: 10 },
      cargo: { id: CARGO_A, nome: "Atendente" },
      somaDepois: { soma: null, qtd: 0 },
    });
    const r = await new GruposClienteService(db as never).definirMetaCargo(GRUPO, CARGO_A, { meta: null });

    expect(escritas.some((e) => e.op === "delete")).toBe(true);
    expect(
      escritas.some((e) => e.op === "update" && e.tabela === gruposCliente),
      "grupos_cliente.meta NÃO pode ser atualizado ao remover a última meta",
    ).toBe(false);
    // O total devolvido cai no legado (o último valor), nunca nulo aqui.
    expect(r.totalDoGrupo).toBe(10);
  });

  it("remover UMA de várias metas sincroniza grupos_cliente.meta com a soma restante", async () => {
    const { db, escritas } = fakeDbEscrita({
      grupo: { id: GRUPO, nome: "CAGC", meta: 30 },
      cargo: { id: CARGO_B, nome: "Balconista" },
      somaDepois: { soma: 15, qtd: 2 },
    });
    const r = await new GruposClienteService(db as never).definirMetaCargo(GRUPO, CARGO_B, { meta: null });

    expect(escritas.some((e) => e.op === "delete")).toBe(true);
    const upd = escritas.filter((e) => e.op === "update" && e.tabela === gruposCliente);
    expect(upd).toHaveLength(1);
    expect(upd[0].set).toMatchObject({ meta: 15 });
    expect(r.totalDoGrupo).toBe(15);
  });

  it("grupo inexistente vira 404 (e não escreve nada)", async () => {
    const { db, escritas } = fakeDbEscrita({
      grupo: undefined,
      cargo: { id: CARGO_A, nome: "Atendente" },
      somaDepois: { soma: null, qtd: 0 },
    });
    await expect(
      new GruposClienteService(db as never).definirMetaCargo(GRUPO, CARGO_A, { meta: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(escritas).toHaveLength(0);
  });

  it("cargo inexistente vira 404 (e não escreve nada)", async () => {
    const { db, escritas } = fakeDbEscrita({
      grupo: { id: GRUPO, nome: "CAGC", meta: null },
      cargo: undefined,
      somaDepois: { soma: null, qtd: 0 },
    });
    await expect(
      new GruposClienteService(db as never).definirMetaCargo(GRUPO, CARGO_A, { meta: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(escritas).toHaveLength(0);
  });
});

/* ═══════════════════════════════ CONTRATO 5: listarMetasCargo ═══════════════════════════════ */
describe("listarMetasCargo()", () => {
  it("grupo inexistente vira 404", async () => {
    const { db } = fakeDbLeitura({ grupo: undefined });
    await expect(
      new GruposClienteService(db as never).listarMetasCargo(GRUPO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("devolve as metas por cargo do grupo com nome do cargo", async () => {
    const { db } = fakeDbLeitura({
      grupo: { id: GRUPO, nome: "CAGC", meta: 30 },
      metasCargo: [
        { cargoId: CARGO_A, cargoNome: "Atendente", meta: 10 },
        { cargoId: CARGO_B, cargoNome: "Balconista", meta: 20 },
      ],
    });
    const r = await new GruposClienteService(db as never).listarMetasCargo(GRUPO);
    expect(r).toEqual([
      { cargoId: CARGO_A, cargoNome: "Atendente", meta: 10 },
      { cargoId: CARGO_B, cargoNome: "Balconista", meta: 20 },
    ]);
  });
});

/* ═══════════════════════════════ CONTRATO 6: DefinirMetaCargoDto ═══════════════════════════════ */
describe("DefinirMetaCargoDto", () => {
  const validar = (entrada: unknown) =>
    validateSync(plainToInstance(DefinirMetaCargoDto, entrada), { whitelist: true });

  it("aceita {}, {meta:null} e {meta:>=1}", () => {
    expect(validar({})).toHaveLength(0);
    expect(validar({ meta: null })).toHaveLength(0);
    expect(validar({ meta: 1 })).toHaveLength(0);
    expect(validar({ meta: 164 })).toHaveLength(0);
  });

  it("recusa 0, negativo e não inteiro", () => {
    for (const meta of [0, -5, 3.5, "abc"]) {
      expect(validar({ meta }).some((e) => e.property === "meta"), `meta=${meta}`).toBe(true);
    }
  });
});
