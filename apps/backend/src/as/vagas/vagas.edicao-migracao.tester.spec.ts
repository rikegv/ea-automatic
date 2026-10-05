import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TESTER INDEPENDENTE (§A.38, §A.40 regra 2). Migration da trilha do CRUD da vaga liberada, pelo
 * REQUISITO (mapa `docs/MAPA-CRUD-VAGA-LIBERADA.md`, emenda E-1 e E-6):
 *
 *  - `vaga_edicoes` e `vaga_exclusoes` SEM FK NENHUMA para `vagas`. CASCADE apagaria o histórico junto
 *    com a vaga; NO ACTION/RESTRICT impediria excluir vaga editada; SET NULL perderia o vínculo.
 *  - `vaga_edicoes.campo` tem CHECK da lista (campo não classificado não entra por SQL solto).
 *  - O instantâneo de `vaga_exclusoes` não guarda PII (§A.6): sem CPF, sem solicitante, sem nome de
 *    divulgação (o título do Pandapé já chegou com nome de gente dentro).
 *  - O `when` do journal fica ACIMA da marca d'água (o drizzle compara timestamp, não hash: migration
 *    abaixo da marca é pulada em silêncio, já mordeu com a 0134).
 *
 * TESTE DE FONTE: comentários são tirados ANTES de asserir. Um `-- sem references vagas` num
 * comentário não pode fazer o teste passar nem falhar.
 */

const DRIZZLE = join(__dirname, "../../../drizzle");
const MARCA_DAGUA_0142 = 1790646008719;

function semComentarios(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((linha) => {
      // `--` fora de string literal. As strings de CHECK não têm `--`, então o corte simples serve.
      const i = linha.indexOf("--");
      return i >= 0 && !linha.slice(i).startsWith("--> statement-breakpoint") ? linha.slice(0, i) : linha;
    })
    .join("\n");
}

function sqlDa0143(): string {
  return semComentarios(readFileSync(join(DRIZZLE, "0143_vaga_edicoes_exclusoes.sql"), "utf8"));
}

/** Os comandos SQL (separados por `;` e pelo breakpoint do drizzle) que mencionam a tabela. */
function comandosDa(sql: string, tabela: string): string[] {
  return sql
    .split(/;|--> statement-breakpoint/)
    .map((c) => c.trim())
    .filter((c) => new RegExp(`"?${tabela}"?`, "i").test(c));
}

/** O CREATE TABLE da tabela, do parêntese de abertura até o de fechamento. */
function createTable(sql: string, tabela: string): string {
  const cmd = comandosDa(sql, tabela).find((c) =>
    new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?("?public"?\\.)?"?${tabela}"?`, "i").test(c),
  );
  expect(cmd, `CREATE TABLE ${tabela} na 0143`).toBeDefined();
  return cmd!;
}

const REFERENCIA_A_VAGAS = /references\s+("?public"?\s*\.\s*)?"?vagas"?\s*\(/i;

describe("migration 0143: trilha da edição e da exclusão de vaga", () => {
  it("o arquivo existe com o nome combinado", () => {
    expect(() => sqlDa0143()).not.toThrow();
  });

  it("cria vaga_edicoes e vaga_exclusoes", () => {
    const sql = sqlDa0143();
    createTable(sql, "vaga_edicoes");
    createTable(sql, "vaga_exclusoes");
  });

  for (const tabela of ["vaga_edicoes", "vaga_exclusoes"]) {
    it(`${tabela}: nenhuma FK para vagas (nem CASCADE, nem NO ACTION, nem SET NULL, nem RESTRICT)`, () => {
      for (const cmd of comandosDa(sqlDa0143(), tabela)) {
        expect(cmd, `comando que toca ${tabela}`).not.toMatch(REFERENCIA_A_VAGAS);
      }
    });
  }

  it("a migration inteira não referencia vagas por FK (ALTER solto em outra linha também conta)", () => {
    expect(sqlDa0143()).not.toMatch(REFERENCIA_A_VAGAS);
  });

  it("vaga_edicoes.campo tem CHECK", () => {
    const comandos = comandosDa(sqlDa0143(), "vaga_edicoes").join("\n");
    expect(comandos).toMatch(/check\s*\(\s*\(?\s*"?campo"?\s*(=\s*any|in\s*\(|::)/i);
  });

  it("vaga_edicoes tem as colunas da trilha: vaga, autor, quando, campo, de, para", () => {
    const ct = createTable(sqlDa0143(), "vaga_edicoes");
    for (const col of ["vaga_id", "por_id", "campo", "de", "para"]) {
      expect(ct, col).toMatch(new RegExp(`"${col}"\\s|\\b${col}\\s`, "i"));
    }
  });

  it("vaga_exclusoes não tem coluna de PII (§A.6, E-1/E-6)", () => {
    const ct = createTable(sqlDa0143(), "vaga_exclusoes");
    const colunas = [...ct.matchAll(/^\s*"?([a-z_]+)"?\s+(uuid|text|varchar|jsonb?|timestamp|integer|boolean|date|numeric|bigint|smallint)/gim)].map(
      (m) => m[1]!.toLowerCase(),
    );
    expect(colunas.length, "colunas lidas do CREATE TABLE").toBeGreaterThan(0);
    for (const c of colunas) {
      expect(c).not.toMatch(/cpf|telefone|email|solicitante|substituido|nome_divulgacao|observac|justificativa/);
    }
  });
});

describe("schema drizzle: as tabelas novas também nascem sem FK para vagas", () => {
  /**
   * A migration é gerada do schema. Uma `.references(() => vagas.id)` no TypeScript faz a PRÓXIMA
   * migration gerada criar a FK que esta proibiu.
   */
  function blocoDoSchema(tabela: string): string {
    const fonte = readFileSync(join(__dirname, "../../db/schema/tables.ts"), "utf8");
    const i = fonte.indexOf(`pgTable("${tabela}"`);
    expect(i, `pgTable("${tabela}") em db/schema/tables.ts`).toBeGreaterThan(-1);
    const resto = fonte.slice(i);
    const fim = resto.search(/\nexport const /);
    return (fim > 0 ? resto.slice(0, fim) : resto.slice(0, 4000))
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, "");
  }

  for (const tabela of ["vaga_edicoes", "vaga_exclusoes"]) {
    it(`${tabela}: nenhum references(() => vagas.*)`, () => {
      expect(blocoDoSchema(tabela)).not.toMatch(/references\s*\(\s*\(\s*\)\s*=>\s*vagas\s*\./);
    });
  }
});

describe("journal: a 0143 fica acima da marca d'água", () => {
  it("a entrada 0143 existe com when > o da 0142 e é a de maior when", () => {
    const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta/_journal.json"), "utf8")) as {
      entries: { idx: number; when: number; tag: string }[];
    };
    const e = journal.entries.find((x) => x.tag.startsWith("0143_"));
    expect(e, "entrada 0143 no _journal.json").toBeDefined();
    expect(e!.tag).toBe("0143_vaga_edicoes_exclusoes");
    expect(e!.when).toBeGreaterThan(MARCA_DAGUA_0142);
    const anteriores = journal.entries.filter((x) => x.idx < e!.idx);
    for (const a of anteriores) expect(e!.when, a.tag).toBeGreaterThan(a.when);
  });
});
