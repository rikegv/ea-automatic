import { describe, expect, it, vi } from "vitest";
import type { Database } from "../../db/client";
import { ConfigService } from "@nestjs/config";
import { DigaiRepositorio } from "./digai-repositorio";
import { DigaiImportacaoService } from "./digai-importacao.service";

/**
 * ─ AS GUARDAS DO DEGRAU 3 QUE MORAM NO SQL, E O TRAVAMENTO DO `coalesce` ───────────────────────
 *
 * Cobertura do `backend` sobre o que ele construiu. O `tester` prova a ORDEM dos degraus e a
 * COLISAO pelo comportamento do servico, e prova o fail-closed da forma do endereco; este arquivo
 * cobre as duas guardas que nao aparecem por ali, porque vivem dentro da consulta:
 *
 *   a. CPF PRESENTE NOS DOIS LADOS E DIFERENTE NAO FUNDE (emenda E-4 do mapa);
 *   b. MAIS DE UMA FICHA CASANDO O MESMO ENDERECO E ABSTENCAO, nunca `limit 1` (emenda E-7);
 *   c. o `coalesce` de `cpf` e `email` PREENCHE VAZIO e NAO TROCA identidade (emenda E-6).
 *
 * SUFIXO `.backend.spec.ts`: o `.tester.spec.ts` e trava de DONO UNICO (§A.39), e dois agentes
 * escrevendo o mesmo arquivo se sobrescrevem em silencio.
 *
 * §A.6: nada de pessoa real. CPFs sinteticos com verificador valido e endereco no TLD `.invalido`.
 */

const CPF_VALIDO = "11122233396";
const OUTRO_CPF_VALIDO = "52998224725";
const EMAIL = "pessoa.sintetica@exemplo.invalido";

/**
 * ─ O FINGIDO PROJETA O QUE A CONSULTA PROJETA, E ESSA E A LICAO DA RODADA DE 02/10/2026 ────────
 *
 * `candidatoPorEmail` nao le so `id`: ela le `total` (`count(*) over ()`) e `passa_guarda` (a
 * comparacao de CPF que mora DENTRO do SQL, emenda E-7). O duble antigo devolvia `[{ id: "bbbb" }]`
 * e nada mais, entao `total` chegava `undefined`, o repositorio caia no ramo da AMBIGUIDADE por
 * falta de informacao (fail-closed, e isso esta certo) e CINCO testes acusavam o codigo de producao
 * de um defeito que era do duble.
 *
 * ENTAO O DUBLE DERIVA A PROJECAO EM VEZ DE DECLARA-LA: `total` e quantas linhas o caso tem, que e
 * o que `count(*) over ()` devolve, e `passa_guarda` nasce verdadeiro. Duble que DERIVA nao defasa
 * na proxima emenda; duble que repete literais defasa calado, e foi o que aconteceu.
 *
 * A LINHA PODE SOBRESCREVER OS DOIS (o espalhamento vem depois), e e assim que se exercita a
 * guarda negada e a forma inesperada do `total` sem mexer no codigo de producao.
 */
function linhasDaProjecao(linhas: readonly unknown[]): unknown[] {
  return linhas.map((l) => ({
    total: linhas.length,
    passa_guarda: true,
    ...(l as Record<string, unknown>),
  }));
}

function bancoFingido(resposta: unknown[] = []) {
  const consultas: unknown[] = [];
  const projetadas = linhasDaProjecao(resposta);
  const db = {
    execute: vi.fn(async (q: unknown) => {
      consultas.push(q);
      return projetadas;
    }),
  };
  return { db, consultas };
}

function repositorio(db: { execute: unknown }) {
  return new DigaiRepositorio(
    db as unknown as Database,
    null as unknown as never,
    null as unknown as never,
  );
}

/** O texto de um `sql` do drizzle, chunk por chunk. */
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

function normalizado(no: unknown): string {
  return textoDoSql(no).replace(/\s+/g, " ").toLowerCase();
}

/** O trecho entre `select` e `from as_candidatos`: so o que a consulta DEVOLVE. */
function projecaoDaConsulta(sqlNormalizado: string): string {
  const m = /select\s+(.*?)\s+from as_candidatos/.exec(sqlNormalizado);
  return m === null ? "" : m[1]!;
}

/**
 * Os NOMES das colunas que a consulta devolve, na ordem. Coluna crua sai com o proprio nome, e
 * expressao sai com o alias: e exatamente o conjunto de chaves que a linha chega tendo no processo.
 */
function colunasDeRetorno(projecao: string): string[] {
  const itens: string[] = [];
  let profundidade = 0;
  let atual = "";
  for (const ch of projecao) {
    if (ch === "(") profundidade += 1;
    if (ch === ")") profundidade -= 1;
    if (ch === "," && profundidade === 0) {
      itens.push(atual);
      atual = "";
      continue;
    }
    atual += ch;
  }
  itens.push(atual);
  return itens
    .map((i) => i.trim())
    .filter((i) => i !== "")
    .map((i) => {
      const comAlias = /\bas\s+([a-z_][a-z0-9_]*)$/.exec(i);
      if (comAlias !== null) return comAlias[1]!;
      const partes = i.split(".");
      return partes[partes.length - 1]!.trim();
    });
}

describe("a. O CPF divergente nos dois lados nao funde, e a comparacao esta no SQL", () => {
  it("a consulta exige que o CPF da ficha seja nulo ou igual ao do registro", async () => {
    const { db, consultas } = bancoFingido([{ id: "bbbb" }]);
    await repositorio(db).candidatoPorEmail(EMAIL, CPF_VALIDO);
    const texto = normalizado(consultas[0]);
    expect(
      texto,
      "653 registros chegam a este degrau com um CPF que nao casou nada. CPF diferente dos dois " +
        "lados e a prova de que sao pessoas DIFERENTES, e o mesmo argumento que condenou nome + vaga.",
    ).toContain("cpf is null or cpf =");
  });

  /*
   * ─ ESTA ASSERCAO FOI REESCRITA EM 02/10/2026, E A FORMA E EXIGENCIA DA AUDITORIA ─────────────
   *
   * ELA EXIGIA `startsWith("select id from as_candidatos")`, e com a emenda E-7 passou a REPROVAR
   * O PROPRIO DESENHO QUE A AUDITORIA PEDIU (a projecao ganhou o `count(*) over ()` e o booleano).
   * Assercao que mede a FORMA LITERAL do `select` quebra em toda emenda e ensina a afrouxar.
   *
   * O QUE ELA PROTEGE CONTINUA INTEIRO: o `cpf` da outra pessoa e comparado DENTRO do SQL e o que
   * atravessa para a memoria do processo e um BOOLEANO. As quatro formas obvias de medir isso NAO
   * servem, e cada uma falha de um jeito diferente:
   *   `toContain("select id")`       passa com `select id, cpf`;
   *   `not.toContain("cpf")`         impossivel: a guarda LEGITIMA contem `cpf is null or cpf =`;
   *   `not.toContain("cpf,")`        passa com `select id, cpf from`;
   *   so o conjunto de colunas       passa se alguem esconder o `cpf` num alias chamado `total`.
   *
   * ENTAO SAO DUAS PERGUNTAS, e as duas juntas e que fecham: (3) fora do trecho da guarda e da
   * contagem, a projecao NAO MENCIONA `cpf`; (4) o conjunto de colunas de retorno e EXATAMENTE
   * {id, total, passa_guarda}, nem uma a mais. A (3) sozinha passaria com `email` projetado; a (4)
   * sozinha passaria com `cpf` disfarcado de `total`.
   */
  it("o CPF do registro viaja como PARAMETRO, e o documento da outra pessoa nao e lido de volta", async () => {
    const { db, consultas } = bancoFingido([{ id: "bbbb" }]);
    await repositorio(db).candidatoPorEmail(EMAIL, OUTRO_CPF_VALIDO);
    const texto = normalizado(consultas[0]);
    const projecao = projecaoDaConsulta(texto);
    expect(projecao, "sem projecao nao ha o que medir: a consulta mudou de forma.").not.toBe("");

    expect(
      projecao,
      "`select *` devolveria o `cpf` da outra pessoa junto de tudo o mais, e nenhuma das medidas " +
        "abaixo o pegaria.",
    ).not.toContain("*,");
    expect(projecao.trim()).not.toBe("*");

    // 3. tirando a guarda (do primeiro parentese ate o alias dela) e a contagem, nao sobra `cpf`.
    const semGuarda = projecao
      .replace(/\(.*\)\s*as passa_guarda/, " ")
      .replace(/count\(\*\)\s*over\s*\(\s*\)/, " ");
    expect(
      semGuarda,
      "fora da comparacao que MORA no SQL, nada mais pode tocar `cpf`: trazer a coluna para " +
        "comparar em TypeScript leria para dentro do processo o documento de quem o registro nem " +
        "alcanca (§A.6, minimizacao).",
    ).not.toContain("cpf");

    // 4. e o que chega ao processo e exatamente o id, um numero e um sim/nao.
    expect(
      colunasDeRetorno(projecao).sort(),
      "coluna a mais aqui e dado pessoal a mais na memoria do processo, inclusive a que alguem " +
        "acrescentar 'so para o log'. O que sai e um id, um total e um booleano.",
    ).toEqual(["id", "passa_guarda", "total"]);
  });

  it("A ASSERCAO ACIMA REPROVA `select id, cpf`, e e isso que a mantem util", () => {
    /*
     * A MEDIDA TAMBEM SE MEDE. A assercao anterior morreu por medir forma literal, e a nova mede
     * duas propriedades: este teste prova que as duas de fato REPROVAM o desenho proibido, em vez
     * de so passarem no desenho atual. Sem ele, afrouxar a medida acima nao quebraria nada.
     */
    const proibido = "select id, cpf from as_candidatos where lower(btrim(email)) = $1 limit 2";
    const projecao = projecaoDaConsulta(proibido);
    expect(projecao).toBe("id, cpf");
    expect(projecao.replace(/\(.*\)\s*as passa_guarda/, " ")).toContain("cpf");
    expect(colunasDeRetorno(projecao)).toEqual(["id", "cpf"]);

    // E o disfarce tambem: `cpf as total` passaria pela pergunta 3 e morre na 4... e vice-versa.
    const disfarcado = projecaoDaConsulta(
      "select id, cpf as total, (cpf is null) as passa_guarda from as_candidatos where x limit 2",
    );
    expect(
      disfarcado.replace(/\(.*\)\s*as passa_guarda/, " ").replace(/count\(\*\)\s*over\s*\(\s*\)/, " "),
      "o alias enganaria a pergunta das colunas, e e a pergunta do texto que o pega.",
    ).toContain("cpf");
    expect(colunasDeRetorno(disfarcado).sort()).toEqual(["id", "passa_guarda", "total"]);
  });

  it("CPF invalido no registro nao vira filtro, e tambem nao impede o desempate", async () => {
    /*
     * O portao de admissao de hoje so deixa passar quem TEM CPF valido, mas a guarda nao depende
     * dele: lixo (`00000000000`) e tratado como ausencia, e nao como documento divergente, senao
     * um valor-padrao do ATS barraria o desempate de quem o tivesse.
     */
    const { db, consultas } = bancoFingido([{ id: "bbbb" }]);
    const achado = await repositorio(db).candidatoPorEmail(EMAIL, "00000000000");
    expect(achado).toEqual({ id: "bbbb" });
    expect(consultas.length).toBe(1);
  });
});

describe("b. Mais de uma ficha casando o mesmo endereco: ABSTENCAO, nunca escolha", () => {
  it("duas linhas devolvem a marca de ambiguidade, e nenhum id", async () => {
    const { db } = bancoFingido([{ id: "bbbb" }, { id: "cccc" }]);
    const achado = await repositorio(db).candidatoPorEmail(EMAIL, null);
    expect(
      achado,
      "nao ha indice unico em `as_candidatos.email`: escolher uma das duas seria fundir no escuro.",
    ).toEqual({ ambiguo: true });
  });

  it("a consulta pede DUAS linhas para poder detectar a segunda, e nao ordena nada", async () => {
    const { db, consultas } = bancoFingido([{ id: "bbbb" }]);
    await repositorio(db).candidatoPorEmail(EMAIL, null);
    const texto = normalizado(consultas[0]);
    expect(texto, "`limit 1` esconderia a segunda ficha e escolheria uma arbitrariamente.").toContain(
      "limit 2",
    );
    expect(
      texto,
      "ordem deterministica ESCOLHE, e aqui escolher e o risco: a abstencao e mais segura que ordenar.",
    ).not.toContain("order by");
  });

  it("uma linha so continua devolvendo a ficha", async () => {
    const { db } = bancoFingido([{ id: "bbbb" }]);
    expect(await repositorio(db).candidatoPorEmail(EMAIL, null)).toEqual({ id: "bbbb" });
  });

  it("nenhuma linha devolve nulo, que e o degrau de baixo e nao a abstencao", async () => {
    const { db } = bancoFingido([]);
    expect(await repositorio(db).candidatoPorEmail(EMAIL, null)).toBeNull();
  });
});

// ── b2. O FAIL-CLOSED DA PROJECAO, QUE PERDEU O CARONA E PRECISOU DE TESTE PROPRIO ────────────

/**
 * ─ POR QUE ESTE BLOCO NASCEU, E ELE E ACHADO DA AUDITORIA DE 02/10/2026 ────────────────────────
 *
 * O teste "duas linhas devolvem a marca de ambiguidade" PASSAVA PELO MOTIVO ERRADO: o duble antigo
 * nao devolvia `total`, entao quem disparava a abstencao era o fail-closed de
 * `inteiroDoBanco(undefined) = 2`, e NAO a contagem. Consertado o duble, aquele teste passou a
 * medir o que o nome dele diz, e a UNICA cobertura do fail-closed por FORMA INESPERADA
 * desapareceria em silencio. Ela mora aqui agora, exercitada de proposito.
 *
 * O FAIL-CLOSED E A METADE QUE IMPORTA: a abstencao nasce de NAO SABER, e a resposta certa a nao
 * saber e a mesma de saber que ha duas, porque fundir pessoa errada e irreversivel. Se um dia a
 * forma do `count(*) over ()` mudar (driver, cast, agregacao), o degrau PARA de desempatar em vez
 * de escolher no escuro.
 */
describe("b2. `total` em forma inesperada ABSTEM, e nunca desempata", () => {
  const FORMAS: Array<[string, unknown]> = [
    ["ausente", undefined],
    ["objeto", {}],
    ["texto que nao e numero", "x"],
    ["nulo", null],
  ];

  for (const [rotulo, valor] of FORMAS) {
    it(`total ${rotulo} devolve a marca de ambiguidade, e nenhum id`, async () => {
      const { db } = bancoFingido([{ id: "bbbb", total: valor }]);
      expect(
        await repositorio(db).candidatoPorEmail(EMAIL, null),
        "NAO SABER QUANTAS FICHAS CASARAM e, para este degrau, o mesmo que saber que ha duas: " +
          "desempatar no escuro funde pessoa errada, e fusao nao se desfaz.",
      ).toEqual({ ambiguo: true });
    });
  }

  it("`total` como TEXTO numerico ainda desempata: o driver pode devolver bigint como string", async () => {
    const { db } = bancoFingido([{ id: "bbbb", total: "1" }]);
    expect(
      await repositorio(db).candidatoPorEmail(EMAIL, null),
      "`count(*)` e bigint, e bigint chega como string em driver de Postgres. Recusar isso faria o " +
        "degrau abster SEMPRE, e o fail-closed viraria fail-mudo: o degrau pararia de existir.",
    ).toEqual({ id: "bbbb" });
  });
});

// ── b3. A GUARDA DO CPF DIVERGENTE, MEDIDA POR COMPORTAMENTO E NAO SO NO TEXTO DO SQL ─────────

/**
 * O bloco `a` prova que a guarda esta NA CONSULTA, lendo o texto dela. Isto prova o que o
 * repositorio FAZ com a resposta, que e outra pergunta: com UMA linha so e a guarda NEGADA, o
 * metodo devolve `null` (o degrau nao desempatou) e nunca a ficha.
 *
 * E O CASO DOS 653: tantos registros chegam a este degrau com um CPF na mao que nao casou nada.
 * Quando o endereco deles cai numa ficha de CPF DIFERENTE, a prova e de que sao pessoas diferentes,
 * e a resposta e nao desempatar. Antes desta rodada ninguem media isso por comportamento.
 */
describe("b3. Uma linha so, com a guarda NEGADA: nao desempata", () => {
  it("`passa_guarda` falso devolve nulo, e nao a ficha", async () => {
    const { db } = bancoFingido([{ id: "bbbb", total: 1, passa_guarda: false }]);
    expect(
      await repositorio(db).candidatoPorEmail(EMAIL, OUTRO_CPF_VALIDO),
      "CPF presente nos DOIS lados e DIFERENTE e a prova de que sao pessoas diferentes: e o mesmo " +
        "argumento que condenou nome + vaga (247 homonimos).",
    ).toBeNull();
  });

  it("forma inesperada do booleano tambem NAO desempata", async () => {
    for (const valor of [undefined, null, 0, "", "f", "sim", {}]) {
      const { db } = bancoFingido([{ id: "bbbb", total: 1, passa_guarda: valor }]);
      expect(
        await repositorio(db).candidatoPorEmail(EMAIL, OUTRO_CPF_VALIDO),
        "so o banco dizendo SIM desempata. Qualquer outra forma e desconhecimento, e " +
          "desconhecimento nao funde ficha.",
      ).toBeNull();
    }
  });

  it("`passa_guarda` nas formas que o Postgres emite para verdadeiro desempata", async () => {
    for (const valor of [true, "t", "true"]) {
      const { db } = bancoFingido([{ id: "bbbb", total: 1, passa_guarda: valor }]);
      expect(await repositorio(db).candidatoPorEmail(EMAIL, null)).toEqual({ id: "bbbb" });
    }
  });
});

describe("c. O `coalesce` de `cpf` e `email` PREENCHE VAZIO, e nao TROCA identidade", () => {
  it("o valor ja gravado vem primeiro nas duas colunas de identidade", async () => {
    const { db, consultas } = bancoFingido([{ id: "aaaa" }]);
    await repositorio(db).atualizarCandidato("11111111-1111-4111-8111-111111111111", {
      nome: "Fulano De Teste",
      cpf: CPF_VALIDO,
      email: EMAIL,
      telefone: "11900000001",
    });
    const texto = normalizado(consultas[0]);
    expect(
      texto,
      "`coalesce(${novo}, cpf)` devolve o NOVO: aquilo SUBSTITUIA o documento. Com o degrau do " +
        "e-mail, uma passada gravaria o contato de B na ficha de A e envenenaria a chave na seguinte.",
    ).toContain("cpf = coalesce(cpf,");
    expect(texto).toContain("email = coalesce(email,");
    expect(
      texto,
      "a mesma expressao vai na comparacao, senao a escrita condicional acha diferenca onde nao ha " +
        "e empurra `atualizado_em`, que e o relogio do expurgo.",
    ).toContain("coalesce(cpf,");
  });

  it("nome e telefone seguem com a regra antiga, e nenhum dos dois e chave de fusao", async () => {
    const { db, consultas } = bancoFingido([{ id: "aaaa" }]);
    await repositorio(db).atualizarCandidato("11111111-1111-4111-8111-111111111111", {
      nome: "Fulano De Teste",
      cpf: null,
      email: null,
      telefone: "11900000001",
    });
    const texto = normalizado(consultas[0]);
    expect(texto).toContain("telefone = coalesce(");
    expect(texto, "o nome e o campo que a ingestao existe para manter em dia.").toContain(
      "nome = coalesce(nullif(",
    );
  });
});

// ── d. CPF CASOU E O E-MAIL ESTA AMBIGUO: O CPF DECIDE, E A AMBIGUIDADE VIRA TRILHA ───────────

/**
 * ─ O UNICO CASO DESTE ARQUIVO QUE SE PROVA PELO SERVICO, E A RAZAO E A DECISAO EM SI ───────────
 *
 * Decisao do coordenador, 02/10/2026, invertendo a primeira escolha do `backend` (que abstinha
 * tambem aqui). A regra: AMBIGUIDADE DO E-MAIL E RUIDO, COLISAO DE CHAVES E EVIDENCIA.
 *
 *  - a COLISAO (CPF em uma ficha, e-mail em outra, as duas identificadas) diz "nao sei quem e", e
 *    por isso abstem. Essa parte e provada pelo `tester`, em
 *    `digai-dedup-ordem-das-chaves.tester.spec.ts`, e NAO se duplica aqui;
 *  - a AMBIGUIDADE (o e-mail casou DUAS fichas) nao torna o casamento do CPF errado. O CPF e UNICO
 *    no banco (`uq_as_candidatos_cpf`), logo casar por ele e EXATO, e abster aqui impediria o
 *    registro de entrar em QUALQUER ciclo, para sempre e em silencio, por duas linhas que nem sao
 *    dele. Bloqueio permanente por ruido e pior que o problema que ele evita.
 *
 * O duble devolve `{ ambiguo: true }` no degrau do e-mail, que e o terceiro estado do contrato, e
 * NAO existe forma de produzir este caso pelo repositorio com banco fingido: quem cruza as duas
 * chaves e o servico.
 */
const PESSOA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REGISTRO_SINTETICO = {
  userId: "usr-sintetico-ambiguidade-1",
  partnerJobId: "1234567",
  name: "Fulano De Teste",
  cpf: CPF_VALIDO,
  email: EMAIL,
  phoneNumber: "11900000001",
  appliedAt: "2026-09-10T12:00:00.000Z",
};

function repositorioFingido(opcoes: { porDocumento: string | null; emailAmbiguo: boolean }) {
  const escritas: { metodo: string; args: unknown[] }[] = [];
  const anotar =
    (metodo: string) =>
    (...args: unknown[]) => {
      escritas.push({ metodo, args });
    };
  return {
    escritas,
    deParaEtapa: vi.fn(async () => ({ etapaCodigo: "CAPTACAO", situacao: null, ativo: true })),
    candidatoPorIdentidade: vi.fn(async () => null),
    candidatoPorDocumento: vi.fn(async () =>
      opcoes.porDocumento === null ? null : { id: opcoes.porDocumento },
    ),
    candidatoPorEmail: vi.fn(async () => (opcoes.emailAmbiguo ? { ambiguo: true as const } : null)),
    criarCandidato: vi.fn(async (...args: unknown[]) => {
      anotar("criarCandidato")(...args);
      return { id: "11111111-1111-4111-8111-111111111111" };
    }),
    atualizarCandidato: vi.fn(async (...args: unknown[]) => {
      anotar("atualizarCandidato")(...args);
      return { linhasAfetadas: 1 };
    }),
    anexarIdentidade: vi.fn(async (...args: unknown[]) => {
      anotar("anexarIdentidade")(...args);
    }),
    registrarConflito: vi.fn(async (...args: unknown[]) => {
      anotar("registrarConflito")(...args);
    }),
    espelharVaga: vi.fn(async () => ({ id: "22222222-2222-4222-8222-222222222222" })),
    garantirCandidatura: vi.fn(async (...args: unknown[]) => {
      anotar("garantirCandidatura")(...args);
      return { criada: true, id: "33333333-3333-4333-8333-333333333333" };
    }),
  };
}

const AMBIENTE_LIGADO: Record<string, string> = {
  DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
  DIGAI_INGESTAO_ATIVA: "true",
};

function servico(repo: ReturnType<typeof repositorioFingido>) {
  const config = {
    get: <T,>(c: string) => AMBIENTE_LIGADO[c] as unknown as T,
  } as ConfigService;
  return new DigaiImportacaoService(config, repo as unknown as DigaiRepositorio);
}

/** A quem a candidatura foi pendurada: e este o id que o dedup RESOLVEU. */
function pessoaResolvida(repo: ReturnType<typeof repositorioFingido>): string | null {
  const linha = repo.escritas.find((e) => e.metodo === "garantirCandidatura");
  if (linha === undefined) return null;
  return (linha.args[0] as { candidatoId: string }).candidatoId;
}

describe("d. O e-mail ambiguo NAO derruba o acerto do CPF", () => {
  it("o CPF casou: a ficha dele RESOLVE, e a candidatura e pendurada nela", async () => {
    const repo = repositorioFingido({ porDocumento: PESSOA_A, emailAmbiguo: true });
    await servico(repo).importar([REGISTRO_SINTETICO]);
    expect(
      pessoaResolvida(repo),
      "ESTE TESTE MORRE SE ALGUEM TROCAR POR ABSTENCAO: abster devolveria nulo, nenhuma candidatura " +
        "seria pendurada, e o registro ficaria de fora de TODO ciclo futuro, em silencio, por ruido " +
        "de uma chave fraca. O CPF e unico no banco, logo casar por ele e exato.",
    ).toBe(PESSOA_A);
    expect(
      repo.escritas.filter((e) => e.metodo === "criarCandidato").length,
      "casou por CPF: ficha nova aqui seria a duplicata que o dedup existe para evitar.",
    ).toBe(0);
    expect(
      repo.anexarIdentidade.mock.calls[0]?.[0],
      "a identidade nova e pendurada na ficha do CPF, senao a proxima volta repete tudo.",
    ).toBe(PESSOA_A);
  });

  /**
   * ─ O VETO V-3: A GUARDA DE NAO PROPAGAR O ENDERECO VIVIA SO EM COMENTARIO ──────────────────────
   *
   * Mesmo defeito do V-2, no mesmo arquivo e na mesma rodada: o codigo estava CERTO
   * (`paraEscrita = { ...dados, email: null }`) e a razao estava escrita em quadro proprio, mas
   * NENHUM teste a media. Trocar `paraEscrita` de volta por `dados` deixava a suite inteira verde.
   *
   * O QUE A PROPAGACAO FARIA, e e por isso que ela e proibida SO NESTE CAMINHO: sabe-se que aquele
   * endereco JA esta em DUAS fichas. A ficha do CPF (que resolveu) pode ter `email` nulo, e
   * `atualizarCandidato` grava `email = coalesce(email, novo)`, entao o mesmo endereco seria
   * gravado numa TERCEIRA ficha. O proximo ciclo encontraria tres, e a ambiguidade que acabou de
   * ser detectada ficaria PIOR por causa da propria deteccao.
   *
   * A SEGUNDA ASSERCAO E POR VALOR, e nao por nome de metodo, pelo mesmo motivo da trava do CPF no
   * degrau 3: assercao amarrada a `atualizarCandidato` passaria a mentir no dia em que um metodo
   * novo escrevesse contato por outra porta.
   */
  it("o ENDERECO nao e propagado por este caminho, e a trava e por VALOR", async () => {
    const repo = repositorioFingido({ porDocumento: PESSOA_A, emailAmbiguo: true });
    await servico(repo).importar([REGISTRO_SINTETICO]);

    const atualizacoes = repo.escritas.filter((e) => e.metodo === "atualizarCandidato");
    expect(
      atualizacoes.length,
      "o CPF resolveu, logo a ficha dele E atualizada: e a chamada que tambem carrega a guarda de " +
        "anonimizacao, e suprimi-la aqui reabriria a ressalva D2.",
    ).toBe(1);
    expect(atualizacoes[0]?.args[0], "a escrita vai na ficha que o CPF resolveu.").toBe(PESSOA_A);
    expect(
      (atualizacoes[0]?.args[1] as { email: string | null }).email,
      "GRAVAR O ENDERECO NUMA TERCEIRA FICHA PIORARIA A AMBIGUIDADE QUE ACABOU DE SER DETECTADA: " +
        "`coalesce(email, novo)` preenche o nulo, e o proximo ciclo encontraria TRES fichas com o " +
        "mesmo endereco em vez de duas.",
    ).toBeNull();
    expect(
      (atualizacoes[0]?.args[1] as { cpf: string | null }).cpf,
      "o resto dos dados SEGUE: quem casou aqui foi o CPF, que e unico e exato, e amputar a " +
        "atualizacao inteira trocaria um estrago por outro.",
    ).toBe(CPF_VALIDO);

    expect(
      repo.escritas.filter((e) => JSON.stringify(e.args).includes(EMAIL)).map((e) => e.metodo),
      "A TRAVA E SOBRE O VALOR: o endereco ambiguo nao pode viajar em escrita nenhuma deste " +
        "caminho, por nome de metodo nenhum, senao um metodo novo reabre a porta.",
    ).toEqual([]);
  });

  it("E O CONTROLE DA TRAVA ACIMA: sem ambiguidade, o endereco E propagado normalmente", async () => {
    /*
     * Sem este par, a assercao de cima passaria por motivo errado no dia em que a escrita parasse
     * de receber o endereco EM TODO CAMINHO (ou em que o duble deixasse de anotar os argumentos), e
     * ninguem notaria: a supressao e DESTE ramo, e nao uma regra geral do servico.
     */
    const repo = repositorioFingido({ porDocumento: PESSOA_A, emailAmbiguo: false });
    await servico(repo).importar([REGISTRO_SINTETICO]);
    const atualizacoes = repo.escritas.filter((e) => e.metodo === "atualizarCandidato");
    expect(
      (atualizacoes[0]?.args[1] as { email: string | null }).email,
      "no caminho normal o contato e dado util e entra: o `coalesce` PREENCHE vazio, e suprimi-lo " +
        "sempre faria a ingestao deixar de manter o contato em dia.",
    ).toBe(EMAIL);
  });

  it("a ambiguidade NAO e engolida: vira conflito ancorado na ficha do CPF, com o `userId`", async () => {
    const repo = repositorioFingido({ porDocumento: PESSOA_A, emailAmbiguo: true });
    await servico(repo).importar([REGISTRO_SINTETICO]);
    expect(
      repo.registrarConflito.mock.calls.length,
      "duas fichas dividindo um endereco e caso para humano olhar, mesmo quando o CPF resolveu.",
    ).toBe(1);
    expect(
      repo.registrarConflito.mock.calls[0]?.[0],
      "a ancora e a ponta da chave MAIS FORTE, pelo mesmo criterio do ramo de identidade.",
    ).toBe(PESSOA_A);
    expect(
      repo.registrarConflito.mock.calls[0]?.[1],
      "§A.6: o identificador e o `userId`, e NUNCA o endereco de correio.",
    ).toBe(REGISTRO_SINTETICO.userId);
  });

  it("SEM ancora (o CPF nao casou ninguem) a ambiguidade abstem, e nada e escrito", async () => {
    /*
     * Aqui nao ha chave forte que tenha acertado alguem, e `as_ingestao_conflitos.candidato_id` e
     * NOT NULL: carimbar a linha com uma das fichas ambiguas seria a mesma escolha arbitraria que
     * a guarda recusa. Vira AVISO com o `userId` e mais nada (decisao mantida pelo coordenador).
     */
    const repo = repositorioFingido({ porDocumento: null, emailAmbiguo: true });
    await servico(repo).importar([REGISTRO_SINTETICO]);
    expect(pessoaResolvida(repo), "ninguem foi escolhido entre as fichas ambiguas.").toBeNull();
    expect(
      repo.escritas.filter((e) => e.metodo === "criarCandidato").length,
      "criar ficha aqui seria a terceira linha do mesmo endereco, piorando a ambiguidade.",
    ).toBe(0);
    expect(
      repo.registrarConflito.mock.calls.length,
      "sem ancora NOT NULL nao ha linha de revisao a gravar: fica o aviso, sem PII.",
    ).toBe(0);
  });

  it("e-mail que nao casa nada segue resolvendo pelo CPF, sem conflito nenhum", async () => {
    const repo = repositorioFingido({ porDocumento: PESSOA_A, emailAmbiguo: false });
    await servico(repo).importar([REGISTRO_SINTETICO]);
    expect(pessoaResolvida(repo)).toBe(PESSOA_A);
    expect(
      repo.registrarConflito.mock.calls.length,
      "o caminho normal nao enche a fila de revisao.",
    ).toBe(0);
  });
});
