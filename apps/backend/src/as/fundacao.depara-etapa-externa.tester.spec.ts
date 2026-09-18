import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";

/**
 * ─ FUNDAÇÃO, PEÇA 4: O DE/PARA DAS ETAPAS EXTERNAS, E O FAIL-CLOSED DELE ──────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita JUNTO com a construção (§A.40, regra 2), a partir do
 * requisito (`docs/MAPA-ALCANCE-FUNDACAO-UNIFICADORA.md`, seções 3 e 8).
 *
 * ┌─ A PROPRIEDADE QUE DECIDE ESTA PEÇA: NÃO CHUTAR ────────────────────────────────────────────┐
 * │ São DEZ etapas no Pandapé e QUATRO casamentos confirmados. As outras seis (cinco nomes mais  │
 * │ o `Pré-selecionadoS`) estão DELIBERADAMENTE sem mapa, esperando decisão do diretor. Um       │
 * │ resolvedor que "aproxime" (cai na etapa mais parecida, ou na primeira, ou na inicial) move   │
 * │ pessoa de caneco por conta própria, e ninguém percebe: a tela mostra um funil plausível.     │
 * │ `Descartados` viraria uma ETAPA em vez de um DESFECHO, e o candidato descartado apareceria   │
 * │ vivo na fila de alguém.                                                                      │
 * │                                                                                              │
 * │ AUSÊNCIA DE LINHA É "NÃO MAPEADA", e o chamador não faz NADA. É fail-closed, e o teste fixa  │
 * │ os seis nomes por escrito para que mapear um deles passe a ser uma DECISÃO, com vermelho no  │
 * │ caminho, e nunca um efeito colateral de alguém "completando" a tabela.                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O SEGUNDO RISCO: A CHAVE ─────────────────────────────────────────────────────────────────┐
 * │ Os nomes vieram medidos da API, e são TEXTO LIVRE com caixa e pontuação irregulares:         │
 * │ `Lead`, `triados`, `ENTREVISTA SOULAN`, `SHORT LIST, ENCAMINHADOS CLIENTE`. Eles MUDAM POR   │
 * │ VAGA. Casar pelo nome cru funciona na vaga em que foi medido e para de funcionar na vaga do  │
 * │ lado, onde alguém digitou "Triados" com maiúscula, e o sintoma é o mesmo do fail-closed      │
 * │ legítimo: nada acontece. Um defeito que se disfarça de comportamento correto.                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O SERVIÇO É DESCOBERTO NO DISCO, e não importado por um nome que eu teria escolhido ────────
 * Escrever antes do código significa não saber o nome do arquivo nem o da classe. A varredura
 * procura o módulo do de/para por radical e falha com UMA frase dizendo o que foi procurado, em
 * vez de o arquivo inteiro morrer na coleta por um `import` que não resolve.
 *
 * §A.6: nenhum dado pessoal. Nomes de pasta de vaga, códigos de etapa e a régua de normalização.
 */

const TABELA = "as_depara_etapa_externa";

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0. OS NOMES REAIS DO PANDAPÉ, COMO ELES VIERAM
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * OS CASAMENTOS CONFIRMADOS: cinco pastas do Pandapé, quatro etapas do funil (`Lead` e `Inscritos`
 * caem na MESMA). Digitados à mão, com a grafia EXATA que a API devolveu
 * (`docs/MAPA-COMPLETO-API-PANDAPE.md`, seção 3.3), inclusive a caixa esquisita e a vírgula.
 */
const CASAMENTOS = [
  { externo: "Lead", etapa: "CAPTACAO" },
  { externo: "Inscritos", etapa: "CAPTACAO" },
  { externo: "triados", etapa: "TRIAGEM" },
  { externo: "ENTREVISTA SOULAN", etapa: "ENTREVISTA_SOULAN" },
  { externo: "SHORT LIST, ENCAMINHADOS CLIENTE", etapa: "ENTREVISTA_CLIENTE" },
] as const;

/**
 * ─ AS CINCO QUE FALTAVAM, DECIDIDAS PELO DIRETOR EM 17/09/2026 ────────────────────────────────
 *
 * ESTA LISTA AFIRMAVA O CONTRÁRIO DISTO. Até a migration 0111 ela se chamava `SEM_MAPA` e dizia,
 * em caixa alta, que as cinco pastas esperavam decisão e que mapear qualquer uma ficaria VERMELHO.
 * A decisão saiu, e a asserção velha não podia ficar: teste que guarda decisão revogada passa a
 * defender o contrário do que o diretor quer, e quem o lê depois acredita nele.
 *
 * O DESTINO DE CADA UMA ESTÁ DIGITADO À MÃO, contra a tabela da decisão e nunca lido da migration:
 * derivar o esperado do mesmo arquivo que se mede faria o teste concordar com qualquer coisa que
 * estivesse escrita lá, que é o defeito de parser que originou esta correção.
 *
 * OS MOTIVOS NÃO ENTRAM AQUI DE PROPÓSITO (item 2 da cobertura): o que se exige é que os dois
 * descartes tenham motivos DIFERENTES e não vazios, e não qual é a frase. Fixar o texto deixaria o
 * teste vermelho no dia em que o diretor reescrevesse o rótulo, que é edição legítima dele.
 */
const DECIDIDAS = [
  { externo: "Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)", etapa: "TRIAGEM", situacao: null },
  { externo: "Contratados", etapa: "APROVACAO", situacao: "ENVIADO_PARA_ADMISSAO" },
  { externo: "RETORNO VAGA STAND BY", etapa: "STAND_BY", situacao: null },
  { externo: "RETORNO NEGATIVO", etapa: null, situacao: "DESCARTADO" },
  { externo: "Descartados", etapa: null, situacao: "DESCARTADO" },
] as const;

/** AS DUAS PASTAS DE DESCARTE, que caem no mesmo desfecho e só se distinguem pelo motivo. */
const OS_DOIS_DESCARTES = ["RETORNO NEGATIVO", "Descartados"] as const;

interface PastaEsperada {
  externo: string;
  etapa: string | null;
  situacao: string | null;
}

/** AS DEZ PASTAS MEDIDAS NA API, agora todas com destino. Nenhuma fica não mapeada (item 1). */
const AS_DEZ: PastaEsperada[] = [
  ...CASAMENTOS.map((c) => ({ externo: c.externo, etapa: c.etapa as string | null, situacao: null })),
  ...DECIDIDAS.map((d) => ({
    externo: d.externo,
    etapa: d.etapa as string | null,
    situacao: d.situacao as string | null,
  })),
];

/**
 * ─ O FAIL-CLOSED NÃO MORREU COM A DECISÃO, e é o item 7 da cobertura ──────────────────────────
 *
 * As pastas do Pandapé são TEXTO LIVRE, criadas por quem abre a vaga: a pasta inédita é o normal do
 * dia a dia, e não uma falha. Mapear as dez de hoje não pode transformar a décima primeira, que
 * alguém vai criar amanhã, num chute. Os nomes abaixo não existem em lugar nenhum de propósito, e
 * dois deles são PARECIDOS com pastas reais: é a aproximação que se quer ver recusada.
 */
const INVENTADAS = [
  "ENTREVISTA TECNICA TERCEIRIZADA",
  "Triagem Documental 2a Fase",
  "RETORNO POSITIVO",
  "Pasta que alguem criou hoje de manha",
] as const;

/**
 * OS SEIS códigos do funil, para afirmar que o resolvedor NÃO devolveu nenhum deles.
 *
 * `STAND_BY` entrou junto com a 0111, e entrar nesta lista é o que impede o buraco silencioso: sem
 * ele aqui, uma pasta inventada resolvida em stand by passaria por baixo do fail-closed inteiro.
 */
const CODIGOS_DO_FUNIL = [
  "CAPTACAO",
  "TRIAGEM",
  "ENTREVISTA_SOULAN",
  "ENTREVISTA_CLIENTE",
  "APROVACAO",
  "STAND_BY",
] as const;

/**
 * ─ O CANÔNICO DO TESTE, QUE NÃO É A NORMALIZAÇÃO DA IMPLEMENTAÇÃO ─────────────────────────────
 *
 * ELE SERVE PARA COMPARAR, e nunca para ditar a forma. O requisito diz que a chave é o nome
 * NORMALIZADO (sem acento, caixa uniforme, espaço colapsado), e não diz se a caixa escolhida é
 * alta ou baixa, nem se a pontuação some ou vira espaço. Exigir uma das formas seria medir gosto:
 * o mapa propôs maiúsculas, a construção escolheu minúsculas com pontuação virando espaço, e as
 * duas cumprem o requisito igualmente.
 *
 * O QUE ELE EXIGE, E É O QUE IMPORTA: que a chave gravada seja UMA normalização do nome, e não o
 * nome cru. As comparações são feitas nos DOIS lados com esta função, então a forma da
 * implementação passa, e um nome cru guardado com acento e vírgula NÃO passa (ver o caso que
 * separa os dois, logo abaixo do parser da semente).
 */
function canonico(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A FORMA DA TABELA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

type TabelaDoSchema = Parameters<typeof getTableConfig>[0];

function tabela(nomeSql: string): TabelaDoSchema | null {
  for (const valor of Object.values(schema as Record<string, unknown>)) {
    try {
      if (getTableConfig(valor as TabelaDoSchema).name === nomeSql) return valor as TabelaDoSchema;
    } catch {
      // Não é uma tabela do drizzle. Segue.
    }
  }
  return null;
}

function config(nomeSql: string) {
  const t = tabela(nomeSql);
  if (!t) {
    throw new Error(
      `FALTA CONSTRUIR: não existe a tabela "${nomeSql}" no schema do drizzle. ` +
        "O de/para é CONFIGURÁVEL EM TABELA, nunca fixo no código (item 3 da OST).",
    );
  }
  return getTableConfig(t);
}

function executavel(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ");
}

/**
 * O SQL DE TODAS AS MIGRATIONS, sem filtro de tabela: é por ele que se pergunta se a etapa
 * `STAND_BY` existe no CATÁLOGO, que é outra tabela e mora em outro statement.
 */
const SQL_DE_TUDO = (() => {
  const dir = join(__dirname, "..", "..", "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => executavel(readFileSync(join(dir, f), "utf8")))
    .join(" ");
})();

const SQL_DAS_MIGRATIONS = (() => {
  const dir = join(__dirname, "..", "..", "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .filter((t) => /as_depara_etapa_externa/i.test(t))
    .map(executavel)
    .join(" ");
})();

interface LinhaSemeada {
  fonte: string;
  chave: string;
  rotulo: string;
  /** `etapa_codigo`. NULO É RESPOSTA: quem é descartado não muda de lugar no funil, ele sai dele. */
  destino: string | null;
  situacao: string | null;
  motivo: string | null;
}

/**
 * ─ OS VALORES DE UMA TUPLA DE `VALUES`, com `NULL` virando nulo de verdade ────────────────────
 *
 * Escrito à mão porque a alternativa é uma expressão regular de quatro campos entre aspas, que foi
 * exatamente o defeito anterior deste arquivo: ela casava a semente de quatro colunas da 0110 e
 * ignorava, em silêncio, as linhas de seis colunas da 0111, em que dois valores são `NULL` sem
 * aspas. Tupla ignorada não é tupla vermelha, é tupla que nunca foi medida.
 */
function valoresDaTupla(tupla: string): (string | null)[] {
  const valores: (string | null)[] = [];
  let i = 0;
  while (i < tupla.length) {
    const c = tupla[i]!;
    if (c === "'") {
      let texto = "";
      i += 1;
      while (i < tupla.length) {
        // `''` dentro do literal é uma aspa escapada, e não o fim do texto.
        if (tupla[i] === "'" && tupla[i + 1] === "'") {
          texto += "'";
          i += 2;
          continue;
        }
        if (tupla[i] === "'") {
          i += 1;
          break;
        }
        texto += tupla[i];
        i += 1;
      }
      valores.push(texto);
      continue;
    }
    if (/[A-Za-z0-9_]/.test(c)) {
      let palavra = "";
      while (i < tupla.length && /[A-Za-z0-9_]/.test(tupla[i]!)) {
        palavra += tupla[i];
        i += 1;
      }
      valores.push(/^null$/i.test(palavra) ? null : palavra);
      continue;
    }
    i += 1;
  }
  return valores;
}

/**
 * AS TUPLAS DE UM CORPO DE `VALUES`, respeitando ASPAS.
 *
 * O parêntese não é delimitador confiável neste arquivo, e há um caso REAL provando isso: o rótulo
 * `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` tem parênteses DENTRO do literal, e um recorte
 * por expressão regular parte a tupla no meio da frase. Foi o primeiro vermelho deste parser, e ele
 * apareceu porque a versão nova ESTOURA no que não entende, em vez de pular calada.
 */
function tuplasDoCorpo(corpo: string): string[] {
  const tuplas: string[] = [];
  let profundidade = 0;
  let inicio = -1;
  let dentroDeAspas = false;
  for (let i = 0; i < corpo.length; i += 1) {
    const c = corpo[i]!;
    if (dentroDeAspas) {
      if (c === "'" && corpo[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (c === "'") dentroDeAspas = false;
      continue;
    }
    if (c === "'") {
      dentroDeAspas = true;
      continue;
    }
    if (c === "(") {
      if (profundidade === 0) inicio = i;
      profundidade += 1;
      continue;
    }
    if (c === ")") {
      profundidade -= 1;
      if (profundidade === 0 && inicio >= 0) tuplas.push(corpo.slice(inicio, i + 1));
    }
  }
  return tuplas;
}

/** Quantos `INSERT` na tabela o parser enxergou. É medido por um caso, e não só usado aqui. */
let INSERTS_LIDOS = 0;

/**
 * ─ A SEMENTE, LIDA DA MIGRATION E NÃO DIGITADA AQUI ───────────────────────────────────────────
 *
 * É ela que abastece o banco fingido mais abaixo, e essa escolha é o que torna o teste do
 * resolvedor uma medida de ponta a ponta: as linhas que o serviço lê são AS MESMAS que vão para o
 * banco de verdade, com a chave na forma EXATA em que a construção decidiu gravá-la. Fixtures
 * digitados aqui mediriam a minha suposição de normalização contra a dela, e ficariam vermelhos
 * contra uma implementação certa (foi o que aconteceu na primeira escrita deste arquivo).
 */
const SEMENTE: LinhaSemeada[] = (() => {
  const linhas: LinhaSemeada[] = [];
  const inserts = [
    ...SQL_DAS_MIGRATIONS.matchAll(
      /insert\s+into\s+"?as_depara_etapa_externa"?\s*\(([^)]*)\)\s*values\s*([^;]*);/gi,
    ),
  ];
  INSERTS_LIDOS = inserts.length;
  for (const insert of inserts) {
    const colunas = [...insert[1]!.matchAll(/[a-z_]+/gi)].map((m) => m[0]!.toLowerCase());
    // O `ON CONFLICT (...)` traz parênteses que NÃO são linha de dado, e entram no mesmo statement.
    const corpo = insert[2]!.split(/\bon\s+conflict\b/i)[0]!;
    for (const tupla of tuplasDoCorpo(corpo)) {
      const valores = valoresDaTupla(tupla);
      // ESTOURAR, E NUNCA PULAR: uma tupla que o parser não entende tem de fazer barulho. Pular em
      // silêncio é como o arquivo ficou verde afirmando uma decisão revogada.
      if (valores.length !== colunas.length) {
        throw new Error(
          `o parser da semente não entendeu a tupla ${tupla}: ${valores.length} valores para ` +
            `${colunas.length} colunas (${colunas.join(", ")})`,
        );
      }
      const valor = (nome: string): string | null => {
        const i = colunas.indexOf(nome);
        return i < 0 ? null : valores[i]!;
      };
      linhas.push({
        fonte: valor("fonte") ?? "",
        chave: valor("chave_externa") ?? "",
        rotulo: valor("rotulo_externo") ?? "",
        destino: valor("etapa_codigo"),
        situacao: valor("situacao"),
        motivo: valor("motivo_padrao"),
      });
    }
  }
  return linhas;
})();

/** A linha semeada de uma pasta, pelo canônico dos dois lados, ou nada. */
function semeada(externo: string): LinhaSemeada | undefined {
  return SEMENTE.find(
    (l) => canonico(l.rotulo) === canonico(externo) || canonico(l.chave) === canonico(externo),
  );
}

function exigirSemeada(externo: string): LinhaSemeada {
  const linha = semeada(externo);
  if (!linha) {
    throw new Error(
      `a semente não traz "${externo}". Semeadas: ${JSON.stringify(SEMENTE.map((l) => l.rotulo))}`,
    );
  }
  return linha;
}

describe("o de/para mora em TABELA, e não no código", () => {
  it("a semente do de/para existe e é legível", () => {
    expect(
      SEMENTE.length,
      "nenhuma linha de de/para semeada. Sem semente, TODO nome externo é não mapeada e a " +
        "ingestão futura não move ninguém de etapa.",
    ).toBeGreaterThan(0);
  });

  it("a tabela existe com fonte, chave normalizada e rótulo de origem", () => {
    const nomes = config(TABELA).columns.map((c) => c.name);
    for (const esperada of ["fonte", "chave_externa", "rotulo_externo"]) {
      expect(nomes, `falta a coluna ${esperada}`).toContain(esperada);
    }
  });

  /**
   * OS DOIS DESTINOS SÃO SEPARADOS E NULÁVEIS, e é isso que permite dizer "esta pasta não é um
   * caneco do funil, é um desfecho". Uma coluna só, obrigatória, forçaria `Descartados` a virar
   * etapa, e escreveria um movimento de funil que não aconteceu.
   */
  it("tem destino de ETAPA e destino de SITUAÇÃO, os dois nuláveis", () => {
    const cols = config(TABELA).columns;
    const etapa = cols.find((c) => /etapa/i.test(c.name));
    const situacao = cols.find((c) => /situacao|desfecho/i.test(c.name));
    expect(etapa, `colunas: ${JSON.stringify(cols.map((c) => c.name))}`).toBeDefined();
    expect(situacao, `colunas: ${JSON.stringify(cols.map((c) => c.name))}`).toBeDefined();
    expect(etapa!.notNull, "etapa obrigatória forçaria Descartados a virar caneco").toBe(false);
    expect(situacao!.notNull).toBe(false);
  });

  /**
   * ─ O CHECK QUE IMPEDE A LINHA MUDA ───────────────────────────────────────────────────────────
   *
   * Com os dois destinos nuláveis, nada impede uma linha com os DOIS vazios: ela existe, casa com
   * o nome externo, e não faz nada. O sintoma é idêntico ao do "não mapeada" legítimo, então
   * ninguém investiga, e o mapeamento que alguém achou que tinha cadastrado nunca funcionou.
   */
  it("um CHECK exige ao menos um dos dois destinos", () => {
    // O NOME do check, e nunca o objeto inteiro: a coluna do drizzle aponta de volta para a
    // tabela, então serializá-lo estoura em referência circular (primeiro vermelho deste caso).
    const nomesDosChecks = config(TABELA)
      .checks.map((c) => c.name)
      .join(" ");
    const destinoNoSql = /check\s*\([^)]*etapa_codigo[^)]*is\s+not\s+null[^)]*\)/i.test(
      SQL_DAS_MIGRATIONS,
    );
    const temCheck = /destino|etapa|situacao/i.test(nomesDosChecks) || destinoNoSql;
    expect(
      temCheck,
      "sem o CHECK, cabe uma linha que casa com o nome externo e não aponta para lugar nenhum",
    ).toBe(true);
  });

  /**
   * UNIQUE (fonte, chave_externa): duas linhas para o mesmo nome externo tornam a resolução
   * dependente da ordem de leitura, que é o defeito que some no teste e aparece em produção.
   */
  it("existe UNIQUE (fonte, chave_externa)", () => {
    const cfg = config(TABELA);
    const doSchema = [
      ...cfg.uniqueConstraints.map((u) => u.columns.map((c) => c.name)),
      ...cfg.indexes
        .filter((i) => (i as unknown as { config: { unique?: boolean } }).config.unique === true)
        .map((i) =>
          ((i as unknown as { config: { columns?: unknown[] } }).config.columns ?? []).map(
            (c) => (c as { name?: string }).name ?? "",
          ),
        ),
    ].map((cols) => cols.sort());
    const noSql = new RegExp(
      `create\\s+unique\\s+index[^;]*?on\\s+"?${TABELA}"?\\s*\\([^)]*chave_externa[^)]*\\)`,
      "i",
    ).test(SQL_DAS_MIGRATIONS);
    expect(
      doSchema.some((c) => c.join(",") === "chave_externa,fonte") || noSql,
      `uniques de hoje: ${JSON.stringify(doSchema)}`,
    ).toBe(true);
  });

  /**
   * A CHAVE GUARDADA É A NORMALIZADA, e o rótulo cru fica ao lado para a tela futura. Guardar só o
   * cru devolve o problema para a leitura, que passaria a normalizar os dois lados a cada consulta
   * e a não poder usar índice nenhum.
   */
  it.each(CASAMENTOS)("a semente traz $externo com a chave normalizada e o destino $etapa", ({
    externo,
    etapa,
  }) => {
    const linha = SEMENTE.find((l) => canonico(l.rotulo) === canonico(externo));
    expect(
      linha,
      `a semente não traz "${externo}". Semeadas: ${JSON.stringify(SEMENTE.map((l) => l.rotulo))}`,
    ).toBeDefined();
    expect(canonico(linha!.chave), "a chave gravada tem de ser uma normalização do nome").toBe(
      canonico(externo),
    );
    expect(linha!.destino).toBe(etapa);
  });

  /**
   * A CHAVE NÃO PODE SER O NOME CRU, e este é o caso que separa "normalizado" de "copiado". Ele
   * morde exatamente onde o de/para quebraria de verdade: `SHORT LIST, ENCAMINHADOS CLIENTE` tem
   * vírgula e `Pré-selecionadoS` tem acento e caixa no meio da palavra. Chave crua funciona na
   * vaga medida e falha na vaga do lado, em silêncio.
   */
  it("nenhuma chave semeada é o nome CRU, com acento ou pontuação", () => {
    for (const linha of SEMENTE) {
      expect(/[^a-z0-9 ]/i.test(linha.chave), `a chave "${linha.chave}" não está normalizada`).toBe(
        false,
      );
      expect(
        linha.chave.trim() === linha.chave && !/\s{2,}/.test(linha.chave),
        `a chave "${linha.chave}" tem espaço sobrando: ela não passou pela normalização`,
      ).toBe(true);
    }
    // A PASTA MAIS FEIA DAS DEZ tem de ter chave limpa, e é ela que prova que a régra não é
    // "copiar o nome": `triados` já nasce normalizado e passaria em qualquer coisa.
    const feia = SEMENTE.find((l) => /SHORT LIST/i.test(l.rotulo));
    expect(feia, "a pasta com vírgula no nome não foi semeada").toBeDefined();
    expect(feia!.chave, "a chave da pasta com vírgula continua sendo o nome cru").not.toBe(
      feia!.rotulo,
    );
  });

  /**
   * ─ O PARSER LÊ TODAS AS MIGRATIONS, e este caso existe por causa do defeito que ele corrige ──
   *
   * A leitura anterior casava UM `INSERT` (regex sem a flag global, primeiro casamento), que é o da
   * 0110, e nunca enxergava o da 0111. O arquivo inteiro ficava VERDE afirmando uma decisão
   * revogada, porque metade da semente não existia para ele. Um parser que lê metade do texto dá
   * verde para qualquer coisa que esteja na outra metade, e não há como perceber olhando o relato.
   */
  it("a semente é lida de TODAS as migrations que semeiam o de/para, e não só da primeira", () => {
    const quantosArquivosSemeiam = (SQL_DAS_MIGRATIONS.match(
      /insert\s+into\s+"?as_depara_etapa_externa"?/gi,
    ) ?? []).length;
    expect(
      INSERTS_LIDOS,
      "o parser enxergou menos INSERT do que existe no disco: ele está lendo só o primeiro",
    ).toBe(quantosArquivosSemeiam);
    expect(INSERTS_LIDOS, "há mais de uma migration semeando o de/para desde a 0111").toBeGreaterThan(
      1,
    );
  });

  /**
   * ─ AS DEZ RESOLVEM, E NENHUMA FICA SEM MAPA (item 1) ─────────────────────────────────────────
   *
   * Esta lista já foi a lista das que NÃO podiam estar aqui. A decisão do diretor de 17/09/2026
   * inverteu o caso, e a inversão é o ponto: cada uma das dez pastas medidas na API tem destino, e
   * o destino esperado está digitado à mão, contra a decisão e não contra a migration.
   */
  it.each(AS_DEZ)("a pasta $externo está semeada, com o destino decidido", ({
    externo,
    etapa,
    situacao,
  }) => {
    const linha = exigirSemeada(externo);
    expect(canonico(linha.chave), "a chave gravada tem de ser uma normalização do nome").toBe(
      canonico(externo),
    );
    expect(linha.destino, `a etapa de "${externo}"`).toBe(etapa);
    expect(linha.situacao, `a situação de "${externo}"`).toBe(situacao);
    expect(
      linha.destino !== null || linha.situacao !== null,
      `"${externo}" tem linha, mas não aponta para lugar nenhum: é mapeamento mudo`,
    ).toBe(true);
  });

  /**
   * ┌─ O CASO MAIS IMPORTANTE DESTA COBERTURA (item 2) ───────────────────────────────────────────┐
   * │ `RETORNO NEGATIVO` e `Descartados` NÃO PODEM CAIR NO MESMO LUGAR. Os dois são descarte, e o  │
   * │ que os separa é o MOTIVO: um é o cliente recusando, o outro é a seleção descartando. Apagar  │
   * │ um dos motivos, ou copiar o mesmo texto nos dois, mata a distinção EM SILÊNCIO: as duas      │
   * │ linhas continuam existindo, a ingestão continua rodando, e a tela passa a contar uma história│
   * │ só onde havia duas.                                                                          │
   * │                                                                                               │
   * │ A COMPARAÇÃO É ENTRE OS DOIS VALORES, e nunca contra um texto fixo: o diretor pode reescrever │
   * │ as frases quando quiser, e o teste tem de continuar valendo. O que ele exige é que os dois    │
   * │ existam, não sejam brancos e sejam DIFERENTES.                                                │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("os dois descartes têm o MESMO desfecho e motivos DIFERENTES", () => {
    const [negativo, descartado] = OS_DOIS_DESCARTES.map(exigirSemeada);
    expect(negativo!.situacao, "o desfecho de descarte é um só").toBe(descartado!.situacao);
    expect(negativo!.situacao).toBe("DESCARTADO");
    for (const linha of [negativo!, descartado!]) {
      expect(
        (linha.motivo ?? "").trim(),
        `"${linha.rotulo}" ficou sem motivo, e sem ele os dois descartes viram a mesma coisa`,
      ).not.toBe("");
    }
    expect(
      negativo!.motivo,
      "os dois descartes ficaram com o MESMO motivo: a distinção que o diretor pediu morreu",
    ).not.toBe(descartado!.motivo);
  });

  /**
   * QUEM É DESCARTADO NÃO MUDA DE LUGAR NO FUNIL, ELE SAI DELE (item 3). Escrever uma etapa ali
   * registraria no histórico da pessoa um movimento que não aconteceu, e trilha de seleção não se
   * desfaz.
   */
  it.each(OS_DOIS_DESCARTES)("%s não aponta etapa nenhuma", (nome) => {
    expect(
      exigirSemeada(nome).destino,
      "descarte com etapa escreve no histórico um movimento que ninguém fez",
    ).toBeNull();
  });

  /**
   * `Contratados` CARREGA OS DOIS (item 4): a etapa diz ONDE a pessoa parou no funil, e a situação
   * diz que ela ATRAVESSOU para a esteira de admissão. Só a etapa deixaria um aprovado parado na
   * Aprovação para sempre; só a situação apagaria o caneco em que ele terminou.
   */
  it("Contratados carrega etapa E situação", () => {
    const linha = exigirSemeada("Contratados");
    expect(linha.destino).toBe("APROVACAO");
    expect(linha.situacao).toBe("ENVIADO_PARA_ADMISSAO");
  });

  /**
   * ─ A SEXTA ETAPA TEM DE EXISTIR NO CATÁLOGO, SENÃO A MIGRATION NEM SOBE (item 5) ─────────────
   *
   * A FK de `etapa_codigo` é RESTRICT contra `as_etapas_funil`: um de/para que aponte para um
   * código inexistente derruba a migration inteira na subida, e leva o boot do backend junto. O
   * mapeamento e a criação da etapa são uma coisa só, e por isso são medidos no mesmo caso.
   */
  it("RETORNO VAGA STAND BY cai em STAND_BY, e a etapa STAND_BY existe no catálogo", () => {
    expect(exigirSemeada("RETORNO VAGA STAND BY").destino).toBe("STAND_BY");
    const semeiaAEtapa =
      /insert\s+into\s+"?as_etapas_funil"?[^;]*'STAND_BY'/i.test(SQL_DE_TUDO);
    expect(
      semeiaAEtapa,
      "o de/para aponta para STAND_BY e nenhuma migration cria essa etapa: a FK RESTRICT derruba " +
        "a subida inteira, e com ela o boot do backend",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O RESOLVEDOR, DESCOBERTO NO DISCO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Todos os arquivos `.ts` de `src/` cujo nome fala de de/para, fora os próprios testes. */
function arquivosDoDePara(): string[] {
  const raiz = join(__dirname, "..");
  const achados: string[] = [];
  const varrer = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        if (entrada !== "node_modules") varrer(caminho);
        continue;
      }
      if (!entrada.endsWith(".ts") || /\.spec\.ts$/.test(entrada)) continue;
      if (/depara|de-para/i.test(entrada)) achados.push(caminho);
    }
  };
  varrer(raiz);
  return achados;
}

interface Resolvedor {
  resolver: (fonte: string, nome: string) => Promise<unknown>;
  origem: string;
}

/**
 * AS LINHAS DO BANCO FINGIDO, VINDAS DA SEMENTE DE VERDADE, com as chaves nos DOIS estilos de
 * nomenclatura: o fake não escolhe como o serviço lê a coluna.
 */
const LINHAS: Record<string, unknown>[] = SEMENTE.map((l, i) => ({
  id: i + 1,
  fonte: l.fonte,
  chave_externa: l.chave,
  chaveExterna: l.chave,
  rotulo_externo: l.rotulo,
  rotuloExterno: l.rotulo,
  etapa_codigo: l.destino,
  etapaCodigo: l.destino,
  situacao: l.situacao,
  // O MOTIVO VEM DA SEMENTE DE VERDADE, e não de um fixture: é ele que distingue os dois descartes,
  // e um fake que devolvesse nulo faria o caso do motivo medir a minha suposição, nunca a migration.
  motivo_padrao: l.motivo,
  motivoPadrao: l.motivo,
  ativo: true,
}));

/** Reconstrói o texto de uma cláusula do drizzle, para o fake filtrar pelo que ela menciona. */
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
 * O BANCO FINGIDO DO DE/PARA, e ele é deliberadamente permissivo em uma direção só.
 *
 * A consulta que CITA uma chave recebe a linha daquela chave; a consulta que não cita nenhuma
 * (o serviço que carrega o catálogo inteiro e filtra em memória, que é desenho legítimo e provável
 * num de/para de dez linhas) recebe TODAS. As duas implementações são aceitas, e nenhuma das duas
 * ganha de graça: quem filtra em memória ainda precisa normalizar certo para achar a linha.
 */
function bancoFingido(): unknown {
  const filtrar = (clausula: string): Record<string, unknown>[] => {
    // A FONTE É HONRADA DE VERDADE, e sem isto o caso "outra fonte não herda o mapa" ficaria
    // VERMELHO contra uma implementação CERTA: a consulta filtraria por fonte e o fake devolveria
    // a linha assim mesmo.
    if (clausula.trim() && !clausula.includes("PANDAPE")) return [];
    const citadas = LINHAS.filter((l) => clausula.includes(String(l.chave_externa)));
    return (citadas.length ? citadas : clausula.trim() ? [] : LINHAS).map((l) => ({ ...l }));
  };

  const leitura = () => {
    let clausula = "";
    const b: Record<string, unknown> = {};
    const resolver = () => Promise.resolve(filtrar(clausula));
    b.from = () => b;
    b.where = (c: unknown) => {
      clausula += ` ${textoDoSql(c)}`;
      return b;
    };
    b.orderBy = () => b;
    b.limit = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => resolver().then(ok, err);
    b.catch = (f: (e: unknown) => unknown) => resolver().catch(f);
    return b;
  };

  const db: Record<string, unknown> = {
    select: () => leitura(),
    execute: (q: unknown) => Promise.resolve(filtrar(textoDoSql(q))),
  };
  db.query = new Proxy(
    {},
    {
      get: () => ({
        findFirst: async (args?: { where?: unknown }) => filtrar(textoDoSql(args?.where))[0],
        findMany: async (args?: { where?: unknown }) => filtrar(textoDoSql(args?.where)),
      }),
    },
  );
  return db;
}

const NOMES_DO_METODO = [
  "resolver",
  "resolve",
  "resolverEtapa",
  "resolverEtapaExterna",
  "resolverDestino",
  "mapear",
  "traduzir",
  "destinoDe",
  "para",
];

/** Carrega o resolvedor, ou explica em uma frase o que foi procurado e não existe. */
async function carregarResolvedor(): Promise<Resolvedor> {
  const arquivos = arquivosDoDePara();
  if (!arquivos.length) {
    throw new Error(
      "FALTA CONSTRUIR: nenhum arquivo de `apps/backend/src/as/` fala de de/para (procurei por " +
        "nome de arquivo casando /depara|de-para/). O requisito é um SERVIÇO de resolução que " +
        "receba (fonte, nome cru da etapa externa) e devolva o destino, ou NÃO MAPEADA.",
    );
  }
  const problemas: string[] = [];
  for (const caminho of arquivos) {
    const mod = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
    for (const [nome, valor] of Object.entries(mod)) {
      if (typeof valor !== "function") continue;
      let instancia: Record<string, unknown>;
      try {
        instancia = new (valor as new (db: unknown) => Record<string, unknown>)(bancoFingido());
      } catch (e) {
        problemas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const metodo = NOMES_DO_METODO.find((m) => typeof instancia[m] === "function");
      if (!metodo) continue;
      return {
        origem: `${caminho} -> ${nome}.${metodo}`,
        resolver: (fonte: string, cru: string) =>
          Promise.resolve((instancia[metodo] as (...a: unknown[]) => unknown)(fonte, cru)),
      };
    }
  }
  throw new Error(
    "FALTA CONSTRUIR: achei os arquivos do de/para mas nenhuma classe com método de resolução. " +
      `Arquivos: ${JSON.stringify(arquivos)}. Métodos procurados: ${NOMES_DO_METODO.join(", ")}. ` +
      `Problemas ao instanciar: ${JSON.stringify(problemas)}`,
  );
}

/** O que o resolvedor devolveu, como texto, para procurar (ou não achar) o código da etapa. */
function comoTexto(r: unknown): string {
  if (r === null || r === undefined) return "";
  return typeof r === "string" ? r : JSON.stringify(r);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. OS QUATRO CASAMENTOS RESOLVEM, COM OS NOMES REAIS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("os casamentos confirmados resolvem, com a grafia que a API devolveu", () => {
  it.each(CASAMENTOS)("$externo cai em $etapa", async ({ externo, etapa }) => {
    const { resolver, origem } = await carregarResolvedor();
    const r = await resolver("PANDAPE", externo);
    expect(comoTexto(r), `resolvido por ${origem}`).toContain(etapa);
  });

  /**
   * ─ AS TRÊS GRAFIAS DO MESMO NOME ────────────────────────────────────────────────────────────
   *
   * As pastas são texto livre e mudam por vaga. `triados` veio assim na vaga medida; na vaga do
   * lado alguém digitou `Triados`, e com espaço sobrando no fim porque copiou de uma planilha.
   * As três são a MESMA pasta, e quem casa pelo nome cru só acerta uma delas, em silêncio.
   */
  it.each(["triados", "TRIADOS", " Triados ", "Triados"])(
    "a grafia %s resolve em TRIAGEM",
    async (grafia) => {
      const { resolver } = await carregarResolvedor();
      expect(comoTexto(await resolver("PANDAPE", grafia))).toContain("TRIAGEM");
    },
  );

  /**
   * O ACENTO E O ESPAÇO SOBRANDO, medidos no comportamento e não na função de normalização: a
   * pasta com acento e com espaço a mais resolve na MESMA etapa que a grafia limpa.
   */
  it.each(["Entrevista Soulan", "  ENTREVISTA   SOULAN  ", "entrevista soulán"])(
    "a grafia %s resolve em ENTREVISTA_SOULAN",
    async (grafia) => {
      const { resolver } = await carregarResolvedor();
      expect(comoTexto(await resolver("PANDAPE", grafia))).toContain("ENTREVISTA_SOULAN");
    },
  );

  /**
   * A PONTUAÇÃO DO NOME REAL, que é o caso mais feio dos dez medidos: `SHORT LIST, ENCAMINHADOS
   * CLIENTE` tem vírgula, e a vaga do lado pode não ter. As duas são a mesma pasta.
   */
  it.each(["SHORT LIST, ENCAMINHADOS CLIENTE", "Short List Encaminhados Cliente"])(
    "a grafia %s resolve em ENTREVISTA_CLIENTE",
    async (grafia) => {
      const { resolver } = await carregarResolvedor();
      expect(comoTexto(await resolver("PANDAPE", grafia))).toContain("ENTREVISTA_CLIENTE");
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. FAIL-CLOSED: O QUE NÃO ESTÁ MAPEADO NÃO VIRA CANECO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("as cinco decididas resolvem de ponta a ponta", () => {
  /**
   * ─ O MESMO REQUISITO, MEDIDO NO COMPORTAMENTO E NÃO NO TEXTO DO SQL ──────────────────────────
   *
   * Os casos da seção 1 leem a migration; estes passam pelo resolvedor de verdade, com o banco
   * fingido abastecido POR AQUELA MESMA SEMENTE. Semente certa com resolvedor que a lê errado é um
   * defeito que o parser jamais veria.
   */
  it.each(DECIDIDAS)("$externo resolve no destino decidido", async ({ externo, etapa, situacao }) => {
    const { resolver, origem } = await carregarResolvedor();
    const texto = comoTexto(await resolver("PANDAPE", externo));
    if (etapa) {
      expect(texto, `resolvido por ${origem}`).toContain(etapa);
    } else {
      // DESCARTE NÃO ANDA NO FUNIL: nenhuma das seis etapas pode aparecer na resposta.
      for (const codigo of CODIGOS_DO_FUNIL) {
        expect(
          texto.includes(codigo),
          `"${externo}" é desfecho e foi resolvida em ${codigo}: o histórico passaria a afirmar ` +
            "um movimento que ninguém fez",
        ).toBe(false);
      }
    }
    if (situacao) expect(texto).toContain(situacao);
  });

  /**
   * O MOTIVO CHEGA AO CHAMADOR, e é a metade que o SQL sozinho não prova: a coluna pode estar certa
   * na migration e o resolvedor não ler a coluna, e aí a ingestão gravaria descarte sem motivo, com
   * as duas origens indistinguíveis na tela.
   */
  it("os dois descartes chegam ao chamador com motivos diferentes e não vazios", async () => {
    const { resolver } = await carregarResolvedor();
    const motivos: string[] = [];
    for (const nome of OS_DOIS_DESCARTES) {
      const bruto = await resolver("PANDAPE", nome);
      const texto = comoTexto(bruto);
      // O MOTIVO É CONFERIDO ANTES DE SER USADO: um motivo apagado tem de virar uma FRASE, e não um
      // "Cannot read properties of null" três linhas abaixo. Vermelho ilegível custa uma sessão.
      const esperado = exigirSemeada(nome).motivo ?? "";
      expect(
        esperado.trim(),
        `"${nome}" está configurada sem motivo, e sem ele os dois descartes viram a mesma coisa`,
      ).not.toBe("");
      expect(
        texto,
        `o resolvedor devolveu "${nome}" sem o motivo que a semente configura`,
      ).toContain(esperado);
      motivos.push(esperado);
    }
    expect(motivos[0], "os dois descartes voltaram com o mesmo motivo").not.toBe(motivos[1]);
  });
});

describe("nome não mapeado devolve NÃO MAPEADA, e nunca um chute", () => {
  /**
   * ─ O FAIL-CLOSED SOBREVIVEU À DECISÃO (item 7) ───────────────────────────────────────────────
   *
   * Este caso era `it.each(SEM_MAPA)`, e media as cinco pastas que esperavam decisão. A decisão
   * saiu, e a regra que aquele caso protegia continua valendo para o que NÃO está no mapa: os nomes
   * das pastas são livres e mudam por vaga, então a pasta que alguém criar amanhã tem de voltar
   * NÃO MAPEADA, e não na etapa mais parecida.
   */
  it.each(INVENTADAS)("a pasta inédita %s não resolve em etapa nenhuma", async (nome) => {
    const { resolver } = await carregarResolvedor();
    const texto = comoTexto(await resolver("PANDAPE", nome));
    for (const codigo of CODIGOS_DO_FUNIL) {
      expect(
        texto.includes(codigo),
        `"${nome}" foi resolvida em ${codigo}. Pasta inédita é o normal numa lista de texto ` +
          "livre, e aproximar move pessoa de caneco sem ninguém pedir",
      ).toBe(false);
    }
    expect(
      /DESCARTADO|APROVADO|ALOCADO|DESISTIU|ENVIADO_PARA_ADMISSAO/.test(texto),
      `"${nome}" recebeu um desfecho que ninguém configurou`,
    ).toBe(false);
  });

  /**
   * NÃO MAPEADA É RESPOSTA, E NÃO EXCEÇÃO. Estourar transformaria uma pasta desconhecida (que é o
   * normal: são texto livre) em falha do processamento inteiro, e a ingestão pararia por causa de
   * uma pasta que ninguém precisava tratar.
   */
  it("a resposta para o desconhecido é um valor, não uma exceção", async () => {
    const { resolver } = await carregarResolvedor();
    let erro: unknown = null;
    try {
      await resolver("PANDAPE", "PASTA QUE NAO EXISTE EM LUGAR NENHUM");
    } catch (e) {
      erro = e;
    }
    // `undefined` e `null` são respostas LEGÍTIMAS de "não mapeada", então o que se afirma é a
    // ausência de exceção, e nunca a presença de um valor.
    expect(erro, "pasta desconhecida é o NORMAL numa lista de texto livre, e não pode parar a fila").toBeNull();
  });

  /**
   * A FONTE FAZ PARTE DA CHAVE. Sem ela, uma pasta chamada "Triados" em OUTRO sistema herdaria o
   * mapa do Pandapé, e o de/para deixaria de ser por fonte no dia em que a segunda fonte entrar,
   * que é justamente o motivo de a plataforma ser unificadora.
   */
  it("a mesma chave em outra fonte não herda o mapa do Pandapé", async () => {
    const { resolver } = await carregarResolvedor();
    const texto = comoTexto(await resolver("FONTE_INVENTADA_QUE_NAO_EXISTE", "triados"));
    expect(texto.includes("TRIAGEM")).toBe(false);
  });
});
