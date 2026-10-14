import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { GruposClienteService } from "./grupos-cliente.service";
import { AtualizarGrupoClienteDto, CriarGrupoClienteDto } from "./grupos-cliente.dto";
import { gruposCliente } from "../../db/schema";

/**
 * META DO GRUPO + PAINEL POR GRUPO (Alto Volume por grupo, decisão do diretor).
 *
 * O QUE ESTES TESTES PROTEGEM. São os três jeitos de a frente errar em silêncio:
 * 1. A META DEIXAR DE SER OBRIGATÓRIA na criação (o diretor foi explícito: sem opção de "sem meta").
 * 2. `faltam` divergir de `meta - naEsteira`, ou `naEsteira` deixar de excluir os terminais.
 * 3. O GRUPO LEGADO (sem meta) quebrar em vez de devolver meta/faltam nulos.
 * 4. O declínio voltar para dentro de `naEsteira`, inflando o denominador.
 */

const GRUPO = "11111111-1111-4111-8111-111111111111";

/** DTO real, do jeito que o ValidationPipe global roda (transform + validate). */
function validarCriar(entrada: unknown) {
  const dto = plainToInstance(CriarGrupoClienteDto, entrada);
  return validateSync(dto, { whitelist: true });
}

function validarAtualizar(entrada: unknown) {
  const dto = plainToInstance(AtualizarGrupoClienteDto, entrada);
  return validateSync(dto, { whitelist: true });
}

/**
 * Banco falso para a análise: `findFirst` devolve o grupo, e cada `select()` é um builder chainable
 * E thenable. A consulta de `totais` (`.from().where()`) e a de `porCargo`
 * (`.from().leftJoin().where().groupBy().orderBy()`) convivem no mesmo fake; a resolução escolhe a
 * linha canned pela presença da coluna `cargoId` (só a de `porCargo` a tem). Captura os argumentos do
 * `select` para o teste que renderiza o SQL e prova o recorte de farol.
 */
function fakeDb(opts: {
  grupo: unknown;
  totais: Record<string, number> | null;
  porCargo?: Record<string, unknown>[];
}) {
  const select = vi.fn((cols: Record<string, unknown> | undefined) => {
    const ehPorCargo = Boolean(cols && "cargoId" in cols);
    const resultado = ehPorCargo ? (opts.porCargo ?? []) : opts.totais ? [opts.totais] : [];
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    b.groupBy = () => b;
    b.orderBy = () => b;
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(resolve, reject);
    return b;
  });
  const db = {
    select,
    query: {
      gruposCliente: { findFirst: vi.fn().mockResolvedValue(opts.grupo) },
    },
  };
  return { db, select };
}

describe("CriarGrupoClienteDto: a meta é OBRIGATÓRIA", () => {
  it("recusa quando a meta não vem", () => {
    const erros = validarCriar({ nome: "CAGC Corifeu" });
    expect(erros.some((e) => e.property === "meta")).toBe(true);
  });

  it("recusa meta zero, negativa ou não inteira", () => {
    for (const meta of [0, -5, 3.5, "abc"]) {
      const erros = validarCriar({ nome: "CAGC Corifeu", meta });
      expect(erros.some((e) => e.property === "meta"), `meta=${meta}`).toBe(true);
    }
  });

  it("aceita meta inteira >= 1", () => {
    const erros = validarCriar({ nome: "CAGC Corifeu", meta: 164 });
    expect(erros).toHaveLength(0);
  });
});

describe("AtualizarGrupoClienteDto: a meta é OPCIONAL, mas válida quando vem", () => {
  it("aceita patch sem meta (edição parcial)", () => {
    expect(validarAtualizar({ nome: "Novo nome" })).toHaveLength(0);
  });

  it("recusa meta zero/negativa quando presente", () => {
    expect(validarAtualizar({ meta: 0 }).some((e) => e.property === "meta")).toBe(true);
    expect(validarAtualizar({ meta: -1 }).some((e) => e.property === "meta")).toBe(true);
  });

  it("aceita meta válida", () => {
    expect(validarAtualizar({ meta: 10 })).toHaveLength(0);
  });
});

describe("criar(): persiste a meta", () => {
  it("grava nome, descrição e meta", async () => {
    let gravado: Record<string, unknown> | undefined;
    const insert = vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        gravado = v;
        return { returning: async () => [{ id: GRUPO, ...v }] };
      },
    }));
    const svc = new GruposClienteService({
      insert,
      // `exigirNomeLivre` consulta os grupos existentes; sem colisão aqui.
      select: vi.fn(() => ({ from: () => Promise.resolve([]) })),
    } as never);

    const row = await svc.criar({ nome: "CAGC Corifeu", meta: 164 });
    expect(gravado?.meta).toBe(164);
    expect(row.meta).toBe(164);
  });
});

describe("analise(): meta contra o que o grupo tem na esteira", () => {
  it("faltam = meta - naEsteira, naEsteira exclui banco, e ativos = naEsteira", async () => {
    const { db } = fakeDb({
      grupo: { id: GRUPO, nome: "CAGC Corifeu", meta: 200 },
      totais: {
        // naEsteira já exclui o banco (os três fora), igual ao `vinculadas` do projeto.
        naEsteira: 164,
        emBanco: 14,
        concluidas: 120,
        emAndamento: 30,
        pausadas: 4,
        declinios: 23,
      },
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);

    expect(r.grupo).toEqual({ id: GRUPO, nome: "CAGC Corifeu", meta: 200 });
    expect(r.totais.meta).toBe(200);
    expect(r.totais.naEsteira).toBe(164);
    expect(r.totais.faltam).toBe(36); // 200 - 164
    // ativos é IGUAL a naEsteira por construção (os dois excluem banco).
    expect(r.totais.ativos).toBe(164);
    expect(r.totais.emBanco).toBe(14);
    expect(r.totais.concluidas).toBe(120);
    expect(r.totais.emAndamento).toBe(30);
    expect(r.totais.pausadas).toBe(4);
    // Declínio é informação ao lado, NÃO entra em naEsteira nem no faltam.
    expect(r.totais.declinios).toBe(23);
  });

  it("grupo SEM meta (legado) devolve meta e faltam NULOS, sem quebrar", async () => {
    const { db } = fakeDb({
      grupo: { id: GRUPO, nome: "CAGC (legado)", meta: null },
      totais: { naEsteira: 50, emBanco: 0, concluidas: 40, emAndamento: 10, pausadas: 0, declinios: 5 },
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);

    expect(r.grupo.meta).toBeNull();
    expect(r.totais.meta).toBeNull();
    expect(r.totais.faltam).toBeNull();
    // O resto continua contando normalmente.
    expect(r.totais.naEsteira).toBe(50);
    expect(r.totais.declinios).toBe(5);
  });

  it("grupo inexistente vira 404", async () => {
    const { db } = fakeDb({ grupo: undefined, totais: null });
    await expect(new GruposClienteService(db as never).analise(GRUPO)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /**
   * A REGRA NA ORIGEM, não só na aritmética: a fixture acima recebe `naEsteira` pronto, então quem
   * garante o recorte é o FILTRO da consulta. Este teste lê o SQL que o serviço monta e exige a MESMA
   * régua do dash de projeto: `naEsteira` exclui os TRÊS (terminais + banco), `concluidas` carrega o
   * mesmo filtro de farol (para não passar de "na esteira"), e `declinios` são os terminais.
   */
  it("o SQL de naEsteira e concluidas exclui DECLINOU/RESCISAO/BANCO_AGUARDAR; declínios são os terminais", async () => {
    const { db, select } = fakeDb({
      grupo: { id: GRUPO, nome: "CAGC Corifeu", meta: 10 },
      totais: { naEsteira: 0, emBanco: 0, concluidas: 0, emAndamento: 0, pausadas: 0, declinios: 0 },
    });
    await new GruposClienteService(db as never).analise(GRUPO);

    const render = (expr: unknown) => new PgDialect().sqlToQuery(expr as never).sql.replace(/\s+/g, " ");
    const chamadas = select.mock.calls as unknown as unknown[][];
    const cols = chamadas
      .map((c) => c[0] as Record<string, unknown> | undefined)
      .find((s) => Boolean(s && "naEsteira" in s));
    expect(cols, "a consulta de contagem tem de existir").toBeTruthy();

    const naEsteira = render(cols!.naEsteira);
    const concluidas = render(cols!.concluidas);
    const declinios = render(cols!.declinios);

    // naEsteira e concluidas excluem os TRÊS, igual ao `vinculadas`/`concluidas` do projeto.
    for (const fora of ["DECLINOU", "RESCISAO", "BANCO_AGUARDAR"]) {
      expect(naEsteira, `${fora} não conta como na esteira`).toContain(fora);
      expect(concluidas, `${fora} não conta como concluída`).toContain(fora);
    }
    // declínios são exatamente os terminais.
    expect(declinios).toContain("DECLINOU");
    expect(declinios).toContain("RESCISAO");
  });
});

/**
 * PORCARGO: a mesma análise quebrada por cargo. Protege quatro coisas:
 * 1. agrega por cargo e mapeia cargoId null para "Sem Cargo";
 * 2. NÃO traz `vagas` nem `faltam` (não há meta por cargo, de propósito);
 * 3. o SQL de naEsteira/concluidas/declinios por cargo carrega a MESMA régua de farol do totais;
 * 4. grupo sem admissões devolve `porCargo` vazio.
 */
describe("analise(): porCargo", () => {
  const CARGO_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("agrega por cargo, mapeia null para Sem Cargo e NÃO traz vagas/faltam", async () => {
    const { db } = fakeDb({
      grupo: { id: GRUPO, nome: "CAGC Corifeu", meta: 200 },
      totais: { naEsteira: 164, emBanco: 14, concluidas: 120, emAndamento: 30, pausadas: 4, declinios: 23 },
      porCargo: [
        { cargoId: CARGO_A, cargoNome: "Atendente", naEsteira: 100, concluidas: 80, emAndamento: 18, pausadas: 2, declinios: 10 },
        { cargoId: null, cargoNome: null, naEsteira: 64, concluidas: 40, emAndamento: 12, pausadas: 2, declinios: 13 },
      ],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);

    expect(r.porCargo).toHaveLength(2);
    expect(r.porCargo[0]).toEqual({
      cargoId: CARGO_A,
      cargoNome: "Atendente",
      naEsteira: 100,
      concluidas: 80,
      emAndamento: 18,
      pausadas: 2,
      declinios: 10,
    });
    // cargoId null vira "Sem Cargo".
    expect(r.porCargo[1].cargoId).toBeNull();
    expect(r.porCargo[1].cargoNome).toBe("Sem Cargo");
    expect(r.porCargo[1].naEsteira).toBe(64);
    // NÃO há meta por cargo: nenhum item carrega vagas nem faltam.
    for (const item of r.porCargo) {
      expect(item).not.toHaveProperty("vagas");
      expect(item).not.toHaveProperty("faltam");
    }
  });

  it("o SQL por cargo exclui DECLINOU/RESCISAO/BANCO_AGUARDAR em naEsteira/concluidas, e declínios são os terminais", async () => {
    const { db, select } = fakeDb({
      grupo: { id: GRUPO, nome: "CAGC Corifeu", meta: 10 },
      totais: { naEsteira: 0, emBanco: 0, concluidas: 0, emAndamento: 0, pausadas: 0, declinios: 0 },
      porCargo: [],
    });
    await new GruposClienteService(db as never).analise(GRUPO);

    const render = (expr: unknown) => new PgDialect().sqlToQuery(expr as never).sql.replace(/\s+/g, " ");
    const chamadas = select.mock.calls as unknown as unknown[][];
    // A consulta por cargo é a que tem a coluna cargoId.
    const cols = chamadas
      .map((c) => c[0] as Record<string, unknown> | undefined)
      .find((s) => Boolean(s && "cargoId" in s));
    expect(cols, "a consulta por cargo tem de existir").toBeTruthy();

    const naEsteira = render(cols!.naEsteira);
    const concluidas = render(cols!.concluidas);
    const declinios = render(cols!.declinios);

    for (const fora of ["DECLINOU", "RESCISAO", "BANCO_AGUARDAR"]) {
      expect(naEsteira, `${fora} não conta como na esteira`).toContain(fora);
      expect(concluidas, `${fora} não conta como concluída`).toContain(fora);
    }
    expect(declinios).toContain("DECLINOU");
    expect(declinios).toContain("RESCISAO");
  });

  it("grupo sem admissões devolve porCargo vazio", async () => {
    const { db } = fakeDb({
      grupo: { id: GRUPO, nome: "CAGC Corifeu", meta: 10 },
      totais: { naEsteira: 0, emBanco: 0, concluidas: 0, emAndamento: 0, pausadas: 0, declinios: 0 },
      porCargo: [],
    });
    const r = await new GruposClienteService(db as never).analise(GRUPO);
    expect(r.porCargo).toEqual([]);
  });
});

// Mantém `gruposCliente` referenciado para o leitor saber qual tabela estes testes exercem.
void gruposCliente;
