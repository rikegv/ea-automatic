import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { VAGA_STATUS_SEMENTE } from "@ea/shared-types";

/**
 * ─ A MIGRATION DO CATÁLOGO DE STATUS (B2): O QUE O BANCO TEM DE GARANTIR SOZINHO ────────────────
 *
 * ┌─ POR QUE O TESTE LÊ O SQL, e não só o serviço ──────────────────────────────────────────────┐
 * │ A TRAVA DA APLICAÇÃO É A QUE DÁ A MENSAGEM BOA; A DO BANCO É A QUE VALE MESMO QUANDO NINGUÉM │
 * │ PASSA PELA APLICAÇÃO. Carga, correção por SQL cru, script de importação e o próprio diretor  │
 * │ com um cliente de banco na mão chegam à tabela sem passar por guard nenhum. As duas travas    │
 * │ precisam existir, e a do banco é esta.                                                        │
 * │                                                                                             │
 * │ E ELA É A ÚNICA QUE SOBREVIVE A UMA REFATORAÇÃO DO SERVIÇO. Um `if` some numa reescrita; um  │
 * │ CHECK só some se alguém escrever uma migration para removê-lo, o que é gesto deliberado.     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.27, CONTAGENS INTACTAS: nenhuma vaga muda de status por efeito da migração. Os cinco códigos
 * continuam os mesmos, e é isso que a última parte do arquivo mede.
 */

const DIR = join(__dirname, "..", "..", "..", "drizzle");

function migrationDoCatalogo(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR).filter((n) => n.endsWith(".sql"));
  const alvo = arquivos.find((n) => readFileSync(join(DIR, n), "utf8").includes("as_vaga_status"));
  if (!alvo) {
    throw new Error(
      `Nenhuma migration menciona \`as_vaga_status\`. Existem ${arquivos.length} arquivos em drizzle/, o último é ${arquivos.sort().at(-1)}.`,
    );
  }
  return { arquivo: alvo, sql: readFileSync(join(DIR, alvo), "utf8") };
}

/**
 * O SQL EXECUTÁVEL: sem comentário, sem aspas, sem quebra de linha, minúsculo.
 *
 * OS COMENTÁRIOS SAEM ANTES DE QUALQUER AFIRMAÇÃO, e a razão é concreta: o cabeçalho desta migration
 * EXPLICA por que o `drop type` não leva `cascade`, então uma varredura de texto cru encontra a
 * palavra proibida dentro da frase que promete não usá-la. Teste que lê comentário mede prosa.
 */
function normalizado(): string {
  return migrationDoCatalogo()
    .sql.replace(/--[^\n]*/g, " ")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("a tabela do catálogo nasce com as colunas que o requisito nomeia", () => {
  it("cria `as_vaga_status`", () => {
    expect(normalizado()).toMatch(/create table (if not exists )?as_vaga_status/);
  });

  it.each([
    "codigo",
    "rotulo",
    "ordem",
    "tom",
    "ativo",
    "papel",
    "encerra",
    "recebe_candidato",
    "da_trilha",
    "movivel_manualmente",
  ])("tem a coluna `%s`", (coluna) => {
    expect(normalizado()).toContain(coluna);
  });

  /** O `codigo` é a IDENTIDADE gravada na vaga: renomear mexe no rótulo, nunca aqui. */
  it("o `codigo` é único", () => {
    expect(normalizado()).toMatch(/unique\s*\(\s*codigo\s*\)/);
  });
});

describe("as travas que o banco guarda sozinho", () => {
  /**
   * UM DONO POR PAPEL DE SISTEMA, e o índice é PARCIAL: ele não diz nada sobre as linhas LIVRE (das
   * quais pode haver muitas) e impede a SEGUNDA linha de qualquer outro papel. Sem ele,
   * `codigoDoPapel("ENTREGA")` teria de ESCOLHER entre duas linhas, que é o que ele não pode fazer.
   */
  it("índice único PARCIAL por papel, deixando `LIVRE` de fora", () => {
    const sql = normalizado();
    expect(sql).toMatch(/create unique index[^;]*as_vaga_status[^;]*\(\s*papel\s*\)/);
    const trecho = sql.slice(sql.indexOf("create unique index"));
    expect(trecho, "sem o `WHERE`, o índice proibiria o SEGUNDO status LIVRE").toMatch(
      /where[^;]*livre/,
    );
  });

  /**
   * A MUTAÇÃO 6 MORRE AQUI: sem este CHECK, a linha de papel de sistema vira INATIVÁVEL por SQL
   * cru, e o efeito é o mesmo do apagado, porque toda leitura do catálogo filtra por `ativo`.
   */
  it("CHECK: linha de papel de sistema não pode ficar inativa", () => {
    const checks = normalizado().match(/check\s*\([^;]*?\)/g) ?? [];
    expect(
      checks.some((c) => /papel/.test(c) && /livre/.test(c) && /ativo/.test(c)),
      `nenhum CHECK amarra papel e ativo. Achados: ${checks.join(" | ") || "nenhum"}`,
    ).toBe(true);
  });

  /**
   * STATUS LIVRE QUE ENCERRA seria a TERCEIRA porta do encerramento, cadastrada pela tela: sem
   * trava de candidato tratado, sem a de posição oficial, sem gate de Master, sem carimbo de
   * contagem, sem data de fechamento.
   */
  it("CHECK: status LIVRE não encerra vaga", () => {
    const checks = normalizado().match(/check\s*\([^;]*?\)/g) ?? [];
    expect(
      checks.some((c) => /livre/.test(c) && /encerra/.test(c)),
      `nenhum CHECK impede um LIVRE que encerra. Achados: ${checks.join(" | ") || "nenhum"}`,
    ).toBe(true);
  });

  /**
   * A FK É O QUE TORNA CÓDIGO ÓRFÃO IMPOSSÍVEL, e `RESTRICT` é o que impede apagar uma linha que
   * alguma vaga usa. Ela NÃO pega o código existente e ERRADO (gravar o do cancelamento onde ia o
   * do fechamento é FK válida), e é por isso que `codigoDoPapel` existe do lado da aplicação.
   */
  it("FK de `vagas.status` para `as_vaga_status.codigo`, com RESTRICT", () => {
    const sql = normalizado();
    const fk = sql.match(
      /foreign key\s*\(\s*status\s*\)\s*references[^;]*?as_vaga_status\s*\(\s*codigo\s*\)[^;]*/,
    );
    expect(fk, "sem a FK, um código de status inexistente entra na vaga sem nada reclamar").not.toBeNull();
    expect(
      (fk as RegExpMatchArray)[0],
      "sem RESTRICT, apagar a linha do catálogo apaga o significado do status de toda vaga que o usa",
    ).toMatch(/on delete restrict/);
  });

  /** A trilha do movimento manual precisa de tabela para existir (item 5 do requisito). */
  it("cria a tabela da trilha `as_vaga_status_eventos`", () => {
    expect(normalizado()).toMatch(/create table (if not exists )?as_vaga_status_eventos/);
  });
});

describe("§A.27: a migração é de FORMA, não de comportamento", () => {
  const sql = () => normalizado();

  it("semeia os cinco códigos de hoje, com o papel de cada um", () => {
    for (const s of VAGA_STATUS_SEMENTE) {
      expect(sql(), `o código ${s.codigo} precisa entrar no catálogo`).toContain(s.codigo.toLowerCase());
      expect(sql(), `o papel ${s.papel} precisa aparecer na semente`).toContain(s.papel.toLowerCase());
    }
  });

  /**
   * NENHUMA VAGA MUDA DE STATUS. Um `UPDATE vagas SET status = ...` aqui reescreveria o passado de
   * 2.363 linhas em silêncio, e o Painel, o Gerenciador e a análise de Alto Volume passariam a
   * contar outra coisa, que é exatamente o incidente que originou a §A.27.
   */
  it("não reescreve o status de vaga nenhuma", () => {
    const updates = sql().match(/update vagas set[^;]*/g) ?? [];
    const mexemNoStatus = updates.filter((u) => /\bstatus\b\s*=/.test(u));
    expect(mexemNoStatus, `a migração está reescrevendo status: ${mexemNoStatus.join(" | ")}`).toHaveLength(0);
  });

  /**
   * ┌─ O VALOR DORMENTE `VAGA_BANCO`, QUE É O BURACO QUE ESTA MIGRAÇÃO PODE ABRIR ───────────────┐
   * │ `vaga_status` (o enum do Postgres) tem SEIS valores, não cinco: `VAGA_BANCO` ficou lá,      │
   * │ dormente desde 07/09, porque o Postgres não remove valor de enum. A semente do vocabulário  │
   * │ compartilhado tem CINCO.                                                                   │
   * │                                                                                            │
   * │ SÃO DOIS RISCOS OPOSTOS, e a migração precisa escolher um caminho de propósito:             │
   * │   . semear a partir do enum (o molde da 0100) traz `VAGA_BANCO` de volta como status VIVO,  │
   * │     oferecido em seletor e em filtro, ressuscitando o que o diretor tirou da lista;         │
   * │   . semear só os cinco literais deixa órfã qualquer linha que ainda use `VAGA_BANCO`, e a   │
   * │     FK derruba a migration inteira (falha alta, que é o modo seguro, mas é falha).          │
   * │                                                                                            │
   * │ O TESTE NÃO ESCOLHE POR QUEM CONSTRÓI: ele exige que a decisão esteja ESCRITA no arquivo.   │
   * │ Silêncio aqui é o que faz o defeito aparecer no dia da migração, com a operação parada.     │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("trata o valor dormente `VAGA_BANCO` explicitamente", () => {
    const { sql: cru } = migrationDoCatalogo();
    const citado = /VAGA_BANCO/.test(cru);
    const derivado = /enum_range|select\s+distinct[^;]*status[^;]*from\s+"?vagas/i.test(cru);
    expect(
      citado || derivado,
      "a migração não diz nada sobre `VAGA_BANCO`, o sexto valor do enum `vaga_status`: ou ele entra no catálogo, ou a FK derruba a migration se alguma linha o usar",
    ).toBe(true);
  });

  /**
   * O DORMENTE NÃO PODE VOLTAR COMO STATUS VIVO. Semeando a partir do enum, `VAGA_BANCO` entra sem
   * par no mapa literal, e é o FALLBACK que decide o que ele vira. Um fallback `ativo = true`
   * ressuscitaria, em seletor e em filtro, o status que o diretor tirou de circulação em 07/09.
   */
  it("o valor sem par no mapa entra INATIVO, e não vira status oferecido", () => {
    const sql = normalizado();
    const seed = sql.slice(sql.indexOf("insert into as_vaga_status"), sql.indexOf("on conflict"));
    expect(seed, "o fallback de `ativo` precisa ser false").toMatch(/coalesce\s*\(\s*m\.ativo\s*,\s*false\s*\)/);
    expect(seed, "o fallback de `da_trilha` precisa ser false").toMatch(
      /coalesce\s*\(\s*m\.da_trilha\s*,\s*false\s*\)/,
    );
    expect(seed, "o fallback de `movivel_manualmente` precisa ser false").toMatch(
      /coalesce\s*\(\s*m\.movivel_manualmente\s*,\s*false\s*\)/,
    );
    expect(seed, "o fallback de `encerra` precisa ser false").toMatch(
      /coalesce\s*\(\s*m\.encerra\s*,\s*false\s*\)/,
    );
  });

  /**
   * `DROP TYPE` SEM `CASCADE`, se a migração dropar o enum. Sem `CASCADE`, o Postgres RECUSA o drop
   * enquanto alguma coluna ainda usar o tipo, e a transação inteira reverte: passo pulado vira erro
   * alto. Com `CASCADE`, ele DROPA A COLUNA em silêncio, e a coluna aqui é `vagas.status`.
   */
  it("não dropa o tipo antigo com CASCADE", () => {
    expect(sql()).not.toMatch(/drop type[^;]*cascade/);
  });
});
