import "reflect-metadata";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { AS_CANDIDATO_ORIGEM } from "@ea/shared-types";
import * as schema from "../db/schema";
import * as dtosDoModulo from "./candidatos/candidatos.dto";

/**
 * ─ FECHAMENTO DA FUNDAÇÃO, PEÇA A: A ORIGEM VIRA SÓ O SISTEMA, E A RETENÇÃO SAI DE DENTRO DELA ─
 *
 * COBERTURA INDEPENDENTE (§A.38) escrita JUNTO com a construção (§A.40 regra 2), a partir do
 * requisito (`docs/MAPA-ALCANCE-FECHAMENTO-FUNDACAO.md`, seções 1 e 4) e não da implementação, que
 * ainda não existe. TUDO AQUI NASCE VERMELHO, e o vermelho é a especificação.
 *
 * ┌─ O QUE ESTA PEÇA PROTEGE, E POR QUE ELA SE MEDE NA FORMA ───────────────────────────────────┐
 * │ Um campo respondia TRÊS perguntas, e a do meio concedia VIDA ETERNA A DADO PESSOAL: escolher │
 * │ "Banco De Talentos" num seletor de origem isentava a pessoa do expurgo para sempre, sem      │
 * │ papel, sem rastro e sem ninguém perceber que aquilo não era origem de nada.                  │
 * │                                                                                             │
 * │ A SEPARAÇÃO SÓ É DE GRAÇA HOJE, com `as_candidatos` em ZERO linhas nos dois bancos. Depois   │
 * │ da ingestão ligada, a mesma mudança vira migração de dado pessoal, e é por isso que a        │
 * │ migration TEM DE PROVAR a tabela vazia antes de recriar o tipo, em vez de confiar numa       │
 * │ contagem feita ontem por uma pessoa.                                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal entra neste arquivo. O que se lê é nome de coluna, valor de catálogo e
 * texto de migration.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0. AS FERRAMENTAS (o padrão da casa: descobrir pelo nome SQL, ler a migration sem comentário)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

type TabelaDoSchema = Parameters<typeof getTableConfig>[0];

function tabela(nomeSql: string): TabelaDoSchema | null {
  for (const valor of Object.values(schema as Record<string, unknown>)) {
    try {
      if (getTableConfig(valor as TabelaDoSchema).name === nomeSql) return valor as TabelaDoSchema;
    } catch {
      // Não é tabela do drizzle (enum, helper, constante). Segue.
    }
  }
  return null;
}

function config(nomeSql: string) {
  const t = tabela(nomeSql);
  if (!t) throw new Error(`Não existe a tabela "${nomeSql}" no schema do drizzle.`);
  return getTableConfig(t);
}

function nomesDasColunas(nomeSql: string): string[] {
  return config(nomeSql).columns.map((c) => c.name);
}

function coluna(nomeSql: string, nomeColuna: string) {
  const achada = config(nomeSql).columns.find((c) => c.name === nomeColuna);
  if (!achada) {
    throw new Error(
      `FALTA CONSTRUIR: a tabela "${nomeSql}" não tem a coluna "${nomeColuna}". ` +
        `Colunas de hoje: ${JSON.stringify(nomesDasColunas(nomeSql))}`,
    );
  }
  return achada;
}

const DIR_MIGRATIONS = join(__dirname, "..", "..", "drizzle");

/**
 * O TEXTO DE CADA MIGRATION, SEM COMENTÁRIO E SEM CAIXA.
 *
 * A linha de comentário sai ANTES de qualquer leitura, e essa defesa não é teórica nesta fábrica:
 * a frase que EXPLICA a guarda usa as mesmas palavras da guarda, então procurar "raise exception"
 * no texto cru fica verde com a guarda apagada e a explicação no lugar.
 */
function migrations(): { arquivo: string; sql: string }[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      arquivo: f,
      sql: readFileSync(join(DIR_MIGRATIONS, f), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .replace(/\s+/g, " ")
        .toLowerCase(),
    }));
}

/** O código de um arquivo do backend, também sem comentário: só o que EXECUTA. */
function codigoSemComentario(caminhoRelativo: string): string {
  return readFileSync(join(__dirname, caminhoRelativo), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. O VOCABULÁRIO: `origem` responde UMA pergunta, e `BANCO_TALENTOS` não é resposta dela
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o vocabulário de origem passou a ser só o sistema de onde a pessoa veio", () => {
  it("BANCO_TALENTOS não é mais valor de origem", () => {
    expect(
      AS_CANDIDATO_ORIGEM as readonly string[],
      "retenção não é origem: enquanto ela for um item do seletor, conceder vida eterna a dado " +
        "pessoal continua sendo uma escolha de lista como outra qualquer",
    ).not.toContain("BANCO_TALENTOS");
  });

  it("DIGAI é valor de origem, porque é o segundo sistema de onde a plataforma puxa", () => {
    expect(AS_CANDIDATO_ORIGEM as readonly string[]).toContain("DIGAI");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O ENUM DO BANCO CONCORDA COM O VOCABULÁRIO, VALOR POR VALOR
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE A COMPARAÇÃO É PELO CONJUNTO INTEIRO, E NÃO POR "contém DIGAI" ────────────────────
 *
 * As duas metades da separação falham de jeitos opostos e igualmente caros: deixar `BANCO_TALENTOS`
 * no tipo do Postgres mantém viva a porta que a frente existe para fechar (nada impede um `update`
 * direto, um seed ou uma importação de voltar a gravá-lo), e esquecer `DIGAI` faz a ingestão do
 * segundo sistema estourar `invalid input value for enum` no dia em que ela ligar. Comparar o
 * conjunto pega as duas de uma vez, e pega também o valor a mais que ninguém pediu.
 */
describe("o tipo do Postgres e o vocabulário dizem a mesma coisa", () => {
  it("o enum da coluna `origem` tem EXATAMENTE os valores do vocabulário", () => {
    const doBanco = (coluna("as_candidatos", "origem") as unknown as { enumValues?: string[] })
      .enumValues;
    expect(
      doBanco,
      "a coluna `origem` deixou de ser um enum do Postgres. A lista fechada é o que impede um " +
        "valor digitado de virar origem nova em silêncio",
    ).toBeDefined();
    expect([...(doBanco ?? [])].sort()).toEqual([...AS_CANDIDATO_ORIGEM].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A PORTA DE ENTRADA: o corpo da requisição também recusa o valor velho
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * O ENUM SOZINHO NÃO BASTA COMO RECUSA. Ele derruba a gravação com um 500 do driver, e quem manda
 * o corpo recebe "erro interno" em vez de "valor inválido". O `@IsIn` é quem devolve a frase, e é
 * ele que a tela lê. As duas camadas existem, e esta cobre a de cima.
 */
describe("o corpo da requisição recusa a origem velha e aceita a nova", () => {
  const CORPO_MINIMO = { nome: "Fulano Inventado De Teste" };

  function violacoesDeOrigem(classe: string, origem: string): string[] {
    const Dto = (dtosDoModulo as unknown as Record<string, new () => object>)[classe];
    if (!Dto) throw new Error(`Não existe a classe de corpo "${classe}" em candidatos.dto.ts.`);
    return validateSync(plainToInstance(Dto, { ...CORPO_MINIMO, origem }) as object)
      .filter((e) => e.property === "origem")
      .map((e) => JSON.stringify(e.constraints ?? {}));
  }

  it.each(["CriarCandidatoDto", "EditarCandidatoDto"])(
    "%s recusa origem BANCO_TALENTOS",
    (classe) => {
      expect(
        violacoesDeOrigem(classe, "BANCO_TALENTOS"),
        "o corpo ainda aceita o valor que saiu do vocabulário",
      ).not.toEqual([]);
    },
  );

  it.each(["CriarCandidatoDto", "EditarCandidatoDto"])("%s aceita origem DIGAI", (classe) => {
    expect(violacoesDeOrigem(classe, "DIGAI")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A RETENÇÃO VIRA CAMPO PRÓPRIO, BOOLEANO, E NASCE DESLIGADA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a retenção é `as_candidatos.banco_talentos`, e o padrão dela é NÃO reter", () => {
  it("a coluna existe e é booleana", () => {
    const c = coluna("as_candidatos", "banco_talentos") as unknown as { columnType: string };
    expect(
      c.columnType,
      "retenção é sim ou não. Texto ou enum aqui reabriria a porta de guardar TRÊS perguntas num " +
        "campo só, que é o defeito que esta frente veio desfazer",
    ).toMatch(/boolean/i);
  });

  it("é NOT NULL com DEFAULT false: a vida eterna nunca é o padrão", () => {
    const c = coluna("as_candidatos", "banco_talentos");
    expect(c.notNull, "coluna anulável faz `null` virar um terceiro estado sem dono").toBe(true);
    expect(c.hasDefault, "sem default, a linha nasce dependendo de alguém lembrar de passar o campo").toBe(true);
    expect(
      c.default,
      "o padrão TEM de ser false: um default true isentaria do expurgo todo mundo que entrar",
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. A MIGRATION PROVA A TABELA VAZIA ANTES DE RECRIAR O TIPO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE ESTA É A ASSERÇÃO MAIS IMPORTANTE DESTA PEÇA ──────────────────────────────────────
 *
 * O Postgres NÃO apaga valor de enum, então tirar `BANCO_TALENTOS` significa RECRIAR o tipo. Isso é
 * seguro hoje por um motivo só: não há linha para converter. A contagem que provou isso foi feita
 * numa data; a migration roda em outra, e entre as duas cabe a primeira ingestão.
 *
 * SEM A GUARDA, a migration que rodar numa base já povoada converte a coluna para o tipo novo e,
 * na melhor das hipóteses, estoura no meio do deploy. A guarda faz o caminho falhar ANTES de tocar
 * em dado, que é o comportamento seguro (§A.33 aplicado a dado pessoal: abster-se, nunca chutar).
 */
describe("a migration da separação aborta se a tabela não estiver vazia", () => {
  /** A migration desta frente é a que fala do vocabulário novo, e não um número digitado à mão. */
  function migrationDoVocabulario() {
    const achadas = migrations().filter(
      (m) => m.sql.includes("as_candidato_origem") && m.sql.includes("digai"),
    );
    if (achadas.length === 0) {
      throw new Error(
        "FALTA CONSTRUIR: nenhuma migration em apps/backend/drizzle recria o tipo " +
          "`as_candidato_origem` com o valor DIGAI (seção 1 do mapa de alcance).",
      );
    }
    return achadas[achadas.length - 1]!;
  }

  it("existe a migration que recria o tipo com o vocabulário novo", () => {
    expect(migrationDoVocabulario().arquivo).toMatch(/\.sql$/);
  });

  it("ela LEVANTA EXCEÇÃO quando `as_candidatos` tem linha", () => {
    const m = migrationDoVocabulario();
    expect(
      /raise\s+exception/.test(m.sql),
      `${m.arquivo} recria o tipo sem provar que a tabela está vazia. A contagem de ontem não ` +
        `protege a execução de amanhã (seção 1 do mapa).`,
    ).toBe(true);
    expect(
      /(count\s*\(|exists\s*\()[^;]{0,200}as_candidatos/.test(m.sql) ||
        /from\s+"?as_candidatos"?/.test(m.sql),
      `${m.arquivo} tem um raise, mas ele não conta as linhas de as_candidatos`,
    ).toBe(true);
  });

  it("a guarda vem ANTES de mexer no tipo, e não depois", () => {
    const m = migrationDoVocabulario();
    const guarda = m.sql.search(/raise\s+exception/);
    const mexeNoTipo = m.sql.search(/(create|alter)\s+type\s+"?(public\.)?"?as_candidato_origem/);
    if (mexeNoTipo < 0) return; // o desenho pode recriar por outro caminho; a ordem só vale se ele existe.
    expect(
      guarda >= 0 && guarda < mexeNoTipo,
      "guarda depois da conversão não guarda nada: quando ela falar, o dado já foi tocado",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. AS GAVETAS VELHAS CAEM, COM GUARDA DENTRO DA MIGRATION
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const GAVETAS = [
  ["as_candidatos", "id_candidate_pandape"],
  ["as_candidaturas", "id_match_pandape"],
] as const;

describe("as duas colunas de identificador externo são derrubadas", () => {
  it.each(GAVETAS)("%s não tem mais a coluna %s", (tabelaSql, colunaSql) => {
    expect(
      nomesDasColunas(tabelaSql),
      "a identidade externa tem UM dono dentro do módulo A&S, e é `as_identidades_externas`. " +
        "Coluna paralela é uma segunda gaveta de identificador pessoal, fora daquele desenho",
    ).not.toContain(colunaSql);
  });

  /**
   * ─ A GUARDA VAI DENTRO DA MIGRATION, e a razão é a mesma da seção 5 ──────────────────────────
   *
   * `pg_dump` das duas colunas como backup está VETADO pelo protocolo de LGPD (exportar
   * identificador pessoal para arquivo), então com zero linhas não há o que salvar. O que resta é
   * a contagem: zero valores, apaga; um valor que apareceu no meio, ABORTA em vez de apagar.
   */
  it.each(GAVETAS)(
    "a migration que apaga %s.%s aborta se houver valor não nulo, antes do DROP",
    (tabelaSql, colunaSql) => {
      const dropando = migrations().filter((m) =>
        new RegExp(`drop\\s+column[^;]{0,40}${colunaSql}`).test(m.sql),
      );
      expect(
        dropando.map((m) => m.arquivo),
        `FALTA CONSTRUIR: nenhuma migration derruba ${tabelaSql}.${colunaSql} (seção 4 do mapa).`,
      ).not.toEqual([]);

      for (const m of dropando) {
        const drop = m.sql.search(new RegExp(`drop\\s+column[^;]{0,40}${colunaSql}`));
        const antes = m.sql.slice(0, drop);
        expect(
          /raise\s+exception/.test(antes),
          `${m.arquivo} apaga ${colunaSql} sem guarda. A contagem de ontem não protege a ` +
            `execução de amanhã: um valor que apareceu no meio seria apagado em silêncio.`,
        ).toBe(true);
        expect(
          antes.includes(colunaSql) && /is\s+not\s+null/.test(antes),
          `${m.arquivo} tem uma guarda, mas ela não conta os valores NÃO NULOS de ${colunaSql}`,
        ).toBe(true);
      }
    },
  );

  /**
   * ORDEM OBRIGATÓRIA DA SEÇÃO 4 DO MAPA: o código para de escrever PRIMEIRO, a migration derruba a
   * coluna DEPOIS. Um serviço que ainda cite a coluna derrubada não falha no teste de ninguém: ele
   * falha na primeira gravação em produção.
   */
  it.each(["candidatos/candidatos.dto.ts", "candidatos/candidatos.service.ts"])(
    "%s não escreve mais identificador externo do ATS",
    (arquivo) => {
      const codigo = codigoSemComentario(arquivo);
      for (const proibido of ["idCandidatePandape", "idMatchPandape"]) {
        expect(
          codigo.includes(proibido),
          `${arquivo} ainda cita ${proibido} em código executável`,
        ).toBe(false);
      }
    },
  );
});
