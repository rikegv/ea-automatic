import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ─ O UNIQUE DO NÚMERO DO PANDAPÉ E O CHECK QUE O SUSTENTA: OS CONTRATOS DO AUTOR (0150 + 0151) ──
 *
 * A cobertura do REQUISITO está nos arquivos do `tester` (§A.38), e este NÃO os repete: lá se mede
 * que o índice existe, é unique, é parcial, que vários nulos convivem e que número repetido é
 * recusado. ESTE mede a propriedade que o conserto da 0151 introduziu e que, se quebrar, quebra em
 * SILÊNCIO, porque o sintoma não aparece em nenhuma tela:
 *
 * ┌─ A COERÊNCIA ENTRE A CHAVE DO ÍNDICE E O CRITÉRIO DAS BUSCAS ────────────────────────────────┐
 * │ A 0150 indexou `btrim(id_vacancy_pandape)` enquanto TODAS as buscas comparam a coluna CRUA. O  │
 * │ par incoerente travava a vaga PARA SEMPRE com uma única linha gravada com espaço, e sem        │
 * │ corrida nenhuma: o insert era recusado pelo índice (que vê a colisão aparada) e a releitura     │
 * │ voltava vazia (procura o valor cru), então não havia vencedora a reler. A vaga falhava a cada   │
 * │ 30 minutos e as inscrições dela nunca entravam.                                                │
 * │                                                                                                │
 * │ A 0151 resolveu pelo outro lado: chave na COLUNA CRUA e espaço PROIBIDO por CHECK, de modo que  │
 * │ a coluna crua JÁ É a forma normalizada e nenhuma busca precisou ser tocada (§A.26).             │
 * │                                                                                                │
 * │ O QUE ESTE ARQUIVO TRAVA: que a chave do unique vigente NÃO volte a ser uma expressão sem que   │
 * │ o CHECK e as buscas acompanhem. É a única guarda contra o defeito renascer numa migration       │
 * │ futura escrita de boa-fé ("vou normalizar a chave"), que é exatamente como ele nasceu.          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO TOCA O BANCO: a prova é sobre o DDL DECLARADO, do mesmo jeito que a do `tester`. O
 * comportamento contra um Postgres de verdade foi medido à mão num banco de prova descartável
 * (`ea_prova_0151`, com a forma da produção) e está registrado na prosa da 0151.
 *
 * §A.6: números de vaga sintéticos, zero PII. §A.11: sem travessão.
 */

const DIR_MIGRATIONS = join(__dirname, "..", "..", "drizzle");
const ARQUIVO_DO_SCHEMA = join(__dirname, "schema", "tables.ts");
const COLUNA = "id_vacancy_pandape";
const NOME_DO_INDICE = "uq_vagas_id_vacancy_pandape";
const NOME_DO_CHECK = "ck_vagas_id_vacancy_pandape_sem_espaco";

/** Tira comentário de linha ANTES de qualquer casamento: comentário já deu falso vermelho aqui. */
function semComentario(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

function instrucoesDasMigrations(): { arquivo: string; instrucao: string }[] {
  const saida: { arquivo: string; instrucao: string }[] = [];
  for (const nome of readdirSync(DIR_MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    const arquivo = join(DIR_MIGRATIONS, nome);
    const bruto = semComentario(readFileSync(arquivo, "utf8"));
    for (const pedaco of bruto.split(/;|-->\s*statement-breakpoint/)) {
      const instrucao = pedaco.replace(/\s+/g, " ").trim();
      if (instrucao !== "") saida.push({ arquivo, instrucao });
    }
  }
  return saida;
}

interface IndiceVigente {
  arquivo: string;
  chave: string;
  predicado: string;
}

/**
 * O ÚLTIMO `create unique index` com aquele nome é o VIGENTE, e a ordem importa: a 0151 derruba o da
 * 0150 e cria outro com o MESMO nome, então ler o primeiro mediria o índice que não existe mais.
 */
function indiceVigente(): IndiceVigente {
  const criacoes = instrucoesDasMigrations().filter((i) =>
    new RegExp(`create\\s+unique\\s+index\\b[\\s\\S]*\\b${NOME_DO_INDICE}\\b`, "i").test(i.instrucao),
  );
  expect(
    criacoes.length,
    `Nenhuma migration cria o índice \`${NOME_DO_INDICE}\`. A regra inteira desta frente depende dele.`,
  ).toBeGreaterThan(0);
  const ultima = criacoes[criacoes.length - 1];
  const m =
    /on\s+"?vagas"?\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*where\s+(.*)$/i.exec(ultima.instrucao);
  expect(m, `o índice vigente (${ultima.arquivo}) não é parcial, ou mudou de forma`).not.toBeNull();
  return {
    arquivo: ultima.arquivo,
    chave: (m as RegExpExecArray)[1].trim().replace(/"/g, "").toLowerCase(),
    predicado: (m as RegExpExecArray)[2]
      .trim()
      .replace(/"/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase(),
  };
}

/** O CHECK vigente de ausência de espaço, lido do DDL declarado. */
function checkVigente(): { arquivo: string; expressao: string } {
  const adicoes = instrucoesDasMigrations().filter((i) =>
    new RegExp(`add\\s+constraint\\s+"?${NOME_DO_CHECK}"?`, "i").test(i.instrucao),
  );
  expect(
    adicoes.length,
    `Nenhuma migration acrescenta o CHECK \`${NOME_DO_CHECK}\`. Sem ele a coluna crua volta a ` +
      "admitir \" 123\" ao lado de \"123\", e o índice sobre a coluna crua deixa de garantir que " +
      "duas linhas lidas como a MESMA vaga não coexistem.",
  ).toBeGreaterThan(0);
  const ultima = adicoes[adicoes.length - 1];
  const m = /check\s*\((.*)\)\s*$/i.exec(ultima.instrucao);
  expect(m, "o CHECK vigente mudou de forma e não foi possível ler a expressão").not.toBeNull();
  return {
    arquivo: ultima.arquivo,
    expressao: (m as RegExpExecArray)[1].replace(/"/g, "").replace(/\s+/g, " ").trim().toLowerCase(),
  };
}

// ── 1. A COERÊNCIA QUE A 0151 RESTAUROU ────────────────────────────────────────────────────────

describe("a chave do índice e o critério das buscas são o MESMO", () => {
  it("a chave do índice vigente é a COLUNA CRUA, sem função nenhuma em volta", () => {
    const i = indiceVigente();

    expect(
      i.chave,
      `A chave do índice vigente (${i.arquivo}) é \`${i.chave}\`, uma EXPRESSÃO. Todas as buscas do ` +
        "repositório comparam a coluna crua (`where id_vacancy_pandape = $1`), então chave " +
        "normalizada volta a criar o par incoerente: uma linha gravada com espaço faz o insert ser " +
        "recusado pelo índice e a releitura voltar vazia, e a vaga falha a cada 30 minutos para " +
        "sempre, sem vencedora a reler. Quem quiser normalizar a chave tem de normalizar as buscas " +
        "na MESMA entrega.",
    ).toBe(COLUNA);
  });

  it("o predicado exclui o NULO e o VAZIO, e nada além disso", () => {
    const i = indiceVigente();

    expect(
      i.predicado,
      "o predicado parcial mudou de forma. Nulo fora porque a vaga manual não tem número de ATS " +
        "nenhum; vazio fora porque string vazia entraria como VALOR e a segunda vaga em branco " +
        "receberia erro de número duplicado por NÃO ter número.",
    ).toBe(`${COLUNA} is not null and ${COLUNA} <> ''`);
  });

  it("o índice de EXPRESSÃO da 0150 foi derrubado, e não apenas sobreposto", () => {
    const quedas = instrucoesDasMigrations().filter((i) =>
      new RegExp(`drop\\s+index\\b[\\s\\S]*\\b${NOME_DO_INDICE}\\b`, "i").test(i.instrucao),
    );
    expect(
      quedas.length,
      "a 0151 cria o índice com o mesmo nome do da 0150 sem derrubar o anterior. `CREATE UNIQUE " +
        "INDEX IF NOT EXISTS` encontra o nome já ocupado e NÃO FAZ NADA: o índice de expressão " +
        "continuaria valendo em produção, em silêncio, e o conserto não teria acontecido.",
    ).toBeGreaterThan(0);
  });
});

// ── 2. O CHECK, APLICADO COMO O POSTGRES O APLICARIA ───────────────────────────────────────────

/**
 * Lê a expressão declarada e devolve a função que diz se a linha ENTRA. Expressão que o teste não
 * souber ler vira erro explícito, nunca verde por omissão: um CHECK ignorado em silêncio deixaria
 * este arquivo medindo uma régua que o banco não aplica.
 */
function aceitaPeloCheck(expressao: string): (valor: string | null) => boolean {
  const conhecidas: { padrao: RegExp; regra: (v: string | null) => boolean }[] = [
    {
      padrao: new RegExp(`^${COLUNA} is null or ${COLUNA} = btrim\\(${COLUNA}\\)$`),
      /* `btrim` do Postgres, no padrão, apara SÓ o espaço: nem tabulação, nem quebra de linha. */
      regra: (v) => v === null || v === v.replace(/^ +| +$/g, ""),
    },
  ];
  const achada = conhecidas.find((c) => c.padrao.test(expressao));
  if (!achada) {
    throw new Error(
      `A expressão declarada do CHECK (\`${expressao}\`) não é nenhuma das que este teste sabe ` +
        "interpretar. Isso não é um verde: é o teste avisando que o DDL mudou de forma e que a " +
        "interpretação precisa acompanhar, em vez de medir uma régua diferente da declarada.",
    );
  }
  return achada.regra;
}

describe("o CHECK proíbe espaço nas bordas, que é o que faz a coluna crua ser a forma normalizada", () => {
  it("RECUSA borda com espaço, dos dois lados", () => {
    const aceita = aceitaPeloCheck(checkVigente().expressao);

    for (const valor of [" 3781129", "3781129 ", " 3781129 ", "  3781129  "]) {
      expect(
        aceita(valor),
        `o CHECK aceitou ${JSON.stringify(valor)}. Com ele gravado, a operação passa a ter duas ` +
          "linhas que lê como a MESMA vaga, e o unique sobre a coluna crua não as vê colidir.",
      ).toBe(false);
    }
  });

  it("ACEITA o nulo, o número aparado e o branco (os três estados legítimos)", () => {
    const aceita = aceitaPeloCheck(checkVigente().expressao);

    expect(aceita(null), "vaga MANUAL não tem número de ATS, e é o estado normal dela").toBe(true);
    expect(aceita("3781129"), "o número que a varredura grava foi recusado").toBe(true);
    expect(
      aceita(""),
      "o branco foi recusado pelo CHECK. Ele é ausência, fica FORA do índice parcial, e barrá-lo " +
        "aqui derrubaria escrita que o resto do desenho trata como legítima.",
    ).toBe(true);
  });

  it("nenhum escritor legítimo é barrado: todos gravam nulo ou valor já aparado", () => {
    /**
     * A lista foi conferida um por um ANTES de escrever a migration, e está na prosa dela. Este
     * `it` trava o que é verificável em fonte: os dois normalizadores que os caminhos usam.
     */
    const servico = readFileSync(
      join(__dirname, "..", "as", "vagas", "vagas.service.ts"),
      "utf8",
    );
    expect(
      /function texto\([\s\S]{0,200}?trim\(\)/.test(servico),
      "`texto()` deixou de aparar. É ele que garante que o caminho manual nunca grava borda com " +
        "espaço, e sem isso o CHECK passa a recusar gravação legítima da trilha da vaga.",
    ).toBe(true);

    const digai = readFileSync(join(__dirname, "..", "domain", "digai.ts"), "utf8");
    expect(
      /partnerJobId[\s\S]{0,120}?trim\(\)/.test(digai),
      "`espelhoDaVagaDigai` deixou de aparar o `partnerJobId`. O valor vem do payload do " +
        "fornecedor, e sem o `trim` ele passa a poder bater no CHECK e derrubar a importação.",
    ).toBe(true);
  });
});

// ── 3. A DUPLA (ÍNDICE + CHECK) GARANTE A PROPRIEDADE QUE O DIRETOR PEDIU ──────────────────────

/** O Postgres pobre: aplica o CHECK primeiro (como o banco faz) e depois o unique parcial. */
function inserirTodas(linhas: (string | null)[]): { recusou: boolean; motivo: string | null } {
  const i = indiceVigente();
  const aceita = aceitaPeloCheck(checkVigente().expressao);
  const noIndice = (v: string | null) => v !== null && v !== "";
  expect(
    i.predicado,
    "o predicado mudou e o simulador deixaria de refletir o índice declarado",
  ).toBe(`${COLUNA} is not null and ${COLUNA} <> ''`);

  const vistas = new Set<string>();
  for (const valor of linhas) {
    if (!aceita(valor)) return { recusou: true, motivo: "CHECK" };
    if (!noIndice(valor)) continue;
    const k = valor as string;
    if (vistas.has(k)) return { recusou: true, motivo: "UNIQUE" };
    vistas.add(k);
  }
  return { recusou: false, motivo: null };
}

describe("duas linhas que a operação lê como a MESMA vaga não coexistem", () => {
  it("o mesmo número duas vezes é recusado pelo UNIQUE", () => {
    expect(inserirTodas(["3781129", "3781129"])).toEqual({ recusou: true, motivo: "UNIQUE" });
  });

  it("o mesmo número com espaço é recusado pelo CHECK, antes de chegar ao índice", () => {
    /**
     * A ORDEM IMPORTA PARA A MENSAGEM, e não só para o veredito: com o CHECK barrando primeiro, quem
     * gravou recebe "este valor não pode ter espaço" em vez de "número duplicado", que é a resposta
     * verdadeira. Era este o par que a 0150 deixava passar como duas vagas diferentes.
     */
    expect(inserirTodas(["3781129", " 3781129"])).toEqual({ recusou: true, motivo: "CHECK" });
    expect(inserirTodas(["3781129", "3781129 "])).toEqual({ recusou: true, motivo: "CHECK" });
  });

  it("vários NULOS convivem (a vaga manual, que nunca passou pelo ATS)", () => {
    expect(inserirTodas([null, null, null, null, null]).recusou).toBe(false);
  });

  it("duas VAZIAS convivem, porque branco é ausência e fica fora do índice", () => {
    expect(inserirTodas(["", ""]).recusou).toBe(false);
  });

  it("números distintos, nulos e vazias convivem na mesma tabela", () => {
    expect(inserirTodas(["3781129", null, "", "3781368", null, ""]).recusou).toBe(false);
  });
});

// ── 4. O SCHEMA DRIZZLE E A MIGRATION NÃO PODEM DIVERGIR ───────────────────────────────────────

describe("o schema declarado concorda com o DDL aplicado", () => {
  it("`tables.ts` declara o unique na coluna crua e o CHECK, com os mesmos nomes", () => {
    /**
     * Divergência entre o schema do Drizzle e a migration é silenciosa: produção fica com o DDL da
     * migration e o `drizzle-kit` passa a gerar diffs fantasma na frente seguinte, que alguém
     * aplica de boa-fé e desfaz o conserto.
     */
    const schema = readFileSync(ARQUIVO_DO_SCHEMA, "utf8");
    const bloco = schema.slice(schema.indexOf(`uniqueIndex("${NOME_DO_INDICE}")`));

    expect(
      bloco.indexOf(`uniqueIndex("${NOME_DO_INDICE}")`),
      `\`${NOME_DO_INDICE}\` não está declarado em \`tables.ts\``,
    ).toBe(0);
    const declaracao = bloco.slice(0, 400);
    expect(
      /\.on\(t\.idVacancyPandape\)/.test(declaracao),
      "o schema declara a chave do unique como EXPRESSÃO enquanto a migration vigente usa a coluna " +
        "crua (ou o inverso). As duas pontas têm de dizer a mesma coisa.",
    ).toBe(true);
    expect(
      /<> ''/.test(declaracao),
      "o predicado declarado no schema não exclui o vazio, e a migration exclui",
    ).toBe(true);
    expect(
      schema.includes(`check(\n      "${NOME_DO_CHECK}"`) || schema.includes(`"${NOME_DO_CHECK}"`),
      `o CHECK \`${NOME_DO_CHECK}\` existe na migration e não está declarado em \`tables.ts\``,
    ).toBe(true);
    expect(
      /btrim\(\$\{t\.idVacancyPandape\}\)/.test(schema),
      "o CHECK declarado no schema não usa `btrim` sobre a coluna, como a migration",
    ).toBe(true);
  });

  it("a migration do conserto está ACIMA da marca d'água do journal", () => {
    /**
     * O Drizzle compara o `when`, NÃO o hash: migration com `when` abaixo da maior entrada já
     * aplicada é PULADA EM SILÊNCIO. Aqui isso significaria produção ficando com o índice de
     * expressão da 0150 e o repositório afirmando que o conserto subiu.
     */
    const journal = JSON.parse(
      readFileSync(join(DIR_MIGRATIONS, "meta", "_journal.json"), "utf8"),
    ) as { entries: { idx: number; when: number; tag: string }[] };

    const conserto = journal.entries.find((e) => e.tag.startsWith("0151_"));
    expect(conserto, "a 0151 não tem entrada no journal, então o Drizzle nem a vê").toBeTruthy();
    /*
     * ─ A COMPARAÇÃO É CONTRA AS ENTRADAS ANTERIORES, E NÃO CONTRA O JOURNAL INTEIRO (08/10/2026) ─
     *
     * ┌─ POR QUE A PRIMEIRA REDAÇÃO FICAVA VERMELHA CONTRA UM REPOSITÓRIO CORRETO ────────────────┐
     * │ Ela exigia que a 0151 fosse a MAIOR entrada do journal, e isso só é verdade enquanto ela é  │
     * │ a ÚLTIMA migration do projeto. A migration seguinte (a 0152, do espelho do status do ATS na │
     * │ vaga) nasceu, corretamente, com `when` acima do dela, e este caso acusou um defeito que não │
     * │ existe: mandava "consertar" a 0151 abaixando a 0152, que é exatamente o erro que ele existe │
     * │ para impedir. Teste que manda consertar o certo é o pior defeito que um teste pode ter.     │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * A PROPRIEDADE REAL É DE ORDEM, e ela continua medida inteira: o drizzle aplica na ordem do
     * journal e compara o `when` de cada uma com a maior JÁ APLICADA, então o que não pode acontecer
     * é uma entrada ter `when` abaixo de alguma ANTERIOR a ela. O que vem depois é irrelevante: ela
     * já terá rodado. Com a comparação contra o journal inteiro, a frente seguinte era obrigada a
     * reabrir esta asserção; com a comparação contra as anteriores, a trava vale para sempre.
     */
    const anteriores = journal.entries
      .filter((e) => e.idx < (conserto as { idx: number }).idx)
      .map((e) => e.when);
    expect(
      (conserto as { when: number }).when,
      "o `when` da 0151 está abaixo de alguma migration ANTERIOR a ela: ela seria pulada em " +
        "silêncio e produção ficaria com o índice de expressão da 0150",
    ).toBeGreaterThan(Math.max(...anteriores));
    /*
     * ─ A GENERALIZAÇÃO PARA O JOURNAL INTEIRO FOI TENTADA, E ELA ACHOU DÍVIDA ANTIGA ────────────
     *
     * Asserir "o `when` cresce junto com o `idx`" em TODAS as entradas fica VERMELHO contra o
     * repositório de hoje: a `0086_frente_ifractal` tem `when` 1787321660928, ABAIXO da
     * `0085_as_reentrada_em_vaga_encerrada` (1787321663927). É inversão de ORIGEM (as duas são de
     * fevereiro e já estão aplicadas há meses), e não efeito de frente nenhuma em curso.
     *
     * NÃO SE CONSERTA AQUI, e por isso a asserção não fica: mexer no `when` de migration APLICADA é
     * reescrever o passado do banco (as duas já rodaram em produção, e o drizzle não as roda de
     * novo), o que não foi pedido por OST nenhuma (§A.14/§A.31) e não tem efeito prático hoje. O
     * achado está registrado para o coordenador decidir se vira frente própria.
     */
    expect(
      new Set(journal.entries.map((e) => e.idx)).size,
      "há `idx` repetido no journal",
    ).toBe(journal.entries.length);
  });
});
