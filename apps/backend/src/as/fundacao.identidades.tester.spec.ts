import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";

/**
 * ─ FUNDAÇÃO DA PLATAFORMA UNIFICADORA, PEÇA 1: A FORMA DA TABELA DE IDENTIDADES EXTERNAS ───────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita JUNTO com a construção (§A.40, regra 2) e ANTES do
 * código existir. Nada aqui foi lido da implementação, porque não há implementação: o contrato vem
 * do requisito, `docs/MAPA-ALCANCE-FUNDACAO-UNIFICADORA.md`, seção 8.
 *
 * ┌─ POR QUE ESTA FRENTE SE MEDE NA FORMA DO DADO, E ISSO É ESCOLHA, NÃO PREGUIÇA ──────────────┐
 * │ A tabela nasce SEM ESCRITOR (seção 4 do mapa: "NINGUÉM ainda"). Não há serviço para exercitar│
 * │ e não há comportamento para observar, então o único lugar onde esta entrega pode estar errada│
 * │ é a FORMA, e forma errada não falha no dia da entrega: ela cobra na ingestão, meses depois.  │
 * │                                                                                             │
 * │ E O ERRO MAIS CARO AQUI É UM UNIQUE A MAIS, não um a menos. Um `unique (candidato_id,        │
 * │ fonte)` parece a régua óbvia de quem está criando a tabela ("uma identidade por fonte por    │
 * │ pessoa"), e é exatamente o contrário do que a OST pede: sem duas linhas da MESMA fonte para  │
 * │ a MESMA pessoa não há o que deduplicar depois, e a deduplicação é a razão inteira da tabela. │
 * │ Ele passaria em qualquer teste de serviço, porque não há serviço, e só apareceria no dia em  │
 * │ que a ingestão estourasse `duplicate key` em produção.                                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ A TABELA É DESCOBERTA PELO NOME SQL, e não pelo nome da constante exportada ────────────────
 * `as_identidades_externas` é o nome que a migration escreve e o que qualquer consulta futura vai
 * falar. O nome da constante TypeScript é escolha de quem digita, e um teste que morre porque ela
 * se chama `asIdentidadeExterna` estaria medindo gosto.
 *
 * §A.6: nenhum dado pessoal entra neste arquivo. Nomes de coluna, tipos e restrições.
 */

const TABELA = "as_identidades_externas";

type TabelaDoSchema = Parameters<typeof getTableConfig>[0];

function tabela(nomeSql: string): TabelaDoSchema | null {
  for (const valor of Object.values(schema as Record<string, unknown>)) {
    try {
      const cfg = getTableConfig(valor as TabelaDoSchema);
      if (cfg.name === nomeSql) return valor as TabelaDoSchema;
    } catch {
      // Não é uma tabela do drizzle (enum, helper, constante). Segue.
    }
  }
  return null;
}

function exigirTabela(nomeSql: string): TabelaDoSchema {
  const t = tabela(nomeSql);
  if (!t) {
    throw new Error(
      `FALTA CONSTRUIR: não existe a tabela "${nomeSql}" no schema do drizzle ` +
        `(apps/backend/src/db/schema/tables.ts). Requisito: seção 8 do mapa de alcance.`,
    );
  }
  return t;
}

function config(nomeSql: string) {
  return getTableConfig(exigirTabela(nomeSql));
}

function colunas(nomeSql: string) {
  return config(nomeSql).columns;
}

function coluna(nomeSql: string, nomeColuna: string) {
  const achada = colunas(nomeSql).find((c) => c.name === nomeColuna);
  if (!achada) {
    throw new Error(
      `FALTA CONSTRUIR: a tabela "${nomeSql}" não tem a coluna "${nomeColuna}". ` +
        `Colunas de hoje: ${JSON.stringify(colunas(nomeSql).map((c) => c.name))}`,
    );
  }
  return achada;
}

/**
 * ─ TODA MIGRATION QUE FALA DESTA TABELA, LIDA DO DISCO ────────────────────────────────────────
 *
 * Lida, e não uma lista digitada: a migration nova ganha número a cada geração do drizzle-kit, e
 * fixar o número aqui quebraria o teste na geração seguinte.
 *
 * O COMENTÁRIO É APAGADO ANTES DE QUALQUER LEITURA, e essa defesa não é teórica nesta fábrica: a
 * frase que EXPLICA a restrição usa as mesmas palavras da restrição, então procurar "unique" no
 * texto cru fica verde com a restrição apagada e o comentário no lugar.
 */
function sqlDasMigrations(assunto: RegExp): string {
  const dir = join(__dirname, "..", "..", "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .filter((texto) => assunto.test(texto))
    .map((texto) =>
      texto
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join(" ")
        .replace(/\s+/g, " ")
        .toLowerCase(),
    )
    .join(" ");
}

const SQL_DA_TABELA = sqlDasMigrations(/as_identidades_externas/i);

/** O texto de um `check()` declarado no schema, para ler a lista fechada de dentro dele. */
function textoDoSql(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (Array.isArray(no)) return no.map(textoDoSql).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(textoDoSql).join(" ");
  if ("value" in o && "encoder" in o) return textoDoSql(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(textoDoSql).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/**
 * TODA RESTRIÇÃO DA TABELA, venha ela do schema ou da migration.
 *
 * A UNIÃO DAS DUAS FONTES É DELIBERADA: nem toda restrição é declarável no drizzle (o índice
 * parcial `as_etapas_funil_inicial_unica` mora só na migration, e é precedente da própria casa), e
 * exigir que ela esteja no schema seria escolher o desenho por quem constrói.
 */
function textoDasRestricoes(nomeSql: string): string {
  const cfg = config(nomeSql);
  const doSchema = [
    ...cfg.checks.map((c) => `${c.name} ${textoDoSql((c as unknown as { value: unknown }).value)}`),
    ...cfg.uniqueConstraints.map((u) => `unique ${u.name} (${u.columns.map((c) => c.name).join(",")})`),
    ...cfg.indexes.map((i) => {
      const cfgIdx = (i as unknown as { config: { unique?: boolean; name?: string; columns?: unknown[] } }).config;
      const nomes = (cfgIdx.columns ?? []).map((c) => (c as { name?: string }).name ?? "").join(",");
      return `${cfgIdx.unique ? "unique index" : "index"} ${cfgIdx.name ?? ""} (${nomes})`;
    }),
  ].join(" ");
  return `${doSchema} ${SQL_DA_TABELA}`.toLowerCase();
}

/**
 * OS CONJUNTOS DE COLUNAS DE CADA RESTRIÇÃO ÚNICA, do schema E da migration.
 *
 * É sobre esta lista que a asserção mais importante do arquivo é feita, então ela precisa enxergar
 * as DUAS formas de declarar unicidade: a do drizzle e a do SQL cru.
 */
function uniquesDaTabela(nomeSql: string): string[][] {
  const cfg = config(nomeSql);
  const doSchema: string[][] = [
    ...cfg.uniqueConstraints.map((u) => u.columns.map((c) => c.name)),
    ...cfg.indexes
      .filter((i) => (i as unknown as { config: { unique?: boolean } }).config.unique === true)
      .map((i) =>
        ((i as unknown as { config: { columns?: unknown[] } }).config.columns ?? []).map(
          (c) => (c as { name?: string }).name ?? "",
        ),
      ),
    ...cfg.columns.filter((c) => c.isUnique).map((c) => [c.name]),
  ];

  // As duas formas do SQL cru: `create unique index ... on tabela (a, b)` e `unique (a, b)` dentro
  // do `create table`.
  const doSql: string[][] = [];
  const padraoIndice = new RegExp(
    `create\\s+unique\\s+index[^;]*?on\\s+"?${nomeSql}"?\\s*\\(([^)]*)\\)`,
    "g",
  );
  for (const m of SQL_DA_TABELA.matchAll(padraoIndice)) {
    doSql.push(m[1]!.split(",").map((c) => c.replace(/["'\s]/g, "")));
  }
  /*
   * O CORPO DO `create table` TERMINA NO `;`, e essa fronteira não é detalhe: sem ela, a leitura
   * escorregava para DENTRO da tabela seguinte do mesmo arquivo de migration e lia o unique DELA
   * como se fosse desta. O primeiro vermelho deste arquivo foi exatamente esse, e acusava
   * `unique (fonte, chave_externa)`, que é do de/para.
   */
  const criacao = SQL_DA_TABELA.match(
    new RegExp(`create\\s+table[^;]*?"?${nomeSql}"?\\s*\\(([^;]*)`),
  );
  if (criacao) {
    for (const m of criacao[1]!.matchAll(/unique\s*\(([^)]*)\)/g)) {
      doSql.push(m[1]!.split(",").map((c) => c.replace(/["'\s]/g, "")));
    }
  }
  return [...doSchema, ...doSql].map((cols) => cols.filter(Boolean).sort());
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A TABELA EXISTE, COM AS COLUNAS QUE O REQUISITO NOMEIA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a tabela de identidades externas existe, com as colunas da seção 8 do mapa", () => {
  it("tem candidato_id, fonte, identificador e coletado_em", () => {
    const nomes = colunas(TABELA).map((c) => c.name);
    for (const esperada of ["candidato_id", "fonte", "identificador", "coletado_em"]) {
      expect(nomes, `falta a coluna ${esperada}`).toContain(esperada);
    }
  });

  it("tem os dois carimbos da casa (criado_em e atualizado_em)", () => {
    const nomes = colunas(TABELA).map((c) => c.name);
    expect(nomes).toContain("criado_em");
    expect(nomes).toContain("atualizado_em");
  });

  /**
   * A LINHA APONTA PARA UMA PESSOA E A LIGAÇÃO É OBRIGATÓRIA: identidade externa sem dono é um
   * identificador de terceiro guardado por ninguém, que é retenção sem finalidade (§A.6).
   */
  it("candidato_id é obrigatório", () => {
    expect(coluna(TABELA, "candidato_id").notNull).toBe(true);
  });

  it("fonte e identificador são obrigatórios", () => {
    expect(coluna(TABELA, "fonte").notNull).toBe(true);
    expect(coluna(TABELA, "identificador").notNull).toBe(true);
  });

  /**
   * ─ A FK É CASCADE, E ISSO É O PISO DO EXPURGO, NÃO O EXPURGO ─────────────────────────────────
   *
   * O expurgo por retenção ANONIMIZA e PRESERVA a linha do candidato, então o cascade NUNCA
   * dispara por ele: quem apaga a identidade naquele caminho é o próprio serviço, e isso está
   * medido em `fundacao.expurgo-identidades.tester.spec.ts`. O cascade cobre o OUTRO caminho, o
   * `delete` de verdade de um candidato, e sem ele a linha de identidade sobreviveria à pessoa,
   * apontando para um id que não existe mais.
   */
  it("candidato_id cai junto com o candidato apagado (FK CASCADE)", () => {
    const fks = config(TABELA).foreignKeys.map((fk) => fk.reference());
    const doCandidato = fks.find((r) => r.columns.some((c) => c.name === "candidato_id"));
    expect(
      doCandidato,
      `candidato_id não tem FK. FKs de hoje: ${JSON.stringify(fks.map((r) => r.columns.map((c) => c.name)))}`,
    ).toBeDefined();
    expect(
      config(TABELA).foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "candidato_id"),
      )!.onDelete,
      "a FK do candidato tem de ser CASCADE",
    ).toBe("cascade");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. AS TRÊS PERGUNTAS DE UNICIDADE, QUE SÃO O CORAÇÃO DESTA TABELA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a unicidade: uma identidade externa não aponta para duas pessoas, e só isso", () => {
  /**
   * A MESMA IDENTIDADE EXTERNA NÃO PODE APONTAR PARA DUAS PESSOAS. Sem esta restrição, o mesmo
   * `IdPreCollaborator` do Pandapé pode nascer ligado a dois candidatos, e a deduplicação futura
   * passa a ter de escolher qual das duas pessoas é a dona de um id que é único NA ORIGEM.
   */
  it("existe UNIQUE (fonte, identificador)", () => {
    expect(
      uniquesDaTabela(TABELA),
      `uniques de hoje (schema + migration): ${JSON.stringify(uniquesDaTabela(TABELA))}`,
    ).toContainEqual(["fonte", "identificador"]);
  });

  /**
   * ┌─ O TESTE QUE EXISTE PARA PEGAR O UNIQUE A MAIS ─────────────────────────────────────────────┐
   * │ A REGRA É UMA SÓ E COBRE OS DOIS CASOS DA OST: toda restrição única desta tabela TEM DE      │
   * │ INCLUIR `identificador`. Quem inclui o identificador nunca impede duas linhas da mesma       │
   * │ pessoa, porque os identificadores são diferentes; quem NÃO o inclui só pode estar limitando  │
   * │ a pessoa, que é o que a OST proíbe.                                                          │
   * │                                                                                              │
   * │ ELA MATA `unique (candidato_id, fonte)` (a pessoa deixaria de ter dois registros na MESMA    │
   * │ fonte, e é justamente esse par que a deduplicação vai resolver) E MATA `unique (candidato_id)│
   * │ (a pessoa deixaria de ter identidade em DUAS fontes, que é a função inteira da tabela).      │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("NENHUM unique limita a pessoa: todos incluem o identificador", () => {
    for (const cols of uniquesDaTabela(TABELA)) {
      expect(
        cols,
        `o unique (${cols.join(", ")}) impede a mesma pessoa de ter mais de uma identidade. ` +
          `Duas fontes para a mesma pessoa e duas linhas da MESMA fonte são o requisito, não o defeito.`,
      ).toContain("identificador");
    }
  });

  /**
   * O MESMO, DITO PELO AVESSO E POR ESCRITO, porque o caso acima é uma regra derivada e regra
   * derivada some quando alguém "simplifica" o laço. Este cita o par proibido pelo nome.
   */
  it("NÃO existe unique em (candidato_id, fonte): é ele que permitiria a deduplicação futura", () => {
    expect(uniquesDaTabela(TABELA)).not.toContainEqual(["candidato_id", "fonte"]);
    expect(uniquesDaTabela(TABELA)).not.toContainEqual(["candidato_id"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ORIGEM E DATA DE COLETA POR REGISTRO (exigência E5 do protocolo LGPD)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("origem e data de coleta nascem por linha, sem ninguém preencher (E5)", () => {
  /**
   * `coletado_em` PREENCHIDA PELO BANCO, e não pelo chamador, porque a exigência E5 é sobre a
   * linha EXISTIR com data, e não sobre alguém lembrar de passá-la. Um insert futuro que esqueça o
   * campo é um registro de dado pessoal sem data de coleta, que é o que a E5 proíbe.
   */
  it("coletado_em é NOT NULL e tem default do banco", () => {
    const c = coluna(TABELA, "coletado_em");
    expect(c.notNull, "coletado_em sem NOT NULL deixa nascer registro sem data de coleta").toBe(true);
    expect(c.hasDefault, "sem default, a data depende de o chamador lembrar de passá-la").toBe(true);
  });

  /**
   * A LISTA FECHADA DE FONTES É O QUE SEPARA "origem" DE "texto livre". Sem o CHECK, a fonte vira
   * campo digitado, e `PANDAPE`, `pandape` e `Pandapé` viram três origens diferentes para o mesmo
   * sistema, cada uma com o seu unique próprio.
   */
  it("fonte é uma lista FECHADA, por CHECK, e não texto livre", () => {
    const restricoes = textoDasRestricoes(TABELA);
    expect(
      /check/.test(restricoes) && /fonte/.test(restricoes),
      `nenhum CHECK sobre "fonte". Restrições de hoje: ${restricoes}`,
    ).toBe(true);
    expect(
      /'pandape'|"pandape"/.test(restricoes),
      "o Pandapé é a fonte que a frente inteira nomeia (seções 3 e 4 do mapa) e tem de estar na lista",
    ).toBe(true);
  });

  it("fonte cabe em varchar curto: é código de sistema, não nome de sistema", () => {
    const c = coluna(TABELA, "fonte") as unknown as { size?: number; columnType: string };
    expect(c.columnType).toMatch(/varchar/i);
    expect(c.size ?? 0).toBeLessThanOrEqual(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. MINIMIZAÇÃO: A TABELA GUARDA ID TÉCNICO, FONTE E DATA. NADA MAIS (§A.6, seção 7 do mapa)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a tabela não vira espelho da fonte (§A.6, minimização)", () => {
  /**
   * ─ O QUE ESTE TESTE IMPEDE, E ELE É O D2 DO PARECER ─────────────────────────────────────────
   *
   * O gesto natural de quem liga uma integração é guardar "o que veio junto": nome, e-mail,
   * telefone, para "não ter de consultar de novo". Isso transforma a tabela num SEGUNDO cadastro
   * de pessoas, com retenção própria, fora do alcance do expurgo que já existe, e ninguém
   * percebe porque tudo continua funcionando.
   *
   * A LISTA É DIGITADA À MÃO, e não derivada de constante nenhuma, justamente para não encolher
   * junto com o que ela vigia.
   */
  it("não tem coluna de dado pessoal: sem nome, e-mail, telefone, CPF ou nascimento", () => {
    const proibidas = colunas(TABELA)
      .map((c) => c.name)
      .filter((n) => /nome|email|e_mail|telefone|celular|cpf|nascimento|endereco|curriculo/i.test(n));
    expect(
      proibidas,
      "a tabela guarda id técnico, fonte e data de coleta, e nada mais (seção 7 do mapa)",
    ).toEqual([]);
  });

  /** Seis colunas é o desenho da seção 8. Mais do que isso pede explicação, e o vermelho a pede. */
  it("tem SEIS colunas mais o id, e nenhuma carona", () => {
    const nomes = colunas(TABELA).map((c) => c.name).sort();
    expect(nomes).toEqual(
      ["atualizado_em", "candidato_id", "coletado_em", "criado_em", "fonte", "id", "identificador"],
    );
  });
});
