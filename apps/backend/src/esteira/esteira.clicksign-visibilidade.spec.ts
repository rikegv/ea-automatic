import { afterEach, describe, expect, it, vi } from "vitest";
// `vi.mock` é içado acima destes imports, então o serviço recebe os combinadores mockados e as
// referências de coluna abaixo casam com as condições capturadas.
import { EsteiraService } from "./esteira.service";
import { admissoes, frentesAdmissao } from "../db/schema";

/**
 * VISIBILIDADE NA FILA DO CADASTRO: uma régua só, a de sempre (item 2 da OST dos 3 itens).
 *
 * O QUE MUDOU. Este arquivo nasceu guardando a regra da INT-4: Cadastro CONCLUÍDO com o envelope em
 * AGUARDANDO_ASSINATURA ou CANCELADO PERMANECIA na fila, porque o contrato ainda não estava
 * assinado. O diretor tirou essa ressalva: a assinatura tem tela própria (gestão do Ass.Click), e
 * repetir aquele trabalho na fila do Cadastro polui quem faz cadastro com gente cujo cadastro já
 * acabou. O teste segue no mesmo lugar e com o mesmo mecanismo, agora provando a regra NOVA e,
 * principalmente, que o `clicksignStatus` deixou de decidir visibilidade em QUALQUER aba.
 *
 * O que NÃO mudou, e o teste continua cobrindo: a busca por candidato revela concluídas (inclusive
 * as assinadas), e Auditoria e Exame seguem intocadas.
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
  // OST B1 / Bloco 6: progresso da régua obrigatória exibido na coluna Status da aba Auditoria.
  progressoObrigatoriosMap: vi.fn().mockResolvedValue(new Map()),
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

describe("EsteiraService.listar — fila do Cadastro: concluída sai, qualquer que seja o clicksignStatus", () => {
  afterEach(() => vi.clearAllMocks());

  it("CADASTRO sem busca: concluída SOME nos quatro estados de envelope", async () => {
    const { svc, captured } = montar();
    await svc.listar("cadastro", {});
    const where = captured[0];

    // O CASO DO PEDIDO: cadastro concluído com assinatura pendente sai da fila do Cadastro. Ele
    // continua na gestão de assinaturas do Ass.Click, que é onde esse trabalho é acompanhado.
    expect(avalia(where, rowCadastro(true, "AGUARDANDO_ASSINATURA"))).toBe(false);
    // Envelope CANCELADO, à espera de reenvio: mesma régua, também sai.
    expect(avalia(where, rowCadastro(true, "CANCELADO"))).toBe(false);
    // Os dois que já saíam continuam saindo (a mudança não inverteu nada).
    expect(avalia(where, rowCadastro(true, "ASSINADO"))).toBe(false);
    expect(avalia(where, rowCadastro(true, "SEM_ENVELOPE"))).toBe(false);
    // NÃO concluída aparece SEMPRE, também nos quatro estados: cadastro de verdade em aberto não é
    // tocado por esta OST, e é justamente o que não podia ser levado junto.
    for (const envelope of ["AGUARDANDO_ASSINATURA", "CANCELADO", "ASSINADO", "SEM_ENVELOPE"]) {
      expect(avalia(where, rowCadastro(false, envelope))).toBe(true);
    }
  });

  it("CADASTRO com busca (q): revela as concluídas, inclusive a que aguarda assinatura", async () => {
    const { svc, captured } = montar();
    await svc.listar("cadastro", { q: "maria" });
    const where = captured[0];
    expect(avalia(where, rowCadastro(true, "ASSINADO"))).toBe(true);
    // A que saiu da fila por esta OST continua a UM passo de distância: a busca a traz de volta.
    expect(avalia(where, rowCadastro(true, "AGUARDANDO_ASSINATURA"))).toBe(true);
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
