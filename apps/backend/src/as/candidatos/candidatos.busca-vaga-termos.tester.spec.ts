import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ ITEM 3.3 + ITEM 4: A BUSCA DO "VER CANDIDATOS" DA VAGA ──────────────────────────────────────
 *
 * COBERTURA INDEPENDENTE do `tester` (§A.38/§A.40), escrita a partir do REQUISITO, ANTES do codigo.
 * Hoje a busca da vaga (`condicoesDaVaga`, usada por `idsDaVaga`/`candidaturasDaVagaPagina`) casa SO
 * por nome. Estes testes travam a construcao dos dois itens:
 *
 *  ITEM 3.3: o termo passa a casar por NOME **ou** TELEFONE **ou** E-MAIL.
 *  ITEM 4:   `busca` e dividida por ";" num OR de TERMOS; cada termo casa por nome/telefone/e-mail.
 *            - termo sem ";" nao e fragmentado (guarda para os ~5 leitores da rota, shared-types:3250);
 *            - ancora de vaga preservada: nenhum termo escapa da vaga (sem vazamento de escopo);
 *            - termos vazios descartados; CAP de 25 termos;
 *            - sem injecao: o termo viaja por PARAMETRO LIGADO, nunca concatenado no texto do SQL.
 *
 * COMO O TESTE OLHA: um `db` que grava o objeto passado ao `.where(...)`. Ele e renderizado pelo
 * `PgDialect` para `{ sql, params }` como o Postgres o receberia: `params` sao os valores LIGADOS,
 * e `sql` traz `$1,$2,...` no lugar deles. E essa separacao que prova "sem injecao": o termo com
 * aspa/`%` tem de estar em `params`, nunca no texto de `sql`.
 *
 * `idsDaVaga(vagaId, { busca })` e a porta mais simples sobre `condicoesDaVaga` (so `select id ...
 * where`), e o nome ja e contrato (ver `candidatos.ids-da-vaga-sem-pii.tester.spec.ts`). §A.6: o
 * retorno continua sendo so UUID; aqui so inspecionamos a clausula montada.
 */

const dialeto = new PgDialect();
const VAGA_ID = randomUUID();

/** Renderiza a clausula como o Postgres a receberia: texto com `$n` e os parametros ligados a parte. */
function renderizar(cond: unknown): { texto: string; params: unknown[] } {
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return { texto, params };
}

/** Um db que GRAVA o `where` da consulta de ids da vaga e devolve lista vazia. */
function bancoQueGravaWhere() {
  let capturado: unknown;
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    const mesmo = () => c;
    c.from = mesmo;
    c.innerJoin = mesmo;
    c.leftJoin = mesmo;
    c.where = (w: unknown) => {
      capturado = w;
      return c;
    };
    c.orderBy = mesmo;
    c.groupBy = mesmo;
    c.having = mesmo;
    c.limit = mesmo;
    c.offset = mesmo;
    c.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(ok, falha);
    return c;
  };
  const db = {
    select: vi.fn(() => chain()),
    selectDistinct: vi.fn(() => chain()),
    query: {
      vagas: { findFirst: vi.fn(async () => ({ id: VAGA_ID, status: "ABERTA" })) },
    },
  };
  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );
  return {
    service,
    async where(busca: string): Promise<{ texto: string; params: unknown[] }> {
      await (service as unknown as {
        idsDaVaga: (v: string, f?: unknown) => Promise<unknown>;
      }).idsDaVaga(VAGA_ID, { busca });
      expect(capturado, "a consulta de ids da vaga nao chamou `.where(...)`").toBeDefined();
      return renderizar(capturado);
    },
  };
}

describe("ITEM 3.3: o termo da vaga casa por NOME ou TELEFONE ou E-MAIL", () => {
  it("um termo de TEXTO casa nome E e-mail (telefone so com digito), unidos por OR", async () => {
    const { where } = bancoQueGravaWhere();
    const { texto } = await where("maria");
    const t = texto.toLowerCase();
    expect(t.includes("nome"), "a busca por nome e a que ja existia").toBe(true);
    expect(t.includes("email"), "ITEM 3.3: o termo de texto tem de alcancar o e-mail").toBe(true);
    expect(/\bor\b/.test(t), "nome e e-mail do termo se somam por OR").toBe(true);
  });

  it("um termo com DIGITO casa tambem o TELEFONE (as tres colunas)", async () => {
    const { where } = bancoQueGravaWhere();
    const { texto, params } = await where("11987");
    const t = texto.toLowerCase();
    expect(t.includes("nome"), "nome sempre entra").toBe(true);
    expect(t.includes("email"), "e-mail sempre entra").toBe(true);
    expect(t.includes("telefone"), "ITEM 3.3: termo com digito tem de alcancar o telefone").toBe(true);
    // O mesmo termo vira padrao ligado em nome, e-mail e telefone (tres ou mais ocorrencias).
    const comTermo = params.filter((p) => String(p).includes("11987"));
    expect(
      comTermo.length,
      "o termo com digito deveria aparecer em nome, e-mail e telefone (>=3 padroes ligados).",
    ).toBeGreaterThanOrEqual(3);
  });

  it("um termo SEM digito NAO cria clausula de telefone `%%` (que traria a vaga inteira)", async () => {
    const { where } = bancoQueGravaWhere();
    const { texto, params } = await where("maria");
    // A guarda do `%%`: termo sem digito nao pode virar `like '%%'` no telefone (vitrine da vaga).
    expect(
      params.every((p) => String(p) !== "%%"),
      "um termo de texto gerou padrao de telefone `%%`: traz todo mundo da vaga, o oposto de filtrar.",
    ).toBe(true);
    // E, por consequencia, o termo de texto nao aciona `regexp_replace` de telefone sozinho.
    expect(texto.toLowerCase().includes("regexp_replace")).toBe(false);
  });
});

describe("ITEM 4: `busca` dividida por ';' num OR de termos", () => {
  it("tres termos separados por ';' viram tres padroes, cada um aparado", async () => {
    const { where } = bancoQueGravaWhere();
    const { params, texto } = await where("maria ; souza ; oliveira");
    const corps = ["maria", "souza", "oliveira"];
    for (const c of corps) {
      expect(
        params.some((p) => String(p).toLowerCase() === `%${c}%`),
        `o termo "${c}" nao virou um padrao ligado proprio (%${c}%): faltou dividir por ';' e aparar.`,
      ).toBe(true);
    }
    // O ";" NUNCA entra num padrao: se entrou, a busca tratou o blob inteiro como um termo so.
    expect(
      params.some((p) => String(p).includes(";")),
      "o ';' vazou para dentro de um padrao: a busca nao dividiu os termos.",
    ).toBe(false);
    expect(texto).not.toContain(";");
  });

  it("um termo SEM ';' NAO e fragmentado: a frase inteira vira UM termo (guarda dos ~5 leitores)", async () => {
    const { where } = bancoQueGravaWhere();
    const { params } = await where("joao silva");
    expect(
      params.some((p) => String(p).toLowerCase() === "%joao silva%"),
      "a frase sem ';' foi quebrada: os leitores que passam um nome simples quebrariam.",
    ).toBe(true);
  });

  it("termos vazios sao descartados: nenhum padrao vazio `%%` (que casaria TODO mundo da vaga)", async () => {
    const { where } = bancoQueGravaWhere();
    const { params } = await where("maria ;; ;  ; joao");
    expect(
      params.every((p) => String(p) !== "%%"),
      "sobrou um padrao `%%`: termo vazio nao descartado, vira vitrine da vaga inteira.",
    ).toBe(true);
    // E os dois termos de verdade entraram, separados (nao como um blob `%maria ;; ; ; joao%`).
    expect(params.some((p) => String(p).toLowerCase() === "%maria%")).toBe(true);
    expect(params.some((p) => String(p).toLowerCase() === "%joao%")).toBe(true);
  });

  it("CAP de 25 termos: alem disso, os excedentes sao ignorados", async () => {
    const { where } = bancoQueGravaWhere();
    // 40 termos alfabeticos e distintos (sem digito, para `%qaa%` nao casar dentro de `%qab%` nem
    // virar padrao de telefone). "q" + duas letras: qaa, qab, ... cobre 40 sem repetir.
    const termos = Array.from({ length: 40 }, (_, i) => {
      const a = String.fromCharCode(97 + Math.floor(i / 26));
      const b = String.fromCharCode(97 + (i % 26));
      return `q${a}${b}`;
    });
    const { params } = await where(termos.join(";"));
    const presentes = termos.filter((t) => params.some((p) => String(p).toLowerCase() === `%${t}%`));
    expect(
      presentes.length,
      `a busca honrou ${presentes.length} termos; o CAP e 25. Sem o CAP, um ';' repetido vira consulta gigante.`,
    ).toBeLessThanOrEqual(25);
  });
});

describe("ITEM 4: ancora de vaga e seguranca", () => {
  it("a vaga e sempre a ancora: `vaga_id` entra como parametro ligado, em qualquer busca", async () => {
    const { where } = bancoQueGravaWhere();
    const { texto, params } = await where("maria;joao");
    expect(texto.toLowerCase(), "o recorte da vaga nao carimbou `vaga_id`").toContain("vaga_id");
    expect(
      params.some((p) => String(p) === VAGA_ID),
      "o id da vaga tem de viajar ligado: e ele que impede um termo de trazer gente de OUTRA vaga.",
    ).toBe(true);
  });

  it("sem busca, a clausula ainda e so a vaga (nenhum termo traz candidato de outra vaga)", async () => {
    const { where } = bancoQueGravaWhere();
    const { params } = await where("");
    expect(params.some((p) => String(p) === VAGA_ID)).toBe(true);
    // Busca vazia nao cria padrao nenhum: so a ancora de vaga.
    expect(params.some((p) => String(p).includes("%"))).toBe(false);
  });

  it("SEM INJECAO: termo com aspa/`%`/`_` viaja ligado, nunca concatenado no texto do SQL", async () => {
    const { where } = bancoQueGravaWhere();
    const perigoso = "o'brien%_\\";
    const { texto, params } = await where(perigoso);
    expect(
      params.some((p) => String(p).includes("o'brien")),
      "o termo perigoso tem de estar nos PARAMETROS (ligado).",
    ).toBe(true);
    expect(
      texto.includes("o'brien"),
      "o termo apareceu no TEXTO do SQL: foi concatenado, e isso e injecao de LIKE/SQL.",
    ).toBe(false);
  });
});
