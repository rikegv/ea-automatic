import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ETAPAS_FUNIL_SEMENTE } from "@ea/shared-types";

/**
 * ─ FUNDAÇÃO, PEÇA 3: A REPOSIÇÃO DAS 5 ETAPAS DO FUNIL ────────────────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita JUNTO com a construção (§A.40, regra 2), a partir do
 * requisito (`docs/MAPA-ALCANCE-FUNDACAO-UNIFICADORA.md`, seção 2).
 *
 * ┌─ O QUE SE MEDE AQUI, E POR QUE NÃO SE MEDE RODANDO ─────────────────────────────────────────┐
 * │ Não há Postgres em memória nesta suíte (nem pglite nem pg-mem nas dependências, conferido),  │
 * │ então a reposição é medida pela FORMA do SQL, com as defesas da casa contra falso positivo:  │
 * │ o comentário é APAGADO antes de qualquer leitura, e cada afirmação é feita sobre a TUPLA da  │
 * │ etapa, e não sobre o texto inteiro do arquivo. Sem isso, procurar "CAPTACAO" no arquivo cru  │
 * │ ficaria verde com a semente apagada e o comentário que a explica no lugar.                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS COISAS QUE PODEM DAR ERRADO, e cada uma tem o seu bloco ───────────────────────────┐
 * │ 1. A REPOSIÇÃO NÃO RODA. É o defeito que a frente existe para corrigir: a 0100 já consta no  │
 * │    `_journal.json` e o runner não reexecuta migration aplicada. Migration nova FORA do       │
 * │    journal repete o mesmo silêncio, e o banco continua sem etapa nenhuma.                    │
 * │ 2. A REPOSIÇÃO RODA DUAS VEZES E DUPLICA (ou estoura). Idempotência é requisito escrito.     │
 * │ 3. A REPOSIÇÃO ATROPELA O CATÁLOGO DO DIRETOR. `as_etapas_funil` é tabela EDITÁVEL por tela: │
 * │    ele renomeia, reordena e recolore. Uma reposição que escreva por cima desfaz o trabalho   │
 * │    dele na subida seguinte, e o histórico inteiro daquela etapa volta a mostrar o rótulo     │
 * │    antigo, porque o rótulo é resolvido por join.                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal. Códigos, rótulos de etapa e números de ordem.
 */

const DIR = join(__dirname, "..", "..", "drizzle");

/** O SQL executável de um arquivo: linha de comentário fora, espaços colapsados. */
function executavel(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Migration {
  tag: string;
  sql: string;
}

/**
 * A MIGRATION DA REPOSIÇÃO: a que fala de `as_etapas_funil`, INSERE nela, e NÃO é a 0100.
 *
 * A 0100 é excluída pelo nome porque ela é a que NÃO repõe (ela já rodou, é esse o problema). O
 * resto é descoberto do disco: fixar o número da migration nova aqui a quebraria na geração
 * seguinte do drizzle-kit.
 */
function migrationDaReposicao(): Migration | null {
  const arquivos = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("0100_"))
    .sort();
  for (const f of arquivos) {
    const sql = executavel(readFileSync(join(DIR, f), "utf8"));
    if (/insert\s+into\s+"?as_etapas_funil"?/i.test(sql)) {
      return { tag: f.replace(/\.sql$/, ""), sql };
    }
  }
  return null;
}

function exigirMigration(): Migration {
  const m = migrationDaReposicao();
  if (!m) {
    throw new Error(
      "FALTA CONSTRUIR: nenhuma migration (fora a 0100, que já rodou) insere em " +
        '"as_etapas_funil". A base foi zerada em 17/09 e o catálogo precisa de reposição ' +
        "idempotente (seção 2 do mapa de alcance).",
    );
  }
  return m;
}

/**
 * A TUPLA DE UMA ETAPA: o grupo entre parênteses que contém o código dela.
 *
 * É este recorte que impede o falso positivo mais provável do arquivo: `sql.includes("'TRIAGEM'")`
 * e `sql.includes("true")` ficam verdes juntos mesmo quando o `true` está na linha da CAPTACAO, e
 * a afirmação "só a captação é inicial" passaria a não medir nada.
 */
function tuplaDaEtapa(sql: string, codigo: string): string | null {
  const alvo = `'${codigo}'`;
  const i = sql.indexOf(alvo);
  if (i < 0) return null;
  let inicio = -1;
  let profundidade = 0;
  for (let k = i; k >= 0; k -= 1) {
    if (sql[k] === ")") profundidade += 1;
    if (sql[k] === "(") {
      if (profundidade === 0) {
        inicio = k;
        break;
      }
      profundidade -= 1;
    }
  }
  if (inicio < 0) return null;
  let fim = -1;
  profundidade = 0;
  for (let k = inicio; k < sql.length; k += 1) {
    if (sql[k] === "(") profundidade += 1;
    if (sql[k] === ")") {
      profundidade -= 1;
      if (profundidade === 0) {
        fim = k;
        break;
      }
    }
  }
  return fim < 0 ? null : sql.slice(inicio, fim + 1);
}

function exigirTupla(sql: string, codigo: string): string {
  const t = tuplaDaEtapa(sql, codigo);
  if (!t) {
    throw new Error(
      `FALTA CONSTRUIR: a reposição não semeia a etapa "${codigo}". ` +
        "As cinco da seção 2 do mapa entram todas, com código, rótulo, ordem e tom.",
    );
  }
  return t;
}

/**
 * ─ AS CINCO, DIGITADAS À MÃO E CONFERIDAS CONTRA O VOCABULÁRIO ────────────────────────────────
 *
 * Esta lista é do TESTE e não encolhe: derivá-la de `ETAPAS_FUNIL_SEMENTE` faria o laço sumir
 * junto com a constante, e uma reposição que semeasse três etapas ficaria verde. O caso de baixo
 * é a ponte: ele exige que o vocabulário compartilhado continue dizendo a MESMA coisa que esta
 * lista, então as duas não podem divergir em silêncio.
 */
const AS_CINCO = [
  { codigo: "CAPTACAO", rotulo: "Captação", ordem: 1, tom: "nt", inicial: true },
  { codigo: "TRIAGEM", rotulo: "Triagem", ordem: 2, tom: "in", inicial: false },
  { codigo: "ENTREVISTA_SOULAN", rotulo: "Entrevista Soulan", ordem: 3, tom: "wn", inicial: false },
  { codigo: "ENTREVISTA_CLIENTE", rotulo: "Entrevista Cliente", ordem: 4, tom: "or", inicial: false },
  { codigo: "APROVACAO", rotulo: "Aprovação", ordem: 5, tom: "ok", inicial: false },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A REPOSIÇÃO EXISTE E VAI RODAR DE VERDADE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a reposição existe e o runner vai executá-la", () => {
  it("há uma migration NOVA que insere em as_etapas_funil", () => {
    expect(exigirMigration().tag.length).toBeGreaterThan(0);
  });

  /**
   * ─ O CASO QUE PEGA O DEFEITO EXATO QUE ORIGINOU A FRENTE ────────────────────────────────────
   *
   * A 0100 não repõe porque já consta como aplicada, e o runner não reexecuta migration aplicada
   * (seção 2 do mapa). Um arquivo `.sql` criado à mão, sem entrada no `_journal.json`, repete o
   * mesmo silêncio: ele existe, ninguém o roda, o banco segue sem etapa nenhuma, e a primeira
   * candidatura falha na FK RESTRICT da coluna `etapa`, longe daqui.
   */
  it("a migration está registrada no _journal.json (sem isso, ela nunca roda)", () => {
    const journal = JSON.parse(readFileSync(join(DIR, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const tags = journal.entries.map((e) => e.tag);
    expect(tags, `tags de hoje: ${JSON.stringify(tags.slice(-5))}`).toContain(exigirMigration().tag);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. AS CINCO ENTRAM COM CÓDIGO, RÓTULO, ORDEM E TOM
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("as cinco etapas entram inteiras", () => {
  it.each(AS_CINCO)("$codigo entra com rótulo, ordem e tom", ({ codigo, rotulo, ordem, tom }) => {
    const tupla = exigirTupla(exigirMigration().sql, codigo);
    expect(tupla, `a tupla de ${codigo} não traz o rótulo`).toContain(rotulo);
    expect(tupla, `a tupla de ${codigo} não traz a ordem ${ordem}`).toMatch(
      new RegExp(`(^|[^0-9])${ordem}([^0-9]|$)`),
    );
    expect(tupla, `a tupla de ${codigo} não traz o tom`).toContain(`'${tom}'`);
  });

  /**
   * A PONTE COM O VOCABULÁRIO: a lista à mão acima e `ETAPAS_FUNIL_SEMENTE` têm de dizer a mesma
   * coisa. Sem este caso, as duas divergem no dia em que alguém editar uma só, e a semente do
   * banco passa a discordar do que o resto do código chama de etapa inicial.
   */
  it("a lista à mão concorda com ETAPAS_FUNIL_SEMENTE", () => {
    expect(ETAPAS_FUNIL_SEMENTE.map((e) => [e.codigo, e.rotulo, e.ordem, e.tom])).toEqual(
      AS_CINCO.map((e) => [e.codigo, e.rotulo, e.ordem, e.tom]),
    );
  });

  /**
   * ─ A CAPTAÇÃO É A ÚNICA INICIAL, e não é detalhe: `inicial` é o ÚNICO dono da pergunta "onde a
   * candidatura nasce?" desde que o `DEFAULT 'CAPTACAO'` da coluna foi removido. Duas iniciais
   * violam o índice parcial único e derrubam a migration; nenhuma inicial faz a criação do
   * primeiro candidato falhar, longe daqui e sem pista.
   */
  it("a CAPTACAO é marcada como inicial", () => {
    const sql = exigirMigration().sql;
    const tupla = exigirTupla(sql, "CAPTACAO");
    const marcadaNaTupla = /\btrue\b/i.test(tupla);
    const marcadaPorUpdate = /update[^;]*?set[^;]*?inicial[^;]*?true[^;]*?'CAPTACAO'/is.test(sql);
    expect(
      marcadaNaTupla || marcadaPorUpdate,
      "a etapa de nascimento da candidatura tem de sair marcada desta migration",
    ).toBe(true);
  });

  it.each(AS_CINCO.filter((e) => !e.inicial))("$codigo NÃO é marcada como inicial", ({ codigo }) => {
    const tupla = exigirTupla(exigirMigration().sql, codigo);
    expect(
      /\btrue\b/i.test(tupla),
      `${codigo} sai marcada como inicial. São duas iniciais, e o índice parcial único recusa a segunda`,
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. IDEMPOTÊNCIA: RODAR DUAS VEZES NÃO DUPLICA E NÃO DERRUBA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a reposição é idempotente", () => {
  /**
   * O `codigo` É UNIQUE, então o segundo INSERT sem `on conflict` não duplica: ele ESTOURA, e uma
   * migration que estoura derruba o boot do backend inteiro, não só o catálogo.
   */
  it("o INSERT tem ON CONFLICT", () => {
    expect(
      /on\s+conflict/i.test(exigirMigration().sql),
      "sem ON CONFLICT, rodar a reposição sobre um banco que já tem as etapas estoura o unique do código",
    ).toBe(true);
  });

  /**
   * ─ APAGAR PARA REPOR É O ATALHO QUE DESTRÓI DUAS COISAS DE UMA VEZ ──────────────────────────
   *
   * As três colunas que apontam para `as_etapas_funil` são FK RESTRICT, então o `delete` nem passa
   * quando alguém já andou pelo funil: a migration estoura na subida. E quando passa (banco vazio,
   * que é o caso de hoje), leva junto qualquer etapa que o diretor tenha cadastrado a mais.
   */
  it("não apaga nem trunca o catálogo para repor", () => {
    const sql = exigirMigration().sql;
    expect(/delete\s+from\s+"?as_etapas_funil"?/i.test(sql), "delete no catálogo do diretor").toBe(
      false,
    );
    expect(/truncate[^;]*as_etapas_funil/i.test(sql), "truncate no catálogo do diretor").toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. O CATÁLOGO É DO DIRETOR: A REPOSIÇÃO REPÕE O QUE FALTA E NÃO TOCA NO QUE EXISTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a reposição não sobrescreve o que o diretor editou", () => {
  /**
   * ┌─ O DEFEITO QUE ESTE CASO PEGA, e ele é o gesto mais natural de quem quer "garantir" a ─────┐
   * │ semente: `ON CONFLICT (codigo) DO UPDATE SET rotulo = excluded.rotulo`. Parece robusto e é │
   * │ destrutivo: o diretor renomeia "Triagem" para "Triagem Inicial" na tela dele, a subida     │
   * │ seguinte roda a migration, e o nome volta. Pior, o rótulo é resolvido por JOIN, então o    │
   * │ histórico INTEIRO daquela etapa volta a mostrar o nome antigo, e ninguém liga uma coisa à  │
   * │ outra.                                                                                     │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o ON CONFLICT é DO NOTHING, e nunca DO UPDATE", () => {
    const sql = exigirMigration().sql;
    expect(
      /on\s+conflict[^;]*?do\s+update/i.test(sql),
      "DO UPDATE reescreve rótulo, ordem ou tom por cima do catálogo do diretor na subida seguinte",
    ).toBe(false);
    expect(/on\s+conflict[^;]*?do\s+nothing/i.test(sql)).toBe(true);
  });

  /** O mesmo estrago pela outra porta: um UPDATE avulso do rótulo, fora do ON CONFLICT. */
  it("nenhum UPDATE reescreve o rótulo de etapa nenhuma", () => {
    const sql = exigirMigration().sql;
    const updates = sql.match(/update\s+"?as_etapas_funil"?[^;]*/gi) ?? [];
    for (const u of updates) {
      expect(/set[^;]*\brotulo\b/i.test(u), `este UPDATE reescreve o rótulo: ${u.slice(0, 160)}`).toBe(
        false,
      );
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. A SEXTA ETAPA, `STAND_BY`, E AS TRAVAS QUE ELA NÃO PODE QUEBRAR
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ┌─ POR QUE ESTE BLOCO EXISTE, E POR QUE ELE NÃO USA `exigirMigration` ───────────────────────────┐
 * │ `migrationDaReposicao` devolve a PRIMEIRA migration que insere no catálogo, que é a da         │
 * │ reposição das cinco. A sexta etapa nasce em OUTRA migration (0111, decisão do diretor de       │
 * │ 17/09/2026), e medir só a primeira deixaria a nova inteiramente fora da cobertura: ela poderia │
 * │ nascer inicial, ressuscitar o que o diretor inativou, ou sobrescrever rótulo, sem nenhum       │
 * │ vermelho no caminho. É o mesmo defeito de leitura parcial que o de/para acabou de pagar.       │
 * │                                                                                                │
 * │ ENTÃO AQUI SE LÊ O CATÁLOGO INTEIRO: todas as migrations que escrevem em `as_etapas_funil`.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function migrationsQueEscrevemNoCatalogo(): Migration[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      tag: f.replace(/\.sql$/, ""),
      sql: executavel(readFileSync(join(DIR, f), "utf8")),
    }))
    .filter((m) => /(insert\s+into|update)\s+"?as_etapas_funil"?/i.test(m.sql));
}

/** A migration que semeia a sexta etapa, descoberta pelo CÓDIGO dela e não pelo número do arquivo. */
function migrationDoStandBy(): Migration {
  const achada = migrationsQueEscrevemNoCatalogo().find((m) =>
    /insert\s+into\s+"?as_etapas_funil"?[^;]*'STAND_BY'/i.test(m.sql),
  );
  if (!achada) {
    throw new Error(
      "FALTA CONSTRUIR: nenhuma migration cria a etapa STAND_BY no catálogo. O de/para da 0111 " +
        "aponta para ela, e a FK RESTRICT de `as_depara_etapa_externa.etapa_codigo` derruba a " +
        "subida inteira quando o código não existe.",
    );
  }
  return achada;
}

const AS_QUE_NAO_SAO_INICIAIS = [
  "TRIAGEM",
  "ENTREVISTA_SOULAN",
  "ENTREVISTA_CLIENTE",
  "APROVACAO",
  "STAND_BY",
];

describe("a sexta etapa entra sem quebrar as travas da reposição", () => {
  /** ELA EXISTE, com o rótulo, a ordem e o tom decididos. */
  it("STAND_BY é semeada com rótulo, ordem 6 e tom", () => {
    const tupla = exigirTupla(migrationDoStandBy().sql, "STAND_BY");
    expect(tupla, "o rótulo da sexta etapa").toMatch(/'Stand By'/i);
    expect(tupla, "a ordem da sexta etapa").toMatch(/(^|[^0-9])6([^0-9]|$)/);
    expect(tupla, "o tom da sexta etapa").toMatch(/'(nt|in|wn|or|ok|er)'/i);
  });

  /**
   * ─ A CAPTAÇÃO CONTINUA SENDO A ÚNICA INICIAL, e esta é a trava que derruba a subida se cair ──
   *
   * O índice parcial único `as_etapas_funil_inicial_unica` recusa a segunda inicial, então uma
   * sexta etapa marcada como inicial não é um detalhe de catálogo: é a migration estourando no
   * boot do backend. A varredura é feita em TODAS as migrations do catálogo, e não só na da sexta.
   */
  it("nenhuma migration marca uma segunda inicial", () => {
    for (const m of migrationsQueEscrevemNoCatalogo()) {
      for (const insert of m.sql.match(/insert\s+into\s+"?as_etapas_funil"?[^;]*/gi) ?? []) {
        const colunas = insert.match(/\(([^)]*)\)/)?.[1] ?? "";
        if (!/\binicial\b/i.test(colunas)) continue;
        for (const codigo of AS_QUE_NAO_SAO_INICIAIS) {
          const tupla = tuplaDaEtapa(insert, codigo);
          if (!tupla) continue;
          expect(
            /\btrue\b/i.test(tupla),
            `${codigo} sai marcada como inicial em ${m.tag}: duas iniciais violam o índice ` +
              "parcial único e derrubam a migration no boot",
          ).toBe(false);
        }
      }
      for (const u of m.sql.match(/update\s+"?as_etapas_funil"?[^;]*/gi) ?? []) {
        if (!/set[^;]*\binicial\b[^;]*\btrue\b/i.test(u)) continue;
        expect(
          /'STAND_BY'/i.test(u),
          `um UPDATE promove a sexta etapa a inicial em ${m.tag}: ${u.slice(0, 160)}`,
        ).toBe(false);
        // A 0100 FICA DE FORA DESTA SEGUNDA EXIGÊNCIA, e o motivo é medido, não conveniência: o
        // UPDATE dela não cita etapa nenhuma, ele marca a de MENOR ORDEM e só quando não existe
        // inicial alguma (`NOT EXISTS`). Com a Captação em ordem 1, é ela que ele escolhe, e a
        // sexta, em ordem 6, é inalcançável por ele. Exigir o nome ali reprovaria um SQL correto.
        if (m.tag.startsWith("0100_")) continue;
        expect(
          /'CAPTACAO'/i.test(u),
          `um UPDATE marca como inicial algo que não é a Captação, em ${m.tag}: ${u.slice(0, 160)}`,
        ).toBe(true);
      }
    }
  });

  /**
   * ─ A SEXTA NÃO RESSUSCITA NADA ───────────────────────────────────────────────────────────────
   *
   * `ativa` FORA do INSERT, somado ao `DO NOTHING`, é o que garante que uma etapa inativada pelo
   * diretor continue inativa: com a coluna no INSERT e um `DO UPDATE`, ou com um UPDATE avulso, a
   * subida seguinte devolveria ao seletor uma etapa que ele tirou de circulação de propósito.
   */
  it("a semente da sexta não reativa etapa nenhuma", () => {
    const sql = migrationDoStandBy().sql;
    const insert =
      sql.match(/insert\s+into\s+"?as_etapas_funil"?[^;]*'STAND_BY'[^;]*/i)?.[0] ?? "";
    const colunas = insert.match(/\(([^)]*)\)/)?.[1] ?? "";
    expect(
      /\bativa\b/i.test(colunas),
      "`ativa` no INSERT abre a porta para ressuscitar o que o diretor inativou",
    ).toBe(false);
    for (const u of sql.match(/update\s+"?as_etapas_funil"?[^;]*/gi) ?? []) {
      expect(/set[^;]*\bativa\b/i.test(u), `este UPDATE reativa etapa: ${u.slice(0, 160)}`).toBe(
        false,
      );
    }
  });

  /** O MESMO `DO NOTHING` DA REPOSIÇÃO: a subida não escreve por cima do catálogo editado na tela. */
  it("a semente da sexta é idempotente e não sobrescreve o catálogo", () => {
    const sql = migrationDoStandBy().sql;
    expect(/on\s+conflict[^;]*?do\s+nothing/i.test(sql)).toBe(true);
    expect(
      /on\s+conflict[^;]*?do\s+update/i.test(sql),
      "DO UPDATE devolve o catálogo ao que a fábrica achou em setembro, a cada subida",
    ).toBe(false);
    expect(/delete\s+from\s+"?as_etapas_funil"?/i.test(sql)).toBe(false);
    expect(/truncate[^;]*as_etapas_funil/i.test(sql)).toBe(false);
  });

  /**
   * ─ A MIGRATION DA SEXTA PRECISA ESTAR NO JOURNAL, e é o mesmo silêncio do bloco 1 ─────────────
   *
   * Arquivo `.sql` fora do `_journal.json` existe, ninguém o roda, e o banco fica sem a etapa. Aqui
   * o estrago é maior do que uma etapa faltando: o de/para da mesma migration aponta para
   * `STAND_BY`, e os dois statements estão no MESMO arquivo, então ou os dois rodam ou nenhum roda.
   */
  it("a migration da sexta etapa está registrada no _journal.json", () => {
    const journal = JSON.parse(readFileSync(join(DIR, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const tags = journal.entries.map((e) => e.tag);
    expect(tags, `tags de hoje: ${JSON.stringify(tags.slice(-5))}`).toContain(
      migrationDoStandBy().tag,
    );
  });

  /**
   * A SEXTA NÃO ENTRA NO VOCABULÁRIO COMPARTILHADO, e isso é desenho: `ETAPAS_FUNIL_SEMENTE` é o
   * vocabulário das CINCO originais, tem dono único (§A.39, o coordenador) e é conferido contra a
   * reposição. Quem lê as etapas lê a TABELA, e uma sexta constante ali faria o `shared-types`
   * passar a perseguir o catálogo do diretor, que muda por tela.
   */
  it("STAND_BY NÃO entra em ETAPAS_FUNIL_SEMENTE", () => {
    expect(
      ETAPAS_FUNIL_SEMENTE.map((e) => e.codigo),
      "o vocabulário compartilhado é o das cinco originais, e o catálogo vivo mora na tabela",
    ).not.toContain("STAND_BY");
  });
});
