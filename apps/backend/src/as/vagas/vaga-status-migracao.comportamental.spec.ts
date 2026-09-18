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

/**
 * O ARQUIVO É ESCOLHIDO PELO QUE ELE FAZ (cria a tabela), E A LISTA VEM ORDENADA.
 *
 * As duas coisas passaram a importar quando a 0115 virou a SEGUNDA migration a mencionar
 * `as_vaga_status`: um `find` sobre a ordem crua do diretório escolheria "alguma" delas, e as
 * afirmações de estrutura (colunas, CHECK, FK) cairiam sobre um arquivo que não cria tabela
 * nenhuma, ficando vermelhas sem defeito nenhum, ou verdes por acaso no dia seguinte.
 */
function migrationDoCatalogo(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR).filter((n) => n.endsWith(".sql")).sort();
  const alvo = arquivos.find((n) =>
    /create table[^;]*as_vaga_status/i.test(readFileSync(join(DIR, n), "utf8")),
  );
  if (!alvo) {
    throw new Error(
      `Nenhuma migration CRIA \`as_vaga_status\`. Existem ${arquivos.length} arquivos em drizzle/, o último é ${arquivos.at(-1)}.`,
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

  it("semeia todo código da semente, com o papel de cada um, em alguma migration do catálogo", () => {
    const tudo = migracoesDoCatalogo()
      .map((m) => m.sql.replace(/--[^\n]*/g, " ").toLowerCase())
      .join(" ");
    for (const s of VAGA_STATUS_SEMENTE) {
      expect(tudo, `o código ${s.codigo} precisa entrar no catálogo`).toContain(s.codigo.toLowerCase());
      expect(tudo, `o papel ${s.papel} precisa aparecer na semente`).toContain(s.papel.toLowerCase());
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

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A SEMENTE E AS MIGRATIONS DESCREVEM O MESMO CATÁLOGO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ─ POR QUE ESTE BLOCO EXISTE ──────────────────────────────────────────────────────────────────
 *
 * `VAGA_STATUS_SEMENTE` e o SQL das migrations descrevem A MESMA TABELA em dois arquivos
 * diferentes, e nada, até aqui, obrigava os dois a concordarem. Divergir é silencioso dos dois
 * lados: o código raciocina pela semente (é ela que os dublês de teste usam, e é ela que o
 * `MenusCatalogoService` e os fakes leem), e o banco vive o que a migration gravou. Um flag
 * diferente em um dos dez campos vira "o teste passa e a produção não faz aquilo", que é a classe
 * de defeito que esta sessão já viu duas vezes.
 *
 * O CASAMENTO É CAMPO A CAMPO, e não só de código: `recebe_candidato` trocado apaga a ingestão em
 * silêncio, `encerra` trocado tira a vaga do alcance do encerramento automático, e `ativo` trocado
 * ressuscita status dormente em seletor.
 *
 * A DIREÇÃO É UMA SÓ, DE PROPÓSITO: toda linha da SEMENTE tem de existir, idêntica, no SQL. O
 * contrário não vale, e o `VAGA_BANCO` é a razão: ele existe no banco por ser valor de enum que o
 * Postgres não remove, e NÃO é status oferecido. A regra para o que só existe no SQL é outra, e
 * está afirmada abaixo: tem de nascer INATIVO.
 */

const COLUNAS_ESPERADAS = [
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
];

function migracoesDoCatalogo(): { arquivo: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((arquivo) => ({ arquivo, sql: readFileSync(join(DIR, arquivo), "utf8") }))
    .filter((m) => /insert into\s+"?as_vaga_status"?/i.test(m.sql));
}

/**
 * TODOS os grupos de parênteses BALANCEADOS de um trecho, em QUALQUER profundidade.
 *
 * A PROFUNDIDADE IMPORTA E JÁ ME ENGANOU UMA VEZ: na 0102 as linhas literais vivem dentro de um
 * `LEFT JOIN ( VALUES (...), (...) ) m (...)`, ou seja em profundidade 2. Um leitor que só olhasse
 * o nível zero acharia UMA linha (a da 0115) e afirmaria, sobre as outras cinco, que "a migration
 * não as grava", o que é o oposto da verdade. Ler tudo e FILTRAR pelo formato da linha é a direção
 * que erra para o lado de olhar demais, e olhar demais aqui não custa nada.
 */
function gruposDeParenteses(trecho: string): string[] {
  const grupos: string[] = [];
  const pilha: number[] = [];
  let emAspas = false;
  for (let i = 0; i < trecho.length; i += 1) {
    const c = trecho[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") pilha.push(i + 1);
    else if (c === ")") {
      const inicio = pilha.pop();
      if (inicio !== undefined) grupos.push(trecho.slice(inicio, i));
    }
  }
  return grupos;
}

/** O PRIMEIRO grupo de profundidade zero: a lista de colunas do `insert`. */
function listaDeColunas(trecho: string): string {
  let profundidade = 0;
  let inicio = -1;
  let emAspas = false;
  for (let i = 0; i < trecho.length; i += 1) {
    const c = trecho[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") {
      if (profundidade === 0) inicio = i + 1;
      profundidade += 1;
    } else if (c === ")") {
      profundidade -= 1;
      if (profundidade === 0 && inicio >= 0) return trecho.slice(inicio, i);
    }
  }
  return "";
}

/** Parte uma lista por vírgula de profundidade zero, respeitando parênteses e aspas. */
function itens(lista: string): string[] {
  const partes: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;
  for (const c of lista) {
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (c === "," && profundidade === 0) {
        partes.push(atual.trim());
        atual = "";
        continue;
      }
    }
    atual += c;
  }
  if (atual.trim() !== "") partes.push(atual.trim());
  return partes;
}

const semAspas = (v: string): string => v.trim().replace(/^'|'$/g, "").replace(/^"|"$/g, "");

export interface LinhaSemeada {
  arquivo: string;
  valores: Record<string, string>;
}

/**
 * AS LINHAS LITERAIS que as migrations gravam em `as_vaga_status`.
 *
 * A ORDEM DAS COLUNAS É LIDA DO PRÓPRIO `insert`, e NÃO suposta: casar valor com coluna pela
 * posição de uma lista escrita aqui faria toda afirmação seguinte cair no campo errado no dia em
 * que alguém reordenasse o `insert`, e o teste ficaria verde dizendo outra coisa. Divergiu a ordem,
 * este leitor LANÇA, que é o modo de falha que se enxerga.
 */
function linhasSemeadas(): LinhaSemeada[] {
  const linhas: LinhaSemeada[] = [];
  for (const m of migracoesDoCatalogo()) {
    const sql = m.sql.replace(/--[^\n]*/g, " ");
    const i = sql.search(/insert into\s+"?as_vaga_status"?/i);
    const depois = sql.slice(i);
    const colunas = itens(listaDeColunas(depois)).map((c) => semAspas(c).toLowerCase());
    if (colunas.join(",") !== COLUNAS_ESPERADAS.join(",")) {
      throw new Error(
        `${m.arquivo}: a lista de colunas do insert mudou (${colunas.join(", ")}). O leitor casa valor com coluna pela ordem do próprio insert, então ou a ordem volta, ou COLUNAS_ESPERADAS acompanha, de propósito.`,
      );
    }
    for (const g of gruposDeParenteses(depois)) {
      const valores = itens(g);
      if (valores.length !== colunas.length) continue;
      if (!/^'[A-Z][A-Z0-9_]*'$/.test(valores[0])) continue;
      linhas.push({
        arquivo: m.arquivo,
        valores: Object.fromEntries(colunas.map((c, k) => [c, semAspas(valores[k])])),
      });
    }
  }
  return linhas;
}

describe("a semente do vocabulário e as migrations descrevem o mesmo catálogo", () => {
  const semeadas = linhasSemeadas();

  it("o leitor achou linha literal em migration, senão as afirmações abaixo seriam vazias", () => {
    expect(
      semeadas.length,
      "nenhuma linha literal foi lida das migrations: ou o formato do insert mudou, ou o leitor parou de achá-lo, e as afirmações seguintes passariam sem medir nada",
    ).toBeGreaterThanOrEqual(VAGA_STATUS_SEMENTE.length);
  });

  it.each(VAGA_STATUS_SEMENTE.map((s) => ({ codigo: s.codigo, s })))(
    "`$codigo` da semente existe no SQL, e com os DEZ campos iguais",
    ({ s }) => {
      const linha = semeadas.find((l) => l.valores.codigo === s.codigo);
      expect(
        linha,
        `o código ${s.codigo} está na semente e não é gravado por migration nenhuma. Quem roda o sistema pela semente o enxerga, o banco não, e a FK RESTRICT recusa a primeira vaga que tentar usá-lo.`,
      ).toBeDefined();
      const v = (linha as LinhaSemeada).valores;
      expect(v.rotulo, "o rótulo é o que a tela mostra").toBe(s.rotulo);
      expect(Number(v.ordem)).toBe(s.ordem);
      expect(v.tom).toBe(s.tom);
      expect(v.ativo).toBe(String(s.ativo));
      expect(v.papel, "o papel é a identidade perguntável do status").toBe(s.papel);
      expect(v.encerra, "encerra decide o alcance do encerramento automático e a proteção do expurgo").toBe(
        String(s.encerra),
      );
      expect(
        v.recebe_candidato,
        "recebe_candidato falso para no meio da ingestão sem nada falhar",
      ).toBe(String(s.recebeCandidato));
      expect(v.da_trilha).toBe(String(s.daTrilha));
      expect(v.movivel_manualmente).toBe(String(s.movivelManualmente));
    },
  );

  /**
   * O QUE SÓ EXISTE NO SQL NASCE INATIVO. É o caso do `VAGA_BANCO`, valor de enum que o Postgres
   * não remove: ele precisa existir para a FK e para o rótulo do histórico, e não pode aparecer em
   * seletor, ou o status que o diretor tirou de circulação em 07/09 volta pela porta da frente.
   */
  it("linha que existe no SQL e NÃO na semente nasce inativa", () => {
    const soNoSql = semeadas.filter(
      (l) => !VAGA_STATUS_SEMENTE.some((s) => s.codigo === l.valores.codigo),
    );
    for (const l of soNoSql) {
      expect(
        l.valores.ativo,
        `${l.valores.codigo} (${l.arquivo}) é gravado pela migration, não está na semente e nasce ATIVO: ele aparece em seletor e em filtro sem o vocabulário compartilhado saber que ele existe.`,
      ).toBe("false");
    }
  });

  it("o papel de cada linha semeada está no domínio do CHECK do banco", () => {
    const checks = migracoesDoCatalogo()
      .map((m) => m.sql)
      .join(" ")
      .replace(/--[^\n]*/g, " ");
    for (const l of semeadas) {
      const papel = l.valores.papel;
      expect(
        new RegExp(`check[^;]*papel[^;]*'${papel}'`, "i").test(checks.replace(/\s+/g, " ")),
        `o papel ${papel} é gravado por ${l.arquivo} e não aparece em nenhum CHECK de papel: ou o CHECK não o admite (e o insert morre), ou o domínio deixou de ser conferido no banco.`,
      ).toBe(true);
    }
  });
});
