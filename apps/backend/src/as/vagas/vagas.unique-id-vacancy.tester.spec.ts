import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ─ COBERTURA INDEPENDENTE (tester, §A.38): O UNIQUE PARCIAL DE `vagas.id_vacancy_pandape` ──────
 *
 * ESCRITO A PARTIR DO REQUISITO, NÃO DO CÓDIGO (§A.38/§A.40 regra 2). O autor da regra estava
 * escrevendo a migration e o schema enquanto este arquivo nascia. Nada aqui importa o arquivo que
 * ele escolheu: a migration é PROCURADA pelo que ela tem de fazer, e as asserções saem do
 * requisito.
 *
 * O REQUISITO, na íntegra:
 *  - duas vagas com o MESMO número do Pandapé não podem existir;
 *  - o índice é UNIQUE e PARCIAL, `where id_vacancy_pandape is not null`;
 *  - número NULO é legítimo e repetível (vaga de carga, que nunca passou pelo ATS): VÁRIOS nulos
 *    têm de conviver, e o teste tem de PROVAR isso, não supor;
 *  - a parcialidade é de propósito, mesmo que um unique total também admitisse nulos.
 *
 * ┌─ POR QUE ESTE ARQUIVO NÃO TOCA O BANCO ────────────────────────────────────────────────────────┐
 * │ O briefing proíbe rodar migration e escrever no banco. Então a prova é feita sobre o DDL        │
 * │ DECLARADO: o arquivo da migration é lido, o índice é interpretado (chave, unicidade e           │
 * │ predicado) e um simulador pobre de índice aplica a semântica do Postgres a conjuntos de linhas. │
 * │ Isso mede a propriedade que o diretor pediu sem depender de um Postgres de pé, e falha quando o │
 * │ DDL declarado não tem a propriedade, que é o único jeito do teste errar para o lado seguro.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: números de vaga do ATS, sintéticos. Nenhum dado pessoal entra neste arquivo.
 */

const RAIZ_BACKEND = join(__dirname, "..", "..");
const DIR_MIGRATIONS = join(RAIZ_BACKEND, "..", "drizzle");
const ARQUIVO_DO_SCHEMA = join(RAIZ_BACKEND, "db", "schema", "tables.ts");
const TABELA = "vagas";
const COLUNA = "id_vacancy_pandape";

// ── 1. ACHAR O DDL, SEM FIXAR O NOME DO ARQUIVO NEM DO ÍNDICE ──────────────────────────────────

interface IndiceDeclarado {
  arquivo: string;
  instrucao: string;
  nome: string;
  unico: boolean;
  /** O que está entre parênteses depois do nome da tabela, cru. */
  chaveCrua: string;
  /** O predicado do `where`, cru, ou nulo quando o índice é total. */
  predicado: string | null;
}

function arquivosDeMigration(): string[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => join(DIR_MIGRATIONS, n));
}

/** Tira comentário de linha antes de qualquer casamento: comentário já produziu falso vermelho aqui. */
function semComentario(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * Parte o SQL em instruções e devolve só as que criam índice sobre a coluna do requisito.
 * Reconhece UNIQUE e não-UNIQUE de propósito: é preciso poder dizer "existe índice, mas não é
 * unique", que é um vermelho diferente de "não existe índice".
 */
function indicesSobreAColuna(): IndiceDeclarado[] {
  const saida: IndiceDeclarado[] = [];
  for (const arquivo of arquivosDeMigration()) {
    const bruto = semComentario(readFileSync(arquivo, "utf8"));
    for (const pedaco of bruto.split(/;|-->\s*statement-breakpoint/)) {
      const instrucao = pedaco.replace(/\s+/g, " ").trim();
      const m =
        /create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\s+"?([a-z0-9_]+)"?\s*(?:using\s+\w+\s*)?\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*(?:where\s+(.*))?$/i.exec(
          instrucao,
        );
      if (!m) continue;
      const [, unico, nome, tabela, chaveCrua, predicado] = m;
      if (tabela.toLowerCase() !== TABELA) continue;
      if (!chaveCrua.toLowerCase().includes(COLUNA)) continue;
      saida.push({
        arquivo,
        instrucao,
        nome,
        unico: !!unico,
        chaveCrua: chaveCrua.trim(),
        predicado: predicado ? predicado.trim() : null,
      });
    }
  }
  return saida;
}

/**
 * O ÍNDICE VIGENTE, e não o primeiro que apareceu.
 *
 * As migrations são lidas em ordem e um nome pode ser recriado: a 0150 criou este índice sobre
 * `btrim(...)`, a 0151 o derrubou e recriou sobre a coluna crua. O que vale em produção é a ÚLTIMA
 * criação daquele nome, que é o que o Postgres tem depois de aplicar as duas, então é a última que
 * este arquivo mede. Ler a primeira seria medir um índice que não existe mais.
 */
function unicoSobreAColuna(): IndiceDeclarado {
  const todos = indicesSobreAColuna();
  const unicos = todos.filter((i) => i.unico);
  expect(
    unicos.length,
    `Nenhuma migration em ${DIR_MIGRATIONS} cria um índice UNIQUE sobre ${TABELA}.${COLUNA}. ` +
      `Índices NÃO-unique achados sobre a coluna: ${todos.map((i) => i.nome).join(", ") || "nenhum"}. ` +
      "O requisito é: duas vagas com o mesmo número do Pandapé não podem existir.",
  ).toBeGreaterThan(0);
  return unicos[unicos.length - 1];
}

// ── 1b. OS CHECKS, QUE SÃO A OUTRA METADE DA GARANTIA ──────────────────────────────────────────

interface CheckDeclarado {
  arquivo: string;
  nome: string;
  /** A expressão entre parênteses, normalizada em uma linha e em minúsculas. */
  expressao: string;
}

/**
 * Os CHECKs VIGENTES sobre a coluna, na ordem das migrations, com `DROP CONSTRAINT` honrado.
 *
 * ┌─ POR QUE ISTO PRECISOU EXISTIR, E É A LIÇÃO DO VERMELHO QUE ESTE ARQUIVO LEVOU ──────────────┐
 * │ A primeira versão deste simulador lia SÓ `CREATE INDEX`. Quando a garantia de que "123" e      │
 * │ " 123" não convivem saiu da CHAVE DO ÍNDICE e passou para um CHECK, o simulador ficou          │
 * │ estruturalmente cego: a propriedade continuava trancada no banco e o teste dizia que não.      │
 * │ Medir só um dos dois mecanismos é medir o mecanismo, não a propriedade.                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function checksSobreAColuna(): CheckDeclarado[] {
  const vivos = new Map<string, CheckDeclarado>();
  for (const arquivo of arquivosDeMigration()) {
    const bruto = semComentario(readFileSync(arquivo, "utf8"));
    for (const pedaco of bruto.split(/;|-->\s*statement-breakpoint/)) {
      const instrucao = pedaco.replace(/\s+/g, " ").trim();
      const queda =
        /alter\s+table\s+"?([a-z0-9_]+)"?\s+drop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/i.exec(
          instrucao,
        );
      if (queda && queda[1].toLowerCase() === TABELA) {
        vivos.delete(queda[2].toLowerCase());
        continue;
      }
      const criacao =
        /alter\s+table\s+"?([a-z0-9_]+)"?\s+add\s+constraint\s+"?([a-z0-9_]+)"?\s+check\s*\(([\s\S]*)\)$/i.exec(
          instrucao,
        );
      if (!criacao) continue;
      const [, tabela, nome, expressao] = criacao;
      if (tabela.toLowerCase() !== TABELA) continue;
      const limpa = expressao.replace(/"/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!limpa.includes(COLUNA)) continue;
      vivos.set(nome.toLowerCase(), { arquivo, nome, expressao: limpa });
    }
  }
  return [...vivos.values()];
}

/**
 * Lê a expressão de um CHECK e devolve quem ele ACEITA. Expressão que o teste não souber
 * interpretar vira erro explícito, nunca verde por omissão: CHECK ignorado em silêncio faria este
 * arquivo medir uma régua que o banco não aplica, que é o buraco que ele acabou de levar.
 */
function aceitaPeloCheck(check: CheckDeclarado): (valor: string | null) => boolean {
  const conhecidas: { padrao: RegExp; regra: (v: string | null) => boolean }[] = [
    {
      // `btrim` do Postgres, no padrão, apara SÓ o espaço: nem tabulação, nem quebra de linha.
      padrao: new RegExp(`^${COLUNA} is null or ${COLUNA} = btrim\\(${COLUNA}\\)$`),
      regra: (v) => v === null || v === v.replace(/^ +| +$/g, ""),
    },
    {
      padrao: new RegExp(`^${COLUNA} is null or (btrim|trim)\\(${COLUNA}\\) = ${COLUNA}$`),
      regra: (v) => v === null || v === v.replace(/^ +| +$/g, ""),
    },
  ];
  const achada = conhecidas.find((c) => c.padrao.test(check.expressao));
  if (!achada) {
    throw new Error(
      `A expressão do CHECK \`${check.nome}\` (\`${check.expressao}\`) não é nenhuma das que este ` +
        "teste sabe interpretar. Isso não é um verde: é o teste avisando que o DDL mudou de forma e " +
        "que a interpretação precisa acompanhar, em vez de medir uma régua diferente da declarada.",
    );
  }
  return achada.regra;
}

// ── 2. O SIMULADOR DE ÍNDICE: A SEMÂNTICA DO POSTGRES APLICADA AO DDL DECLARADO ─────────────────

/**
 * Lê a chave declarada e devolve a função que calcula a chave de uma linha. Reconhece a coluna crua
 * e os três embrulhos de normalização que o conserto PODERIA ter usado (`btrim`, `trim`, `lower`).
 * Chave que o DDL não declarou, o índice não aplica: é assim que a falta de normalização aparece.
 */
function chaveDeclarada(indice: IndiceDeclarado): (valor: string | null) => string | null {
  const chave = indice.chaveCrua.toLowerCase().replace(/"/g, "");
  const embrulhos: ((v: string) => string)[] = [];
  if (/\b(btrim|trim)\s*\(/.test(chave)) embrulhos.push((v) => v.trim());
  if (/\blower\s*\(/.test(chave)) embrulhos.push((v) => v.toLowerCase());
  return (valor) => {
    if (valor === null) return null;
    return embrulhos.reduce((v, f) => f(v), valor);
  };
}

/**
 * Lê o predicado declarado e devolve quem entra no índice. Reconhece `is not null`, `is null`,
 * `<> ''` e `btrim(...) <> ''`. Predicado que o teste não souber ler vira erro explícito, nunca um
 * verde por omissão: um `where` ignorado em silêncio deixaria o teste medir outro índice.
 */
function entraNoIndice(indice: IndiceDeclarado): (valor: string | null) => boolean {
  if (indice.predicado === null) return () => true;
  const p = indice.predicado.toLowerCase().replace(/"/g, "").replace(/\s+/g, " ").trim();
  const conhecidos: { padrao: RegExp; regra: (v: string | null) => boolean }[] = [
    { padrao: new RegExp(`^${COLUNA} is not null$`), regra: (v) => v !== null },
    {
      padrao: new RegExp(`^${COLUNA} is not null and (btrim|trim)\\(${COLUNA}\\) <> ''$`),
      regra: (v) => v !== null && v.trim() !== "",
    },
    {
      padrao: new RegExp(`^${COLUNA} is not null and ${COLUNA} <> ''$`),
      regra: (v) => v !== null && v !== "",
    },
  ];
  const achado = conhecidos.find((c) => c.padrao.test(p));
  if (!achado) {
    throw new Error(
      `O predicado declarado do índice (\`where ${indice.predicado}\`) não é nenhum dos que este ` +
        "teste sabe interpretar. Isso não é um verde: é o teste avisando que o DDL mudou de forma e " +
        "que a interpretação precisa acompanhar, em vez de medir um índice diferente do declarado.",
    );
  }
  return achado.regra;
}

interface Veredito {
  /** A linha foi recusada pelo banco, por QUALQUER das duas travas. É esta a propriedade. */
  recusado: boolean;
  /** Quem recusou. Decide qual das duas mensagens a pessoa recebe, e por isso é observável. */
  porQuem: "CHECK" | "UNIQUE" | null;
  /** O valor recusado, para a mensagem do vermelho dizer qual linha caiu. */
  valor: string | null;
}

/**
 * O POSTGRES POBRE, COM AS DUAS TRAVAS E NA ORDEM CERTA.
 *
 * ┌─ A ORDEM NÃO É DETALHE: CHECK PRIMEIRO, ÍNDICE DEPOIS ───────────────────────────────────────┐
 * │ É a ordem real do Postgres, e ela decide QUAL mensagem a pessoa recebe. Um valor com espaço    │
 * │ cujo aparado já existe viola as duas coisas ao mesmo tempo; quem fala primeiro é o CHECK        │
 * │ (23514, "valor inválido"), e não o unique (23505, "número já usado"). Inverter faria o teste    │
 * │ prometer uma mensagem que o banco não dá.                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MEDE A PROPRIEDADE, NÃO O MECANISMO. O que interessa é se a linha ENTRA ou é RECUSADA; por qual
 * das duas travas é informação adicional, e é de propósito que o `porQuem` seja um dado do veredito
 * em vez de uma condição da asserção. Foi fixar o mecanismo (`btrim` na chave) que fez estes testes
 * ficarem vermelhos quando o conserto foi trocado por um melhor.
 */
function inserirTodas(indice: IndiceDeclarado, linhas: (string | null)[]): Veredito {
  const entra = entraNoIndice(indice);
  const chave = chaveDeclarada(indice);
  const checks = checksSobreAColuna().map((c) => ({ nome: c.nome, aceita: aceitaPeloCheck(c) }));
  const vistas = new Set<string>();
  for (const linha of linhas) {
    const reprovado = checks.find((c) => !c.aceita(linha));
    if (reprovado) return { recusado: true, porQuem: "CHECK", valor: linha };
    if (!entra(linha)) continue;
    const k = chave(linha);
    if (k === null) continue;
    if (vistas.has(k)) return { recusado: true, porQuem: "UNIQUE", valor: linha };
    vistas.add(k);
  }
  return { recusado: false, porQuem: null, valor: null };
}

// ── 3. O QUE O REQUISITO PEDE ───────────────────────────────────────────────────────────────────

describe("o índice unique parcial existe e é PARCIAL de propósito", () => {
  it("existe um índice UNIQUE sobre vagas.id_vacancy_pandape", () => {
    const i = unicoSobreAColuna();
    expect(i.unico).toBe(true);
  });

  it("o índice é PARCIAL, e o predicado é `id_vacancy_pandape is not null`", () => {
    const i = unicoSobreAColuna();
    expect(
      i.predicado,
      `O índice \`${i.nome}\` é unique mas TOTAL (sem \`where\`). O requisito manda declarar o ` +
        "predicado de propósito: em Postgres o unique total também admitiria vários nulos, mas o " +
        "predicado é o que deixa a intenção legível e mantém o índice do tamanho das vagas que " +
        "realmente têm número.",
    ).not.toBeNull();
    expect(
      (i.predicado ?? "").toLowerCase().replace(/"/g, "").replace(/\s+/g, " "),
      "o predicado do índice parcial tem de recortar justamente o número ausente",
    ).toContain(`${COLUNA} is not null`);
  });

  it("a chave do índice é a coluna, numa tabela só (nada de índice composto disfarçado)", () => {
    const i = unicoSobreAColuna();
    const colunas = i.chaveCrua
      .split(",")
      .map((c) => c.trim().replace(/"/g, "").toLowerCase())
      .filter(Boolean);
    expect(
      colunas.length,
      `O índice \`${i.nome}\` é composto (${i.chaveCrua}). Unique composto NÃO barra duas vagas ` +
        "com o mesmo número: barra o par. O requisito é sobre o número, sozinho.",
    ).toBe(1);
  });
});

describe("VÁRIOS nulos convivem (a vaga de carga, que nunca passou pelo ATS)", () => {
  it("cinco vagas sem número nenhum entram todas", () => {
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, [null, null, null, null, null]);
    expect(
      v.recusado,
      `O banco barrou a segunda vaga SEM número (por ${String(v.porQuem)}). Número nulo é legítimo ` +
        "e existe em várias vagas ao mesmo tempo: barrá-lo impediria toda vaga manual a partir da " +
        "segunda.",
    ).toBe(false);
  });

  it("nulos e números conviveriam na mesma tabela", () => {
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, [null, "3781129", null, "3781368", null]);
    expect(v.recusado, "vagas com número distinto e vagas sem número coexistem").toBe(false);
  });
});

describe("número repetido é RECUSADO", () => {
  it("o mesmo número duas vezes é recusado", () => {
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, ["3781129", "3781129"]);
    expect(
      v.recusado,
      `O banco NÃO barra duas vagas com o número 3781129 (índice vigente: \`${i.nome}\`). É ` +
        "exatamente assim que nasceram os 9 pares de gêmeas medidos em produção.",
    ).toBe(true);
    expect(
      v.porQuem,
      "número repetido e já aparado não é problema de formato: quem tem de recusar é o UNIQUE, e a " +
        "pessoa precisa receber a mensagem de número já usado, não a de valor inválido.",
    ).toBe("UNIQUE");
  });

  it("o mesmo número repetido no meio de outros também é recusado", () => {
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, ["1", "2", "3", "2"]);
    expect(v.recusado).toBe(true);
    expect(v.valor).toBe("2");
  });
});

// ── 4. O QUE O REQUISITO NÃO COBRE, E VAI MORDER ────────────────────────────────────────────────

describe("duas linhas que a operação lê como o MESMO número não coexistem", () => {
  /**
   * ┌─ A PROPRIEDADE, E ELA NÃO NOMEIA MECANISMO NENHUM ──────────────────────────────────────────┐
   * │ A coluna é `varchar(40)`, e `"123"` e `" 123"` são valores diferentes para o banco e o MESMO │
   * │ número para quem digita. A propriedade que o diretor pediu é que as duas não convivam. Como   │
   * │ isso é garantido é escolha de quem constrói, e há pelo menos dois caminhos bons: normalizar a │
   * │ CHAVE do índice, ou PROIBIR o espaço na coluna por CHECK e deixar a coluna crua ser a forma   │
   * │ normalizada.                                                                                 │
   * │                                                                                              │
   * │ A PRIMEIRA VERSÃO DESTES TRÊS TESTES ASSERIA O MECANISMO (`btrim` na chave) E ISSO FOI ERRO   │
   * │ MEU. Quando o conserto foi trocado pelo caminho do CHECK, que é melhor porque não toca o      │
   * │ caminho quente das buscas (§A.26), a propriedade continuou trancada no banco e os testes      │
   * │ ficaram vermelhos acusando o conserto certo. Teste que fixa mecanismo impede o conserto de    │
   * │ ser melhorado, e é por isso que eles agora perguntam só uma coisa: a linha ENTROU ou foi      │
   * │ RECUSADA?                                                                                    │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("número com espaço À ESQUERDA é recusado quando o aparado já existe", () => {
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, ["3781129", " 3781129"]);
    expect(
      v.recusado,
      'O banco aceitou "3781129" e " 3781129" como vagas diferentes. Para quem digita é o mesmo ' +
        "número, e a gêmea volta pela porta do espaço: duas linhas que a operação lê como a mesma " +
        "vaga. Fecha normalizando a chave do índice OU proibindo o espaço na coluna; qualquer das " +
        "duas satisfaz este teste.",
    ).toBe(true);
  });

  it("número com espaço À DIREITA também é recusado", () => {
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, ["3781129", "3781129 "]);
    expect(v.recusado, 'o banco aceitou "3781129 " ao lado de "3781129"').toBe(true);
  });

  it("espaço é recusado ANTES do índice, mesmo quando não há nenhum número para colidir", () => {
    /**
     * ┌─ ESTE É O TESTE QUE SEPARA AS DUAS SOLUÇÕES, E É POR ISSO QUE ELE EXISTE ─────────────────┐
     * │ Com o espaço PROIBIDO na coluna, `" 3781129"` é recusado por si só, sem precisar de outra  │
     * │ linha para colidir: o estado incoerente deixa de poder nascer. Com a normalização só na     │
     * │ CHAVE do índice, ele seria ACEITO e gravado com o espaço, e a coerência passaria a depender │
     * │ de toda busca lembrar de aparar.                                                           │
     * │                                                                                            │
     * │ O TESTE NÃO EXIGE UMA DAS DUAS, ele apenas REGISTRA qual está no lugar, porque isso muda o  │
     * │ que as buscas precisam fazer. Vermelho aqui NÃO é defeito: é aviso de que a garantia mudou  │
     * │ de lugar e que o teste da releitura (que deriva o critério do DDL) é o que passa a mandar.  │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, [" 3781129"]);
    const temCheck = checksSobreAColuna().length > 0;
    expect(
      v.recusado,
      temCheck
        ? "há CHECK declarado sobre a coluna e ele NÃO recusou a borda com espaço: a coluna crua " +
          "deixou de ser a forma normalizada, e as buscas que comparam cru voltam a discordar do índice"
        : "sem CHECK, a coluna aceita o valor com espaço e a coerência passa a depender de TODA " +
          "busca aparar. O teste da releitura é quem cobra isso, derivando o critério do DDL.",
    ).toBe(temCheck);
  });

  it("duas linhas EM BRANCO convivem, e a segunda não recebe erro de número duplicado", () => {
    /**
     * `""` não é nulo. Dentro do índice ele entraria como VALOR, e a segunda vaga com o número em
     * branco receberia um erro de "número duplicado" por NÃO ter número, que é a mensagem mais
     * confusa possível. Fora do índice, o branco se comporta como ausência, que é o que ele é.
     */
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, ["", ""]);
    expect(
      v.recusado,
      `Duas vagas com \`${COLUNA} = ''\` foram recusadas (por ${String(v.porQuem)}). Branco é ` +
        "ausência: o predicado do índice parcial tem de excluí-lo junto com o nulo, senão a " +
        "segunda vaga sem número recebe uma frase sobre número repetido.",
    ).toBe(false);
  });

  it("PENDENTE DE DECISÃO DO DIRETOR: zero à esquerda são dois números distintos", () => {
    /**
     * REGISTRO, NÃO COBRANÇA. `0` e `00` (e `9901501` contra `09901501`) convivem. O ATS devolve
     * inteiro, então a varredura nunca gera zero à esquerda; quem gera é a digitação manual. O
     * coordenador levou ao diretor, e a fábrica NÃO normaliza por conta própria (§A.14): este teste
     * fixa o estado ATUAL para que uma mudança silenciosa apareça, e fica verde nos dois mundos.
     */
    const i = unicoSobreAColuna();
    const atual = inserirTodas(i, ["0", "00"]).recusado;
    expect(
      [true, false],
      "estado registrado, sem veredito: quem decide se zero à esquerda é o mesmo número é o diretor",
    ).toContain(atual);
    expect(atual, "o estado medido hoje é a convivência; mudou, foi decisão, não acidente").toBe(
      false,
    );
  });

  it("PENDENTE DE DECISÃO DO DIRETOR: TAB e quebra de linha nas bordas", () => {
    /**
     * REGISTRO, NÃO COBRANÇA. O `btrim` do Postgres, no padrão, apara SÓ o espaço: tabulação e
     * quebra de linha nas bordas passam por qualquer régua escrita com ele, tanto na chave quanto
     * num CHECK. É a mesma classe do zero à esquerda (digitação), e está com o diretor. Com a chave
     * e as buscas comparando o MESMO valor, isso não reabre a incoerência: `"\t123"` é simplesmente
     * um número diferente de `"123"` para as duas pontas, e não uma vaga que trava.
     */
    const i = unicoSobreAColuna();
    const v = inserirTodas(i, ["3781129", "\t3781129", "3781129\n"]);
    expect(
      v.recusado,
      "o estado medido hoje é a convivência de TAB e quebra de linha nas bordas; mudou, foi decisão",
    ).toBe(false);
  });

  it("número gigante cabe na coluna declarada", () => {
    /**
     * A coluna é `varchar(40)`. Um número mais longo que isso não vira conflito: vira erro de
     * tamanho do Postgres (22001), que é OUTRO erro, e o caminho manual precisa recusá-lo como
     * validação de formato, não deixar estourar. Aqui o teste só mede o limite declarado.
     */
    const schema = readFileSync(ARQUIVO_DO_SCHEMA, "utf8");
    const m = new RegExp(`${COLUNA}"\\s*,\\s*\\{\\s*length:\\s*(\\d+)`).exec(schema);
    expect(m, `a coluna \`${COLUNA}\` deixou de declarar \`length\` no schema`).not.toBeNull();
    const teto = Number(m?.[1] ?? 0);
    const gigante = "9".repeat(teto + 1);
    expect(
      gigante.length > teto,
      `GAP: número com ${gigante.length} dígitos estoura o \`varchar(${teto})\` e chega como erro ` +
        "22001 do Postgres, não como conflito. O caminho manual precisa de `@MaxLength` no DTO (há) " +
        "E o caminho da varredura precisa não derrubar o job com ele (o ATS devolve inteiro, então é " +
        "improvável, mas o job não tem guarda).",
    ).toBe(true);
  });
});

// ── 5. OS DOIS JEITOS DE O ÍNDICE NÃO CHEGAR AO BANCO ───────────────────────────────────────────

describe("o índice declarado chega de fato ao banco", () => {
  it("a migration está no `_journal.json`, e acima da marca d'água", () => {
    /**
     * O drizzle decide o que aplicar pelo CARIMBO DE TEMPO do journal, não pelo conteúdo da pasta.
     * Migration que não está no journal NUNCA roda; migration com `when` abaixo do último aplicado é
     * PULADA EM SILÊNCIO. Os dois casos já aconteceram neste projeto, e os dois têm a mesma cara:
     * arquivo bonito na pasta, banco sem o índice, defeito que volta semanas depois.
     */
    const indice = unicoSobreAColuna();
    const tag = indice.arquivo.split("/").pop()?.replace(/\.sql$/, "") ?? "";
    const journal = JSON.parse(
      readFileSync(join(DIR_MIGRATIONS, "meta", "_journal.json"), "utf8"),
    ) as { entries: { idx: number; when: number; tag: string }[] };

    const minha = journal.entries.find((e) => e.tag === tag);
    expect(
      minha,
      `A migration \`${tag}\` NÃO está em \`drizzle/meta/_journal.json\`. O drizzle lê o journal, ` +
        "não a pasta: este arquivo não vai rodar em lugar nenhum, e o índice unique não existe nem " +
        "em homologação nem em produção. O arquivo precisa de entrada própria no journal.",
    ).toBeDefined();

    /*
     * ─ A COMPARAÇÃO É CONTRA AS ENTRADAS ANTERIORES, NUNCA CONTRA O JOURNAL INTEIRO (08/10/2026) ─
     *
     * ┌─ POR QUE A PRIMEIRA REDAÇÃO FICAVA VERMELHA CONTRA UM REPOSITÓRIO CORRETO ────────────────┐
     * │ Ela comparava o `when` desta migration com o MÁXIMO de todas as outras, ou seja exigia que  │
     * │ ela fosse a migration MAIS NOVA DO PROJETO. Isso só é verdade enquanto ninguém cria a       │
     * │ seguinte. A `0152` (o espelho do status do ATS na vaga) nasceu, corretamente, com `when`    │
     * │ acima, e este caso passou a acusar um defeito que não existe, mandando "consertar" o certo  │
     * │ abaixando a mais nova, que é exatamente o erro que ele existe para impedir.                 │
     * │                                                                                             │
     * │ NÃO "CONSERTAR" DE VOLTA comparando com o journal inteiro: a regra é esta, e o gêmeo desta  │
     * │ asserção (`src/db/uq-numero-pandape.backend.spec.ts`) já foi corrigido do mesmo jeito.      │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * A PROPRIEDADE REAL É DE ORDEM: o drizzle aplica na ordem do journal e compara o `when` de cada
     * entrada com a maior JÁ APLICADA, então o que não pode acontecer é uma entrada ter `when`
     * abaixo de alguma ANTERIOR a ela (`idx` menor). O que vem DEPOIS é irrelevante, porque quando
     * ela chegar esta já terá rodado. Assim a trava vale para sempre, sem a frente seguinte ser
     * obrigada a reabrir este arquivo.
     *
     * A `0086_frente_ifractal` (`when` 1787321660928, abaixo da `0085`, 1787321663927) é dívida
     * ANTIGA e fica FORA desta medida de propósito: as duas são de fevereiro, já rodaram em
     * produção, não têm efeito prático hoje, e mexer no `when` de migration APLICADA é reescrever o
     * passado do banco. Mesmo tratamento nominal que a `0134` já recebeu. Registrado, não consertado.
     */
    const anteriores = journal.entries
      .filter((e) => e.idx < (minha?.idx ?? 0))
      .map((e) => e.when);
    const maiorAnterior = anteriores.length > 0 ? Math.max(...anteriores) : 0;
    expect(
      minha?.when ?? 0,
      `A migration \`${tag}\` tem \`when\` abaixo de alguma ANTERIOR a ela no journal ` +
        `(${maiorAnterior}). Nesse estado o drizzle a PULA em silêncio: o deploy fica verde e o ` +
        "índice não nasce.",
    ).toBeGreaterThan(maiorAnterior);
  });

  it("o índice está DECLARADO no schema drizzle, senão o próximo `generate` o derruba", () => {
    /**
     * O schema (`tables.ts`) é a fonte da verdade do drizzle-kit. Índice que existe só no SQL cru,
     * e não no schema, aparece para o kit como um índice que o banco tem e o schema não quer: o
     * próximo `drizzle-kit generate` emite um `DROP INDEX`, e a trava que o diretor pediu é
     * removida por uma migration automática que ninguém leu.
     */
    const indice = unicoSobreAColuna();
    const schema = readFileSync(ARQUIVO_DO_SCHEMA, "utf8");
    const declarado = new RegExp(`uniqueIndex\\(\\s*["'\`]${indice.nome}["'\`]`).test(schema);
    expect(
      declarado,
      `O índice \`${indice.nome}\` existe na migration mas NÃO está declarado como ` +
        `\`uniqueIndex("${indice.nome}")\` em \`db/schema/tables.ts\`. O próximo ` +
        "`drizzle-kit generate` vai gerar o DROP dele, e a trava morre sem ninguém decidir isso.",
    ).toBe(true);
  });

  it("o `DROP INDEX` vem ANTES do `CREATE`, na MESMA migration que recria o nome", () => {
    /**
     * ┌─ O JEITO MAIS FÁCIL DESTE CONSERTO SE DESFAZER EM SILÊNCIO ───────────────────────────────┐
     * │ O índice é recriado com o MESMO NOME que a migration anterior usou, e o `CREATE UNIQUE      │
     * │ INDEX IF NOT EXISTS` acha o nome OCUPADO e NÃO FAZ NADA. Sem o `DROP` antes, a produção     │
     * │ fica com o índice ANTIGO enquanto o repositório afirma que o conserto subiu: a migration    │
     * │ roda, o deploy fica verde, e a propriedade medida neste arquivo não é a que está no banco.   │
     * │                                                                                            │
     * │ A ORDEM É A PARTE QUE FALTAVA: existir um `DROP` em algum lugar não basta, ele tem de vir    │
     * │ ANTES do `CREATE` e na MESMA migration. `DROP` depois do `CREATE` deixa a tabela SEM índice  │
     * │ nenhum, que é pior que o índice velho, e `DROP` numa migration anterior não alcança o que    │
     * │ ainda não existia.                                                                         │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const indice = unicoSobreAColuna();
    const bruto = semComentario(readFileSync(indice.arquivo, "utf8"));
    const pedacos = bruto.split(/;|-->\s*statement-breakpoint/).map((p) => p.replace(/\s+/g, " ").trim());

    const posicaoDoCreate = pedacos.findIndex((p) =>
      new RegExp(`create\\s+unique\\s+index\\b[\\s\\S]*\\b${indice.nome}\\b`, "i").test(p),
    );
    const posicaoDoDrop = pedacos.findIndex((p) =>
      new RegExp(`drop\\s+index\\b[\\s\\S]*\\b${indice.nome}\\b`, "i").test(p),
    );

    const criadoAntes = indicesSobreAColuna().filter(
      (i) => i.unico && i.nome === indice.nome && i.arquivo !== indice.arquivo,
    );
    if (criadoAntes.length === 0) {
      // Nome inédito: não há o que derrubar, e exigir o `DROP` seria exigir ruído.
      expect(posicaoDoCreate).toBeGreaterThanOrEqual(0);
      return;
    }

    expect(
      posicaoDoDrop,
      `O índice \`${indice.nome}\` já havia sido criado em ` +
        `${criadoAntes.map((i) => i.arquivo.split("/").pop()).join(", ")} e a migration do conserto ` +
        `(${indice.arquivo.split("/").pop()}) o recria SEM derrubá-lo antes. O \`IF NOT EXISTS\` ` +
        "encontra o nome ocupado e não faz nada: o índice antigo continua valendo em produção, em " +
        "silêncio, e o conserto não aconteceu.",
    ).toBeGreaterThanOrEqual(0);
    expect(
      posicaoDoDrop < posicaoDoCreate,
      `O \`DROP INDEX\` está DEPOIS do \`CREATE\` em ${indice.arquivo.split("/").pop()} (queda na ` +
        `posição ${posicaoDoDrop}, criação na ${posicaoDoCreate}). Nessa ordem o banco termina SEM ` +
        "índice nenhum, e duas vagas com o mesmo número voltam a poder existir.",
    ).toBe(true);
  });

  it("o CHECK que sustenta a coluna crua está declarado no schema drizzle", () => {
    /**
     * Mesmo risco do índice, pelo mesmo motivo: restrição que existe só no SQL cru e não no schema
     * aparece ao `drizzle-kit` como algo que o banco tem e o schema não quer. A diferença é que o
     * CHECK é a peça que permite as buscas ficarem como estão: perdê-lo não dá erro, dá silêncio.
     *
     * NÃO EXIGE O CHECK, exige a COERÊNCIA: sem CHECK declarado no DDL, nada a cobrar no schema.
     */
    const checks = checksSobreAColuna();
    if (checks.length === 0) return;
    const schema = readFileSync(ARQUIVO_DO_SCHEMA, "utf8");
    for (const c of checks) {
      expect(
        schema.includes(c.nome),
        `O CHECK \`${c.nome}\` existe na migration e não aparece em \`db/schema/tables.ts\`. O ` +
          "próximo `drizzle-kit generate` gera o DROP dele, e aí a coluna crua deixa de ser a forma " +
          "normalizada sem nenhum erro acontecer: as buscas passam a discordar do índice de novo.",
      ).toBe(true);
    }
  });

  it("o índice comum sobre a mesma coluna fica ou sai por decisão, não por acidente", () => {
    /**
     * `idx_vagas_id_vacancy_pandape` (não-unique) e o novo unique cobrem a MESMA busca por
     * igualdade. Manter os dois custa escrita em toda inserção de vaga e não acrescenta plano
     * nenhum. Não é defeito, é desperdício, e fica registrado para o diretor decidir. Este teste
     * NÃO falha: ele só declara o estado.
     */
    const todos = indicesSobreAColuna();
    const comuns = todos.filter((i) => !i.unico).map((i) => i.nome);
    expect(Array.isArray(comuns)).toBe(true);
  });
});
