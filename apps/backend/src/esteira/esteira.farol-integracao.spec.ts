import { afterEach, describe, expect, it, vi } from "vitest";
// `vi.mock` é içado acima destes imports, então o serviço recebe os combinadores mockados e as
// referências de coluna abaixo casam com as condições capturadas.
import { EsteiraService } from "./esteira.service";
import { admissoes, frentesAdmissao } from "../db/schema";

/**
 * ITEM 2 DA OST DOS 3 AJUSTES — o desfecho tira a pessoa da fila, e o recorte do BANCO.
 *
 * MESMO HARNESS da regressão do Clicksign (`esteira.clicksign-visibilidade.spec`): sem banco real,
 * captura-se a árvore de condições REAL que o `listar` monta e avalia-se contra linhas sintéticas.
 * Não há regra reimplementada aqui: o que se mede é a condição que o código gerou.
 *
 * O QUE ESTE ARQUIVO TRAVA, e por que ele existe:
 *  1. DECLÍNIO e RESCISÃO somem de TODAS as abas, inclusive da Integração. Já era assim antes desta
 *     OST, e o teste passa a provar: era a metade do pedido que já estava pronta e ninguém sabia.
 *  2. BANCO_AGUARDAR some SÓ da Integração. É o recorte decidido pelo diretor, e a razão de ele ser
 *     um teste e não um comentário: estender a exclusão às outras três abas mudaria contagem já
 *     validada (Auditoria, Exame e Cadastro) e desfaria a tag "Banco, Aguardar" de 13/08/2026.
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
    notInArray: tag("notInArray"),
    gte: tag("gte"),
    lt: tag("lt"),
    ilike: tag("ilike"),
    isNotNull: tag("isNotNull"),
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
    case "notInArray": {
      const [col, arr] = args;
      return row.has(col) ? !(arr as unknown[]).includes(row.get(col)) : true;
    }
    default:
      return true;
  }
}

/** A árvore de condições referencia a coluna do farol em algum ponto? */
function mencionaFarol(c: unknown): boolean {
  if (!c || typeof c !== "object" || !("op" in c)) return false;
  const { args } = c as Cond;
  return args.some((a) => a === admissoes.farolGlobal || mencionaFarol(a));
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
  progressoObrigatoriosMap: vi.fn().mockResolvedValue(new Map()),
  faltantesObrigatorios: vi.fn().mockResolvedValue([]),
};

function montar() {
  const captured: unknown[] = [];
  const svc = new EsteiraService(fakeDb(captured) as never, regua as never, {} as never);
  return { svc, captured };
}

/** Linha de uma frente aberta com o farol da admissão. */
function linha(tipo: string, farol: string): Map<unknown, unknown> {
  return new Map<unknown, unknown>([
    [frentesAdmissao.tipo, tipo],
    [frentesAdmissao.concluida, false],
    [admissoes.farolGlobal, farol],
  ]);
}

const ABAS: Array<{ rota: string; tipo: string }> = [
  { rota: "auditoria", tipo: "AUDITORIA" },
  { rota: "exame", tipo: "EXAME" },
  { rota: "cadastro", tipo: "CADASTRO_CONTRATO" },
  { rota: "integracao", tipo: "INTEGRACAO" },
];

describe("EsteiraService.listar — desfecho carimbado tira a pessoa da fila (item 2)", () => {
  afterEach(() => vi.clearAllMocks());

  it.each(ABAS)("DECLINOU e RESCISAO somem da aba $rota, carimbados de onde for", async (aba) => {
    const { svc, captured } = montar();
    await svc.listar(aba.rota, {});
    const where = captured[0];

    expect(avalia(where, linha(aba.tipo, "DECLINOU"))).toBe(false);
    expect(avalia(where, linha(aba.tipo, "RESCISAO"))).toBe(false);
    // Pré-admissão e recusada também não entram em fila operacional nenhuma.
    expect(avalia(where, linha(aba.tipo, "AGUARDANDO_LIBERACAO"))).toBe(false);
    expect(avalia(where, linha(aba.tipo, "LIBERACAO_RECUSADA"))).toBe(false);
    // Admissão viva continua aparecendo, em todas elas.
    expect(avalia(where, linha(aba.tipo, "EM_ADMISSAO"))).toBe(true);
  });

  it("BANCO_AGUARDAR some SÓ da INTEGRAÇÃO (agendar quem está no banco não faz sentido)", async () => {
    const { svc, captured } = montar();
    await svc.listar("integracao", {});
    expect(avalia(captured[0], linha("INTEGRACAO", "BANCO_AGUARDAR"))).toBe(false);
  });

  it.each(ABAS.filter((a) => a.tipo !== "INTEGRACAO"))(
    "BANCO_AGUARDAR CONTINUA visível na aba $rota (contagem validada, §A.26)",
    async (aba) => {
      const { svc, captured } = montar();
      await svc.listar(aba.rota, {});
      // O trabalho segue durante o banco: documento chega, exame acontece, cadastro se prepara. É
      // por isso que a correção de 13/08/2026 pôs a tag "Banco, Aguardar" em vez de esconder a linha.
      expect(avalia(captured[0], linha(aba.tipo, "BANCO_AGUARDAR"))).toBe(true);
    },
  );

  it("a exclusão do banco vale também para os KPIs da Integração, não só para a lista", async () => {
    const { svc, captured } = montar();
    await svc.listar("integracao", {});
    // Todo WHERE que FILTRA POR FAROL nesta chamada (itens e KPIs) nasce do MESMO `clientePeriodo`.
    // Se algum deixasse o banco passar, o card contaria alguém que a fila não mostra. Os demais
    // WHERE capturados (o catálogo de status, por exemplo) não olham farol e ficam de fora.
    const comFarol = captured.filter(mencionaFarol);
    expect(comFarol.length).toBeGreaterThan(1);
    for (const where of comFarol) {
      expect(avalia(where, linha("INTEGRACAO", "BANCO_AGUARDAR"))).toBe(false);
    }
  });
});
