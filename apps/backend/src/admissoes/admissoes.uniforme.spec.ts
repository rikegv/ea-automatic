import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import { candidatoAlteracoesLog, dadosVagaFolha } from "../db/schema";

/**
 * UNIFORME EDITÁVEL DEPOIS DA LIBERAÇÃO (melhoria EAC, item 11b).
 *
 * O que estes testes travam, em ordem de importância:
 *
 *  1. O SINALIZADOR É REGRAVADO NA MESMA TRANSAÇÃO, e DEPOIS da gravação. Uniforme entra na régua de
 *     pendências: sem o recálculo, a coluna "Pendências Obrig." (régua viva) enxergaria a resposta na
 *     hora e o KPI (enum gravado) continuaria dizendo o contrário sobre a MESMA admissão. Recalcular
 *     ANTES seria pior ainda: leria o estado velho e gravaria um sinalizador que já nasce errado.
 *  2. "NÃO POSSUI" LIMPA OS TAMANHOS, pelo mesmo normalizador da liberação. Sem isso sobraria
 *     "camiseta M" em quem respondeu que não tem uniforme.
 *  3. A TRILHA registra só o que MUDOU, campo a campo, com o autor.
 *  4. A escrita NÃO toca EPI, cliente, cargo nem frente: é a porta estreita do uniforme.
 */

interface Cenario {
  admissaoExiste?: boolean;
  vagaExiste?: boolean;
  /** Documentos da admissão, para a regra "INCONFORME domina". */
  documentos?: { estado: string }[];
  /** Estado gravado hoje, para a trilha comparar. */
  atual?: { possuiUniforme: boolean | null; uniformeCamiseta: string | null; uniformeCalca: string | null; uniformeBota: string | null };
}

function montar(cen: Cenario = {}) {
  const updates: { tabela: unknown; valores: Record<string, unknown> }[] = [];
  const inserts: { tabela: unknown; valores: unknown }[] = [];
  const ordem: string[] = [];

  const chain = (tabela: unknown): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) b[m] = () => b;
    b.set = (v: Record<string, unknown>) => {
      updates.push({ tabela, valores: v });
      ordem.push(tabela === dadosVagaFolha ? "grava-uniforme" : "regrava-sinalizador");
      return b;
    };
    b.values = (v: unknown) => {
      inserts.push({ tabela, valores: v });
      ordem.push("trilha");
      return b;
    };
    b.then = (resolve: (v: unknown) => unknown) => resolve(cen.documentos ?? []);
    return b;
  };

  const atual = cen.atual ?? {
    possuiUniforme: null,
    uniformeCamiseta: null,
    uniformeCalca: null,
    uniformeBota: null,
  };
  const db = {
    select: () => chain(null),
    // A régua viva (`pendenciasObrigatoriasSet`) consulta benefícios e configuração por
    // `selectDistinct`; devolve vazio, porque o que este teste observa é o sinalizador escrito.
    selectDistinct: () => chain(null),
    update: (t: unknown) => chain(t),
    insert: (t: unknown) => chain(t),
    query: {
      admissoes: {
        findFirst: async () =>
          cen.admissaoExiste === false ? undefined : { id: "adm-1", candidatoCpf: "1" },
      },
      dadosVagaFolha: {
        findFirst: async () => (cen.vagaExiste === false ? undefined : atual),
      },
      candidatos: { findFirst: async () => ({ nome: "MARIA", cpf: "1" }) },
    },
  } as Record<string, unknown>;
  (db as { transaction: unknown }).transaction = async (cb: (t: unknown) => Promise<unknown>) =>
    cb(db);

  return { svc: new AdmissoesService(db as never, {} as never), updates, inserts, ordem };
}

const USER = { id: "user-1", papel: "COMUM" } as never;

describe("gravação do uniforme", () => {
  it("grava os três tamanhos quando a pessoa possui", async () => {
    const ctx = montar();

    await ctx.svc.atualizarUniforme(
      "adm-1",
      { uniforme: { possui: true, camiseta: "M", calca: "42", bota: "40" } },
      USER,
    );

    const grava = ctx.updates.find((u) => u.tabela === dadosVagaFolha)!;
    expect(grava.valores).toMatchObject({
      possuiUniforme: true,
      uniformeCamiseta: "M",
      uniformeCalca: "42",
      uniformeBota: "40",
    });
  });

  it('"não possui" LIMPA os tamanhos, pelo normalizador da liberação', async () => {
    const ctx = montar();

    await ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: false, camiseta: "M" } }, USER);

    expect(ctx.updates.find((u) => u.tabela === dadosVagaFolha)!.valores).toMatchObject({
      possuiUniforme: false,
      uniformeCamiseta: null,
      uniformeCalca: null,
      uniformeBota: null,
    });
  });

  it("NÃO toca EPI, cliente, cargo nem frente: é a porta estreita do uniforme", async () => {
    const ctx = montar();

    await ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: true, camiseta: "G" } }, USER);

    const campos = Object.keys(ctx.updates.find((u) => u.tabela === dadosVagaFolha)!.valores).sort();
    expect(campos).toEqual([
      "possuiUniforme",
      "uniformeBota",
      "uniformeCalca",
      "uniformeCamiseta",
    ]);
  });
});

describe("o alcance na contagem de pendências (§A.27)", () => {
  /**
   * A ORDEM É A GARANTIA: gravar e SÓ ENTÃO regravar o sinalizador, tudo na mesma transação. É o que
   * mantém a coluna viva e o KPI gravado dizendo a mesma coisa sobre a mesma admissão.
   */
  it("regrava o sinalizador DEPOIS de gravar, na mesma transação", async () => {
    const ctx = montar();

    await ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: true, camiseta: "M" } }, USER);

    expect(ctx.ordem).toEqual(["grava-uniforme", "trilha", "regrava-sinalizador"]);
    expect(ctx.updates.at(-1)!.valores).toHaveProperty("sinalizadorPreenchimento");
  });
});

describe("trilha", () => {
  it("registra só o que MUDOU, com o autor", async () => {
    const ctx = montar({
      atual: {
        possuiUniforme: true,
        uniformeCamiseta: "M",
        uniformeCalca: "42",
        uniformeBota: "40",
      },
    });

    await ctx.svc.atualizarUniforme(
      "adm-1",
      { uniforme: { possui: true, camiseta: "G", calca: "42", bota: "40" } },
      USER,
    );

    const trilha = ctx.inserts.find((i) => i.tabela === candidatoAlteracoesLog)!
      .valores as Record<string, unknown>[];
    expect(trilha).toHaveLength(1);
    expect(trilha[0]).toMatchObject({
      campo: "uniformeCamiseta",
      valorAnterior: "M",
      valorNovo: "G",
      autorId: "user-1",
    });
  });

  it("sem mudança, não escreve trilha", async () => {
    const ctx = montar({
      atual: {
        possuiUniforme: true,
        uniformeCamiseta: "M",
        uniformeCalca: null,
        uniformeBota: null,
      },
    });

    await ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: true, camiseta: "M" } }, USER);

    expect(ctx.inserts.filter((i) => i.tabela === candidatoAlteracoesLog)).toHaveLength(0);
  });
});

describe("guardas", () => {
  it("admissão inexistente é 404", async () => {
    const ctx = montar({ admissaoExiste: false });
    await expect(
      ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: true } }, USER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /** Sem dados de vaga não há onde gravar: a admissão ainda nem foi liberada. */
  it("admissão sem dados de vaga é recusada com mensagem útil", async () => {
    const ctx = montar({ vagaExiste: false });
    await expect(
      ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: true } }, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.updates).toHaveLength(0);
  });
});

/**
 * DOCUMENTO INCONFORME DOMINA (§A.3). A prova ao vivo da edição de uniforme pegou isto: sem a regra,
 * corrigir um tamanho de camiseta APAGAVA o sinal de inconformidade documental da admissão, e o
 * documento reprovado sumia do radar do time.
 */
describe("a inconformidade documental sobrevive à edição", () => {
  it("com documento INCONFORME, o sinalizador volta a INCONFORMIDADE", async () => {
    const ctx = montar({ documentos: [{ estado: "ENTREGUE" }, { estado: "INCONFORME" }] });

    await ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: true, camiseta: "M" } }, USER);

    expect(ctx.updates.at(-1)!.valores).toMatchObject({
      sinalizadorPreenchimento: "INCONFORMIDADE",
    });
  });

  it("sem documento inconforme, o cálculo de campos volta a valer", async () => {
    const ctx = montar({ documentos: [{ estado: "ENTREGUE" }] });

    await ctx.svc.atualizarUniforme("adm-1", { uniforme: { possui: true, camiseta: "M" } }, USER);

    expect(ctx.updates.at(-1)!.valores.sinalizadorPreenchimento).not.toBe("INCONFORMIDADE");
  });
});

/**
 * IMPORTAÇÃO DE MATRÍCULAS EM LOTE (melhoria EAC, item 11d).
 *
 * O que estes testes travam:
 *  1. SÓ GRAVA O QUE MUDOU. Reimportar a mesma planilha não pode virar um update em massa nem encher
 *     a trilha de linhas iguais.
 *  2. A TRILHA sai campo a campo, com o autor, no mesmo log do Gerenciador.
 *  3. Lista vazia é recusada, em vez de virar um lote sem alvo.
 */
describe("aplicar matrículas em lote", () => {
  const montarLote = (atuais: { id: string; matricula: string | null }[]) => {
    const updates: Record<string, unknown>[] = [];
    const inserts: unknown[][] = [];
    const chain = (): Record<string, unknown> => {
      const b: Record<string, unknown> = {};
      for (const m of ["from", "innerJoin", "leftJoin", "where"]) b[m] = () => b;
      b.set = (v: Record<string, unknown>) => {
        updates.push(v);
        return b;
      };
      b.values = (v: unknown) => {
        inserts.push(Array.isArray(v) ? v : [v]);
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown) => resolve(atuais);
      return b;
    };
    const db = {
      select: () => chain(),
      update: () => chain(),
      insert: () => chain(),
      query: { admissoes: { findFirst: async () => undefined } },
    } as Record<string, unknown>;
    (db as { transaction: unknown }).transaction = async (cb: (t: unknown) => Promise<unknown>) =>
      cb(db);
    return { svc: new AdmissoesService(db as never, {} as never), updates, inserts };
  };

  it("grava só quem mudou e conta o resto", async () => {
    const ctx = montarLote([
      { id: "a", matricula: null },
      { id: "b", matricula: "999" },
    ]);

    const r = await ctx.svc.aplicarMatriculas(
      [
        { admissaoId: "a", matricula: "123" },
        { admissaoId: "b", matricula: "999" },
      ],
      USER,
    );

    expect(r).toEqual({ gravadas: 1, semMudanca: 1, ignoradas: 0 });
    expect(ctx.updates).toHaveLength(1);
    expect(ctx.updates[0]).toMatchObject({ matricula: "123" });
  });

  it("a trilha registra a matrícula anterior e a nova, com o autor", async () => {
    const ctx = montarLote([{ id: "a", matricula: "111" }]);

    await ctx.svc.aplicarMatriculas([{ admissaoId: "a", matricula: "222" }], USER);

    expect(ctx.inserts[0]).toEqual([
      {
        admissaoId: "a",
        campo: "matricula",
        valorAnterior: "111",
        valorNovo: "222",
        autorId: "user-1",
      },
    ]);
  });

  it("lista vazia é recusada", async () => {
    const ctx = montarLote([]);
    await expect(ctx.svc.aplicarMatriculas([], USER)).rejects.toBeInstanceOf(BadRequestException);
  });
});
