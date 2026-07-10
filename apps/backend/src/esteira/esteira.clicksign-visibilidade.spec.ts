import { afterEach, describe, expect, it, vi } from "vitest";
// `vi.mock` é içado acima destes imports, então o serviço recebe os combinadores mockados e as
// referências de coluna abaixo casam com as condições capturadas.
import { EsteiraService } from "./esteira.service";
import { admissoes, frentesAdmissao } from "../db/schema";

/**
 * REGRESSÃO INT-4 — visibilidade na fila do Cadastro (§A.4/§A.5).
 *
 * O filtro de "some quando concluída" é aplicado pelo Postgres via a cláusula WHERE que o
 * `EsteiraService.listar` monta. Sem banco real, capturamos a árvore de condições REAL que o serviço
 * produz (mockando só os combinadores do drizzle para objetos inspecionáveis) e a AVALIAMOS contra
 * linhas sintéticas com um interpretador genérico. Não há reimplementação da regra: o que se testa é
 * exatamente a condição que o código gerou.
 */

type Cond = { op: string; args: unknown[] };

vi.mock("drizzle-orm", async (orig) => {
  const actual = await orig<typeof import("drizzle-orm")>();
  const tag =
    (op: string) =>
    (...args: unknown[]): Cond => ({ op, args });
  return {
    ...actual,
    and: tag("and"),
    or: tag("or"),
    eq: tag("eq"),
    inArray: tag("inArray"),
    gte: tag("gte"),
    lt: tag("lt"),
    ilike: tag("ilike"),
  };
});

/** Interpreta a árvore de condições real contra uma linha (Map coluna→valor). Desconhecido = passa. */
function avalia(c: unknown, row: Map<unknown, unknown>): boolean {
  if (!c || typeof c !== "object" || !("op" in c)) return true;
  const { op, args } = c as Cond;
  switch (op) {
    case "and":
      return args.every((a) => avalia(a, row));
    case "or":
      return args.some((a) => avalia(a, row));
    case "eq": {
      const [col, val] = args;
      return row.has(col) ? row.get(col) === val : true;
    }
    case "inArray": {
      const [col, arr] = args;
      return row.has(col) ? (arr as unknown[]).includes(row.get(col)) : true;
    }
    default:
      // ilike/gte/lt e demais não participam destes cenários de visibilidade → não filtram.
      return true;
  }
}

/** db.select falso: ignora a query, captura cada WHERE em ordem, resolve [] (sem Postgres). */
function fakeDb(captured: unknown[]) {
  const chain = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "leftJoin", "orderBy", "groupBy"]) b[m] = () => b;
    b.where = (c: unknown) => {
      captured.push(c);
      return b;
    };
    b.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve([]).then(res, rej);
    return b;
  };
  return { select: () => chain(), query: {} };
}

const regua = {
  obrigatoriosPendentesSet: vi.fn().mockResolvedValue(new Set()),
  obrigatoriosPendentesCountMap: vi.fn().mockResolvedValue(new Map()),
  faltantesObrigatorios: vi.fn().mockResolvedValue([]),
};

function montar() {
  const captured: unknown[] = [];
  // AuditoriaService (3º arg): só usado no anexarAso (fora deste teste de listagem) → stub vazio.
  const auditoria = {} as never;
  const svc = new EsteiraService(fakeDb(captured) as never, regua as never, auditoria);
  return { svc, captured };
}

/** Linha da frente de Cadastro com (concluída, clicksignStatus). */
function rowCadastro(concluida: boolean, clicksign: string): Map<unknown, unknown> {
  return new Map<unknown, unknown>([
    [frentesAdmissao.tipo, "CADASTRO_CONTRATO"],
    [frentesAdmissao.concluida, concluida],
    [admissoes.clicksignStatus, clicksign],
  ]);
}

describe("EsteiraService.listar — visibilidade do Cadastro por clicksignStatus (REGRESSÃO INT-4)", () => {
  afterEach(() => vi.clearAllMocks());

  it("CADASTRO sem busca: AGUARDANDO_ASSINATURA e CANCELADO concluídos PERMANECEM; ASSINADO some", async () => {
    const { svc, captured } = montar();
    await svc.listar("cadastro", {});
    const where = captured[0];

    // (a) concluída (INTEGRACAO) aguardando assinatura → trabalho em andamento, aparece sem q.
    expect(avalia(where, rowCadastro(true, "AGUARDANDO_ASSINATURA"))).toBe(true);
    // (b) concluída + envelope CANCELADO (à espera de reenvio) → aparece sem q.
    expect(avalia(where, rowCadastro(true, "CANCELADO"))).toBe(true);
    // (c) concluída + ASSINADO → item finalizado some da fila principal.
    expect(avalia(where, rowCadastro(true, "ASSINADO"))).toBe(false);
    // concluída sem envelope (SEM_ENVELOPE) → finalizada comum, também some.
    expect(avalia(where, rowCadastro(true, "SEM_ENVELOPE"))).toBe(false);
    // não concluída → sempre aparece (pendente normal da frente).
    expect(avalia(where, rowCadastro(false, "SEM_ENVELOPE"))).toBe(true);
  });

  it("CADASTRO com busca (q): revela até concluída+ASSINADO (busca avançada não esconde)", async () => {
    const { svc, captured } = montar();
    await svc.listar("cadastro", { q: "maria" });
    const where = captured[0];
    expect(avalia(where, rowCadastro(true, "ASSINADO"))).toBe(true);
  });

  it("AUDITORIA inalterada: concluída SOME (clicksignStatus NÃO a mantém na fila)", async () => {
    const { svc, captured } = montar();
    await svc.listar("auditoria", {});
    const where = captured[0];

    const row = (concluida: boolean) =>
      new Map<unknown, unknown>([
        [frentesAdmissao.tipo, "AUDITORIA"],
        [frentesAdmissao.concluida, concluida],
        // Mesmo com um clicksignStatus que "salvaria" o Cadastro, a Auditoria ignora.
        [admissoes.clicksignStatus, "AGUARDANDO_ASSINATURA"],
      ]);
    expect(avalia(where, row(true))).toBe(false); // concluída some
    expect(avalia(where, row(false))).toBe(true); // em andamento aparece
  });

  it("EXAME inalterado: concluída SOME (sem ressalva de clicksignStatus)", async () => {
    const { svc, captured } = montar();
    await svc.listar("exame", {});
    const where = captured[0];

    const row = (concluida: boolean) =>
      new Map<unknown, unknown>([
        [frentesAdmissao.tipo, "EXAME"],
        [frentesAdmissao.concluida, concluida],
        [admissoes.clicksignStatus, "AGUARDANDO_ASSINATURA"],
      ]);
    expect(avalia(where, row(true))).toBe(false);
    expect(avalia(where, row(false))).toBe(true);
  });
});
