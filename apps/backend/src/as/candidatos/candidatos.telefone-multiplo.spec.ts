import { describe, expect, it } from "vitest";
import { telefonesEPrincipal } from "./candidatos.service";
import { RetencaoCandidatosService } from "./retencao-candidatos.service";

/**
 * ─ TELEFONE MÚLTIPLO: o espelho `telefone = telefones[0]`, e o expurgo que nula a LISTA (§A.6) ──
 *
 * O QUE ESTE ARQUIVO PROVA:
 *   1. `telefonesEPrincipal` deriva o par coerente: o primeiro não vazio vira o escalar, a lista é
 *      aparada/deduplicada; sem lista, o escalar é a fonte e a coluna vira `[telefone]` (ou vazia);
 *   2. o expurgo de retenção NULA `telefones` (set para `'{}'`) nos DOIS updates (o alvo e a
 *      cicatrização), como já faz com o `telefone` escalar.
 */

describe("telefonesEPrincipal: o espelho telefone = telefones[0]", () => {
  it("a LISTA manda: o primeiro não vazio é o escalar, a lista é aparada e deduplicada", () => {
    const r = telefonesEPrincipal([" 11 90000-0001 ", "11 90000-0002", "11 90000-0001", ""], undefined);
    expect(r.telefone).toBe("11 90000-0001");
    expect(r.telefones).toEqual(["11 90000-0001", "11 90000-0002"]);
  });

  it("sem lista, o ESCALAR é a fonte e a coluna vira [telefone] (caso planilha/manual)", () => {
    const r = telefonesEPrincipal(undefined, "11 98888-7777");
    expect(r.telefone).toBe("11 98888-7777");
    expect(r.telefones).toEqual(["11 98888-7777"]);
  });

  it("lista vazia e escalar vazio: telefone null e lista vazia", () => {
    expect(telefonesEPrincipal([], "   ")).toEqual({ telefone: null, telefones: [] });
    expect(telefonesEPrincipal(undefined, undefined)).toEqual({ telefone: null, telefones: [] });
  });

  it("lista com só vazios cai no escalar", () => {
    const r = telefonesEPrincipal(["", "  "], "11 97777-6666");
    expect(r.telefone).toBe("11 97777-6666");
    expect(r.telefones).toEqual(["11 97777-6666"]);
  });
});

/** Reconstrói o texto da consulta a partir dos pedaços do objeto SQL do drizzle (recursivo). */
function textoDaConsulta(q: unknown): string {
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no?.queryChunks)) return no.queryChunks.map(textoDaConsulta).join("");
  if (Array.isArray(no?.value)) return no.value.join("");
  return no?.value !== undefined ? String(no.value) : "";
}

/** Só o SQL executável: linhas de comentário fora, espaços colapsados. */
function sqlExecutavel(q: unknown): string {
  return textoDaConsulta(q)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function sqlDoExpurgo(): Promise<string> {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve([]);
    },
  } as never;
  const s = new RetencaoCandidatosService(db);
  await s.expurgar();
  expect(consultas).toHaveLength(1);
  return sqlExecutavel(consultas[0]);
}

describe("expurgo de retenção: a LISTA de telefones some junto com o escalar (§A.6)", () => {
  it("nula `telefones` em AMBOS os updates (alvo e cicatrização)", async () => {
    const sql = await sqlDoExpurgo();
    // Os dois `update as_candidatos` do expurgo setam `telefones = '{}'`.
    const ocorrencias = sql.match(/telefones\s*=\s*'\{\}'/g) ?? [];
    expect(
      ocorrencias.length,
      "o expurgo tem de zerar `telefones` no update do alvo E no da cicatrização.",
    ).toBeGreaterThanOrEqual(2);
    // E continua nulando o escalar: a lista não substitui o escalar, acompanha.
    expect(sql).toMatch(/telefone\s*=\s*null/);
  });
});
