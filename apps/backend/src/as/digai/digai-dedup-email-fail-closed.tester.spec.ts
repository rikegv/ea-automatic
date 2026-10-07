import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../../db/client";
import { DigaiRepositorio } from "./digai-repositorio";
import { semComentario } from "./digai.tester-fake";

/**
 * ─ O FAIL-CLOSED DO DEGRAU NOVO, NO LADO DO BANCO, E A TRAVA DAS CHAVES PROIBIDAS ──────────────
 *
 * Teste do `tester`, escrito ANTES do codigo (secao A.40, regra 2). O irmao deste arquivo
 * (`digai-dedup-ordem-das-chaves.tester.spec.ts`) prova a ORDEM e a COLISAO pelo comportamento do
 * servico; este prova a GUARDA, que mora no repositorio, e o faz pelo molde que ja existe.
 *
 * O PRECEDENTE E `candidatoPorDocumento`, E ELE E FAIL-CLOSED EM DUAS FRENTES:
 *   1. valor INVALIDO nao vira chave: a consulta nem acontece (`documentoParaBanco` devolve nulo);
 *   2. ficha ANONIMIZADA nao e alvo: `and anonimizado_em is null` dentro do `where`.
 * O e-mail espelha as duas, e as duas sao asseridas aqui contra o CPF, lado a lado, para que o
 * espelho seja medido e nao prometido.
 *
 * §A.6: nada de pessoa real. Os e-mails usam o TLD reservado `.invalido` e os CPFs sao sinteticos.
 */

const CPF_VALIDO = "11122233396";
const EMAIL_VALIDO = "pessoa.sintetica@exemplo.invalido";

/** O banco como duble: ele ANOTA o SQL recebido e nunca consulta nada. */
/**
 * ─ O DUBLE PROJETA O QUE A CONSULTA PROJETA (ajuste do `backend`, 02/10/2026) ──────────────────
 *
 * UNICA mudanca feita neste arquivo, e ela e do DUBLE e nao de assercao nenhuma: `candidatoPorEmail`
 * passou a ler `total` (`count(*) over ()`) e `passa_guarda` (a comparacao de CPF que mora no SQL,
 * emenda E-7), e o duble devolvia so `{ id }`. Com `total` chegando `undefined`, o repositorio caia
 * no fail-closed da ambiguidade e DOIS testes daqui reprovavam o codigo de producao por um defeito
 * que era do duble.
 *
 * O duble DERIVA a projecao em vez de repetir literais, que e o que o fez defasar calado: `total` e
 * quantas linhas o caso tem, e `passa_guarda` nasce verdadeiro. A linha pode sobrescrever os dois.
 */
function bancoFingido(resposta: unknown[] = []) {
  const consultas: unknown[] = [];
  const projetadas = resposta.map((l) => ({
    total: resposta.length,
    passa_guarda: true,
    ...(l as Record<string, unknown>),
  }));
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

/** O texto de um `sql` do drizzle, chunk por chunk, para ler a forma do `where`. */
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

/** Os PARAMETROS de um `sql` do drizzle: o que de fato viaja como valor. */
function paramsDoSql(no: unknown, achados: string[] = []): string[] {
  if (no === null || typeof no !== "object") return achados;
  const o = no as Record<string, unknown>;
  if ("encoder" in o && typeof o.value === "string") achados.push(o.value);
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach((i) => paramsDoSql(i, achados));
    else if (v !== null && typeof v === "object") paramsDoSql(v, achados);
  }
  return achados;
}

function normalizado(no: unknown): string {
  return textoDoSql(no).replace(/\s+/g, " ").toLowerCase();
}

/** O metodo do degrau novo. Ausente = FALTA IMPLEMENTAR, e o teste diz com que nome. */
function porEmail(repo: DigaiRepositorio): (v: string) => Promise<{ id: string } | null> {
  const alvo = (repo as unknown as Record<string, unknown>).candidatoPorEmail;
  expect(
    typeof alvo,
    "FALTA IMPLEMENTAR: `DigaiRepositorio.candidatoPorEmail(valor)` nao existe. O degrau do e-mail " +
      "e um metodo proprio, no molde de `candidatoPorDocumento`, devolvendo `{ id } | null`.",
  ).toBe("function");
  return (alvo as (v: string) => Promise<{ id: string } | null>).bind(repo);
}

// ── 1. O PRECEDENTE DO CPF, MEDIDO: E ELE QUE DEFINE O MOLDE ──────────────────────────────────

describe("1. O molde do CPF, lido do codigo que ja esta em producao", () => {
  it("documento INVALIDO nao casa, e nao chega nem a consultar o banco", async () => {
    const { db, consultas } = bancoFingido([{ id: "aaaa" }]);
    const achado = await repositorio(db).candidatoPorDocumento("00000000000");
    expect(achado, "lixo repetido no ATS casaria pessoas DIFERENTES entre si.").toBeNull();
    expect(consultas.length, "a guarda fecha ANTES do banco: o valor invalido nunca vira chave.").toBe(0);
  });

  it("documento VALIDO consulta, e a ficha ANONIMIZADA nao e alvo", async () => {
    const { db, consultas } = bancoFingido([{ id: "aaaa" }]);
    await repositorio(db).candidatoPorDocumento(CPF_VALIDO);
    expect(consultas.length).toBe(1);
    expect(
      normalizado(consultas[0]),
      "a segunda fechadura: o expurgo nao pode ser desfeito pelo lado, recebendo dado novo na ficha antiga.",
    ).toContain("anonimizado_em is null");
  });
});

// ── 2. O E-MAIL ESPELHA AS DUAS FECHADURAS ────────────────────────────────────────────────────

describe("2. `candidatoPorEmail` e fail-closed no MESMO molde", () => {
  const LIXO: Array<[string, string]> = [
    ["vazio", ""],
    ["so espacos", "   "],
    ["so tabulacao", "\t"],
    ["sem arroba", "pessoa.sintetica.exemplo.invalido"],
    ["sem dominio", "pessoa.sintetica@"],
    ["sem parte local", "@exemplo.invalido"],
    ["duas arrobas", "pessoa@@exemplo.invalido"],
    ["com espaco no meio", "pessoa sintetica@exemplo.invalido"],
    ["so a arroba", "@"],
  ];

  for (const [rotulo, valor] of LIXO) {
    it(`e-mail ${rotulo} nao casa, e nao consulta o banco`, async () => {
      const { db, consultas } = bancoFingido([{ id: "bbbb" }]);
      const achado = await porEmail(repositorio(db))(valor);
      expect(
        achado,
        "E-MAIL QUE NAO PRESTA NAO DESEMPATA: casar por ele fundiria pessoas diferentes, e fusao nao se desfaz.",
      ).toBeNull();
      expect(
        consultas.length,
        "o molde do CPF recusa ANTES do banco, e nao depende de a consulta nao achar nada.",
      ).toBe(0);
    });
  }

  it("e-mail VALIDO consulta `as_candidatos`, e a ficha ANONIMIZADA nao e alvo", async () => {
    const { db, consultas } = bancoFingido([{ id: "bbbb" }]);
    const achado = await porEmail(repositorio(db))(EMAIL_VALIDO);
    expect(achado, "achou: o degrau do e-mail devolve a ficha que ja existe.").toEqual({ id: "bbbb" });
    const texto = normalizado(consultas[0]);
    expect(texto).toContain("from as_candidatos");
    expect(
      texto,
      "a ficha expurgada NAO e alvo do desempate, pelo mesmo motivo do CPF.",
    ).toContain("anonimizado_em is null");
    expect(texto, "o desempate le a coluna `email`, e nao outra qualquer.").toContain("email");
  });

  it("o espaco em volta e a caixa nao decidem: o mesmo e-mail casa igual", async () => {
    const a = bancoFingido([{ id: "bbbb" }]);
    const achado = await porEmail(repositorio(a.db))(`  ${EMAIL_VALIDO.toUpperCase()}  `);
    expect(
      achado,
      "`FULANO@X ` e `fulano@x` sao a MESMA caixa de correio: deixar a caixa ou o espaco decidirem cria " +
        "exatamente a duplicata que este degrau existe para evitar.",
    ).toEqual({ id: "bbbb" });
    const texto = normalizado(a.consultas[0]);
    const params = paramsDoSql(a.consultas[0]);
    const comparaSemCaixa = texto.includes("lower(") || texto.includes("ilike") || texto.includes("citext");
    const valorJaNormalizado = params.includes(EMAIL_VALIDO);
    expect(
      comparaSemCaixa || valorJaNormalizado,
      "ou a consulta compara sem caixa, ou o valor chega ja normalizado. Uma das duas, senao a caixa decide.",
    ).toBe(true);
    expect(
      params.filter((v) => v !== v.trim()),
      "nenhum parametro leva espaco em volta: espaco nao e parte do e-mail.",
    ).toEqual([]);
  });
});

// ── 3. A TRAVA DAS CHAVES PROIBIDAS, LIDA NO FONTE ────────────────────────────────────────────

const PASTA = __dirname;

/** O fonte SEM COMENTARIO: comentario casa com a varredura e da falso vermelho (licao da casa). */
function fonte(arquivo: string): string {
  return semComentario(readFileSync(join(PASTA, arquivo), "utf8"));
}

describe("3. So TRES chaves podem decidir quem e quem", () => {
  it("o repositorio nao expoe busca de pessoa por telefone, por nome, nem por nome + vaga", () => {
    const texto = fonte("digai-repositorio.ts");
    const metodos = [...texto.matchAll(/async\s+candidatoPor(\w+)\s*\(/g)].map((m) => m[1]);
    // CANARIO: a lista TEM de conter os dois degraus que ja existem, senao a assercao e vacua.
    expect(
      metodos,
      "CANARIO: sem os dois degraus de hoje no fonte, afirmar a ausencia dos proibidos nao prova nada.",
    ).toContain("Identidade");
    expect(metodos).toContain("Documento");
    expect(
      metodos.filter((m) => /telefone|phone|nome|name|vaga/i.test(m)),
      "telefone casa 15.786 pares e 13.480 deles sao pessoas DIFERENTES; nome casa 2.627 homonimos; " +
        "nome + vaga junta 245 homonimos na mesma vaga. Nenhum deles decide fusao.",
    ).toEqual([]);
    expect(
      metodos.every((m) => ["Identidade", "Documento", "Email"].includes(m)),
      `as chaves de busca de pessoa sao Identidade, Documento e Email, e mais nenhuma. Achadas: ${metodos.join(", ")}.`,
    ).toBe(true);
  });

  it("a importacao resolve a pessoa SO pelas tres chaves, e por mais nenhuma", () => {
    const texto = fonte("digai-importacao.service.ts");
    const usadas = [...texto.matchAll(/this\.repo\.candidatoPor(\w+)\s*\(/g)].map((m) => m[1]);
    expect(
      usadas,
      "CANARIO: a resolucao tem de consultar a identidade; sem isso o arquivo lido nao e o que decide.",
    ).toContain("Identidade");
    expect(
      [...new Set(usadas)].filter((u) => !["Identidade", "Documento", "Email"].includes(u)),
      "chave nova de fusao e decisao do diretor, e tem falso positivo MEDIDO contra a producao.",
    ).toEqual([]);
  });

  it("nenhuma consulta do repositorio procura pessoa por telefone", () => {
    const texto = fonte("digai-repositorio.ts").replace(/\s+/g, " ").toLowerCase();
    // CANARIO: a busca por CPF existe neste texto, logo a varredura esta lendo SQL de verdade.
    expect(texto, "CANARIO: o `where cpf =` do degrau 2 tem de estar aqui.").toContain("where cpf =");
    for (const proibido of ["where telefone", "and telefone =", "where nome", "and nome ="]) {
      expect(
        texto,
        `'${proibido}' transformaria uma chave de falso positivo medido em decisao de fusao irreversivel.`,
      ).not.toContain(proibido);
    }
  });
});
