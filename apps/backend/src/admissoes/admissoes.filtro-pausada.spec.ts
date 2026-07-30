import { describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";

/**
 * FILTRO "Admissão Pausada" no Gerenciador (OST da pausa, correção do diretor).
 *
 * "Pausada" entrou como mais uma opção do MESMO seletor de status, então ela chega ao backend dentro
 * de `filtros.farol` como se fosse um farol. Só que ela NÃO é valor de `farol_global` (é flag
 * paralela, `pausada_em`), e é aqui que a tradução acontece.
 *
 * O que se prova, capturando o SQL gerado:
 *  - só "Pausada" filtra pela FLAG, e não tenta comparar com o enum (o que estouraria no Postgres);
 *  - "Pausada" junto de outros status vira OU, que é o que o multi-select promete;
 *  - sem "Pausada", o filtro segue exatamente como era (nenhuma regressão no que já funcionava).
 */

/** Captura a condição `where` da consulta da lista, sem Postgres. */
function montar() {
  let whereCapturado: unknown;
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "orderBy", "groupBy", "limit", "offset"]) {
    chain[m] = () => chain;
  }
  chain.where = (c: unknown) => {
    whereCapturado = c;
    return chain;
  };
  chain.then = (res: (v: unknown[]) => unknown) => Promise.resolve([]).then(res);

  const db = { select: vi.fn(() => chain) };
  const service = new AdmissoesService(db as never);
  return { service, condicao: () => whereCapturado };
}

/**
 * Achata a condição do Drizzle numa string legível. `JSON.stringify` não serve: a árvore tem
 * referência circular (coluna aponta para a tabela, que aponta para a coluna). Percorre os
 * `queryChunks` colhendo NOME DE COLUNA e os pedaços de texto do operador, que é tudo o que os
 * testes precisam afirmar.
 */
function achatar(no: unknown, vistos = new Set<unknown>()): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string") return no;
  if (typeof no !== "object") return String(no);
  if (vistos.has(no)) return "";
  vistos.add(no);
  const o = no as Record<string, unknown>;
  // Coluna: o que interessa é o nome físico ("farol_global", "pausada_em").
  if (typeof o.name === "string" && o.table) return ` ${o.name} `;
  // StringChunk: o texto cru do operador (" is not null", " or ", ...).
  if (Array.isArray(o.value) && o.value.every((v) => typeof v === "string")) {
    return (o.value as string[]).join("");
  }
  if (Array.isArray(no)) return no.map((n) => achatar(n, vistos)).join("");
  if (Array.isArray(o.queryChunks)) return achatar(o.queryChunks, vistos);
  return Object.values(o)
    .map((v) => achatar(v, vistos))
    .join("");
}

/** O SQL do Drizzle vira uma árvore; procurar pelos fragmentos é suficiente e estável. */
async function sqlDoFiltro(farol: string[]): Promise<string> {
  const { service, condicao } = montar();
  await service.listar({ farol }).catch(() => undefined);
  return achatar(condicao());
}

describe("filtro de status: 'Pausada' é traduzida para a flag", () => {
  it("só 'Pausada' filtra pela COLUNA pausada_em, nunca comparando com o enum de farol", async () => {
    const s = await sqlDoFiltro(["PAUSADA"]);
    expect(s).toMatch(/pausada_em/);
    expect(s).not.toMatch(/'PAUSADA'/); // não vaza o pseudo-valor para o enum
  });

  it("'Pausada' junto de outro status vira OU (o que o multi-select promete)", async () => {
    const s = await sqlDoFiltro(["EM_ADMISSAO", "PAUSADA"]);
    expect(s).toMatch(/pausada_em/);
    expect(s).toMatch(/farol_global/);
    expect(s).not.toMatch(/'PAUSADA'/);
  });

  it("sem 'Pausada' o filtro é o de sempre: farol, e nada de flag", async () => {
    const s = await sqlDoFiltro(["DECLINOU", "RESCISAO"]);
    expect(s).toMatch(/farol_global/);
    // A cláusula de pausa não entra quando ninguém pediu por ela.
    expect(s).not.toMatch(/pausada_em" is not null/i);
  });
});
