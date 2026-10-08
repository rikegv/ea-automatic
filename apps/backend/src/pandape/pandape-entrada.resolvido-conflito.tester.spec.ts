import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pandapeEntrada } from "../db/schema";

/**
 * ─ O CONFLITO DO `registrarDesfecho` NÃO PODE CARIMBAR `resolvido_em` COM UMA DATA CRUA ─────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita por quem NÃO escreveu o conserto, a partir do requisito.
 *
 * ┌─ O DEFEITO, medido ──────────────────────────────────────────────────────────────────────────┐
 * │ `PandapeEntradaService.registrarDesfecho` faz um upsert. No caminho de ENCERRAMENTO (desfecho  │
 * │ que encerra, ex.: PRE_ADMISSAO) sobre uma linha que JÁ EXISTIA (conflito), o `set` do          │
 * │ `onConflictDoUpdate` carimbava `resolvido_em` com `coalesce("resolvido_em", ${agora})`, onde   │
 * │ `agora` é um `new Date()` INTERPOLADO num template `sql`. Fora de uma coluna, drizzle NÃO      │
 * │ aplica o encoder da coluna timestamp: a Date vai CRUA como parâmetro, e no caminho do UPDATE   │
 * │ o postgres-js estoura                                                                          │
 * │   `The "string" argument must be of type string ... Received an instance of Date`.             │
 * │ O conserto troca a Date interpolada por `now()` (SQL puro, sem parâmetro).                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE ESTE TESTE OLHA O SQL, E NÃO USA BANCO ──────────────────────────────────────────────
 * O padrão deste repositório para defeito de MONTAGEM de query é `admin/regua/regua-on-conflict.spec.ts`:
 * a query é construída de verdade (mesmo builder do serviço) e o SQL/params são inspecionados, SEM
 * conexão nenhuma (a string é um host inalcançável). Banco falso de serviço jamais pegaria isto, e a
 * suíte não tem harness de banco vivo. A prova RUNTIME do estouro (e das semânticas (c)/(d) do
 * requisito) vive no spec irmão `pandape-entrada.registrar-desfecho.integra.spec.ts`, atrás de
 * `DATABASE_URL`.
 *
 * A ASSINATURA DO DEFEITO, medida: no `.toSQL()` do statement do serviço, as datas de COLUNA
 * (`ultima_tentativa_em`, `atualizado_em`) são mapeadas para STRING ISO pelo encoder da coluna, então
 * um parâmetro `instanceof Date` na lista só pode ter vindo da Date CRUA interpolada no `sql` do
 * `resolvido_em`. Logo: zero parâmetro `Date` = conserto; um parâmetro `Date` = defeito.
 *
 * §A.6: nada de CPF, nome ou e-mail. Os ids são de SISTEMA e de ficção.
 */

// Host inalcançável de propósito: nada aqui conecta, só montamos o SQL (igual ao regua-on-conflict).
const db = drizzle(postgres("postgres://ninguem@127.0.0.1:1/nada", { max: 1 }));

/**
 * O MESMO statement que `PandapeEntradaService.registrarDesfecho` monta no caminho de conflito, com o
 * `set` espelhado linha a linha. O único ponto que varia é a expressão do `resolvido_em` do ramo
 * `encerra`, que é exatamente o que o conserto mexeu, então é o que este teste parametriza.
 *
 * MANTENHA EM SINCRONIA com `pandape-entrada.service.ts` (mesmo contrato do regua-on-conflict): se o
 * `set` do serviço mudar, espelhe aqui. A prova de que o SERVIÇO de verdade executa sem estourar está
 * no spec de integração irmão.
 */
function statementDeConflito(resolvidoEmEncerra: unknown) {
  const agora = new Date();
  return db
    .insert(pandapeEntrada)
    .values({
      idPrecollaborator: "PC-FICCAO-1",
      idMatch: null,
      idVacancy: null,
      origem: "MANUAL",
      desfecho: "PRE_ADMISSAO",
      motivo: null,
      admissaoId: null,
      tentativas: 1,
      ultimaTentativaEm: agora,
      ultimoEventoEm: agora,
      resolvidoEm: agora,
    })
    .onConflictDoUpdate({
      target: pandapeEntrada.idPrecollaborator,
      set: {
        desfecho: sql`case when ${pandapeEntrada.resolvidoEm} is null then excluded.desfecho else ${pandapeEntrada.desfecho} end`,
        motivo: sql`case when ${pandapeEntrada.resolvidoEm} is null then excluded.motivo else ${pandapeEntrada.motivo} end`,
        admissaoId: sql`coalesce(excluded.admissao_id, ${pandapeEntrada.admissaoId})`,
        idMatch: sql`coalesce(excluded.id_match, ${pandapeEntrada.idMatch})`,
        idVacancy: sql`coalesce(excluded.id_vacancy, ${pandapeEntrada.idVacancy})`,
        tentativas: sql`${pandapeEntrada.tentativas} + 1`,
        ultimaTentativaEm: agora,
        resolvidoEm: resolvidoEmEncerra as never,
        atualizadoEm: agora,
      },
    })
    .toSQL();
}

/** Quantos parâmetros ligados são uma Date CRUA (a marca do defeito). */
function datasCruas(built: { params: unknown[] }): number {
  return built.params.filter((p) => p instanceof Date).length;
}

describe("registrarDesfecho: carimbo de resolvido_em no caminho de conflito", () => {
  /**
   * O CONSERTO. `now()` é SQL puro, não vira parâmetro: o statement inteiro do serviço não liga
   * NENHUMA Date crua, porque as datas de coluna já saem como string ISO pelo encoder.
   */
  it("com now(): ZERO Date crua nos parâmetros (o carimbo não estoura no conflito)", () => {
    const built = statementDeConflito(sql`coalesce(${pandapeEntrada.resolvidoEm}, now())`);
    expect(datasCruas(built)).toBe(0);
    // Todos os parâmetros restantes são tipos que o driver serializa sem reclamar.
    for (const p of built.params) expect(p).not.toBeInstanceOf(Date);
  });

  /** O SQL gerado carimba por `now()`, e NÃO por um placeholder de parâmetro no ramo que encerra. */
  it("com now(): o resolvido_em é coalesce(..., now()), sem parâmetro", () => {
    const built = statementDeConflito(sql`coalesce(${pandapeEntrada.resolvidoEm}, now())`);
    expect(built.sql.toLowerCase()).toContain(
      `coalesce("pandape_entrada"."resolvido_em", now())`,
    );
  });

  /**
   * ─ A ASSINATURA DO DEFEITO (contraste, no espírito do regua-on-conflict) ───────────────────────
   * Interpolar a Date crua (`${agora}`) liga EXATAMENTE um parâmetro `Date`. É este parâmetro que o
   * postgres-js recusa no caminho do UPDATE. Se um conserto futuro reintroduzir a Date interpolada,
   * esta contagem volta a 1, e é essa a regressão que não pode passar calada.
   */
  it("com a Date interpolada (jeito antigo): liga exatamente UMA Date crua", () => {
    const agora = new Date();
    const built = statementDeConflito(sql`coalesce(${pandapeEntrada.resolvidoEm}, ${agora})`);
    expect(datasCruas(built)).toBe(1);
  });

  /**
   * As OUTRAS semânticas do `set` que (c) e (d) do requisito dependem, travadas no SQL para que uma
   * refatoração do upsert não as perca:
   *  . `admissao_id` é COALESCE de excluded (o id novo entra; nunca apaga o que já havia) -> (c);
   *  . `desfecho` só muda quando `resolvido_em` AINDA é null; linha já resolvida NÃO regride -> (d).
   */
  it("o set preserva admissao_id por coalesce e não regride desfecho de linha resolvida", () => {
    const sqlGerado = statementDeConflito(
      sql`coalesce(${pandapeEntrada.resolvidoEm}, now())`,
    ).sql.toLowerCase();
    expect(sqlGerado).toContain(
      `"admissao_id" = coalesce(excluded.admissao_id, "pandape_entrada"."admissao_id")`,
    );
    expect(sqlGerado).toContain(
      `"desfecho" = case when "pandape_entrada"."resolvido_em" is null then excluded.desfecho else "pandape_entrada"."desfecho" end`,
    );
  });
});
