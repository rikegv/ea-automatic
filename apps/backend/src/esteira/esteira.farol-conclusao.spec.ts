import { describe, expect, it } from "vitest";
import { EsteiraService } from "./esteira.service";
import { admissoes, clientePendenciaConfig, frentesAdmissao } from "../db/schema";

/**
 * FAROL DE CONCLUSÃO SEM INTEGRAÇÃO (causa raiz apurada em 12/08/2026, com hora).
 *
 * O DEFEITO. O carimbo de `ADMISSAO_CONCLUIDA` morava só na transição da frente INTEGRAÇÃO. Em
 * 11/08/2026 às 20:42 a integração do cliente 57269 foi desmarcada; a frente parou de nascer e o
 * carimbo deixou de ser alcançado. Os Cadastros fechados a partir das 21:09 terminaram a esteira com
 * o farol preso em EM_ADMISSAO: o Gerenciador (que lê as FRENTES) já os contava como concluídos e o
 * Painel (que lê o FAROL) não, e as duas telas divergiram em 14 admissões da Bienal.
 *
 * O QUE ESTES TESTES TRAVAM, em ordem de importância:
 *
 *  1. Cliente que NÃO exige integração: fechar o Cadastro carimba `ADMISSAO_CONCLUIDA`. É a correção.
 *  2. Cliente que EXIGE: nada de carimbo, porque a esteira NÃO acabou (a integração ainda vem). Este
 *     é o teste que impede a correção de virar um "conclui tudo mais cedo".
 *  3. As duas pontas continuam mutuamente exclusivas: ou nasce a frente, ou carimba o farol, nunca
 *     as duas coisas.
 *  4. Admissão SEM cliente não carimba nada: `clienteExigeIntegracao` devolve `false` para cliente
 *     nulo com o sentido de "não há regra", que não é "o cliente dispensou".
 *  5. Reverter o Cadastro não carimba: só a CONCLUSÃO conclui.
 *
 * Sem Postgres: db falso que devolve as frentes irmãs e a configuração do cliente, e guarda o que foi
 * escrito, então o teste observa o comportamento REAL do serviço.
 */

const ADMISSAO_ID = "adm-1";
const FRENTE_CADASTRO_ID = "frente-cadastro-1";

interface Fixtures {
  /** O cliente exige integração? `null` devolve "sem linha", que é o default `true`. */
  exigeIntegracao?: boolean | null;
  /** Admissão sem cliente atribuído (pré-admissão). */
  semCliente?: boolean;
  /** Já existe frente de INTEGRAÇÃO (a admissão já passou por aqui). */
  integracaoExiste?: boolean;
  /** A frente de Cadastro já está concluída (fixture da REVERSÃO). */
  cadastroConcluido?: boolean;
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function montar(f: Fixtures) {
  const escritas: Escrita[] = [];
  const atualizacoes: Escrita[] = [];

  const irmas = [
    {
      id: FRENTE_CADASTRO_ID,
      tipo: "CADASTRO_CONTRATO",
      status: f.cadastroConcluido ? "CADASTRADO" : "A_CADASTRAR",
      concluida: f.cadastroConcluido ?? false,
    },
    { id: "frente-auditoria-1", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true },
    { id: "frente-exame-1", tipo: "EXAME", status: "APTO", concluida: true },
    ...(f.integracaoExiste
      ? [{ id: "frente-integracao-1", tipo: "INTEGRACAO", status: "A_AGENDAR", concluida: false }]
      : []),
  ];

  const chain = (): Record<string, unknown> => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    for (const m of ["innerJoin", "leftJoin", "orderBy", "groupBy", "limit", "where"]) {
      b[m] = () => b;
    }
    b.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) => {
      // A configuração do cliente é lida por `clienteExigeIntegracao`; ausência de linha = exige.
      const linhas =
        tabela === frentesAdmissao
          ? irmas
          : tabela === clientePendenciaConfig
            ? f.exigeIntegracao === null || f.exigeIntegracao === undefined
              ? []
              : [{ obrigatorio: f.exigeIntegracao }]
            : [];
      return Promise.resolve(linhas).then(res, rej);
    };
    return b;
  };

  const escrita = (tabela: unknown, destino: Escrita[]) => {
    const b: Record<string, unknown> = {};
    b.values = (v: unknown) => {
      destino.push({ tabela, valores: v as Record<string, unknown> });
      return b;
    };
    b.set = (v: unknown) => {
      atualizacoes.push({ tabela, valores: v as Record<string, unknown> });
      return b;
    };
    b.where = () => b;
    b.onConflictDoUpdate = () => b;
    b.onConflictDoNothing = () => b;
    b.returning = () =>
      Promise.resolve([
        { id: FRENTE_CADASTRO_ID, status: "CADASTRADO", concluida: true, dataConclusao: null },
      ]);
    b.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve([]).then(res, rej);
    return b;
  };

  const exec = {
    select: () => chain(),
    selectDistinct: () => chain(),
    insert: (t: unknown) => escrita(t, escritas),
    update: (t: unknown) => escrita(t, escritas),
    query: {
      admissoes: {
        findFirst: async () => ({
          id: ADMISSAO_ID,
          farolGlobal: "EM_ADMISSAO",
          codCliente: f.semCliente ? null : "57269",
          dataAdmissao: "2026-09-01",
          consultorId: null,
        }),
      },
      frentesAdmissao: {
        findFirst: async () => ({
          id: FRENTE_CADASTRO_ID,
          admissaoId: ADMISSAO_ID,
          tipo: "CADASTRO_CONTRATO",
          status: f.cadastroConcluido ? "CADASTRADO" : "A_CADASTRAR",
          concluida: f.cadastroConcluido ?? false,
        }),
      },
    },
  } as Record<string, unknown>;
  (exec as { transaction: unknown }).transaction = async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(exec);

  const svc = new EsteiraService(exec as never, {} as never, {} as never);
  return { svc, escritas, atualizacoes };
}

const USER = { id: "user-1", papel: "MASTER" } as never;

/** O que foi gravado em `admissoes` (é onde o farol mora). */
const farolGravado = (atualizacoes: Escrita[]) =>
  atualizacoes.filter((a) => a.tabela === admissoes).map((a) => a.valores.farolGlobal);

/** As frentes INSERIDAS (nascimento lazy da integração). */
const frentesInseridas = (escritas: Escrita[]) =>
  escritas.filter((e) => e.tabela === frentesAdmissao).map((e) => e.valores.tipo);

const concluirCadastro = (svc: EsteiraService, status = "CADASTRADO") =>
  svc.mudarStatus(FRENTE_CADASTRO_ID, { status } as never, USER);

describe("conclusão do Cadastro para cliente que NÃO exige integração", () => {
  it("carimba ADMISSAO_CONCLUIDA: a esteira acabou ali, e o farol tem de dizer isso", async () => {
    const ctx = montar({ exigeIntegracao: false });

    const r = (await concluirCadastro(ctx.svc)) as Record<string, unknown>;

    expect(farolGravado(ctx.atualizacoes)).toContain("ADMISSAO_CONCLUIDA");
    // A tela recebe o farol novo na mesma resposta, como já acontece pelo caminho da integração.
    expect(r.farolGlobal).toBe("ADMISSAO_CONCLUIDA");
  });

  it("NÃO cria frente de integração: o cliente dispensou, e as duas pontas são exclusivas", async () => {
    const ctx = montar({ exigeIntegracao: false });
    await concluirCadastro(ctx.svc);
    expect(frentesInseridas(ctx.escritas)).not.toContain("INTEGRACAO");
  });
});

describe("conclusão do Cadastro para cliente que EXIGE integração", () => {
  /**
   * O TESTE QUE IMPEDE A CORREÇÃO DE VIRAR OUTRO DEFEITO. Quem ainda vai passar pela integração NÃO
   * terminou a esteira, e carimbar aqui daria a admissão por concluída uma etapa antes do fim.
   */
  it("não carimba farol nenhum, e a frente de integração nasce", async () => {
    const ctx = montar({ exigeIntegracao: true });

    const r = (await concluirCadastro(ctx.svc)) as Record<string, unknown>;

    expect(farolGravado(ctx.atualizacoes)).not.toContain("ADMISSAO_CONCLUIDA");
    expect(r.farolGlobal).toBeUndefined();
    expect(frentesInseridas(ctx.escritas)).toContain("INTEGRACAO");
  });

  it("cliente SEM LINHA de configuração exige por default, então também não carimba", async () => {
    const ctx = montar({ exigeIntegracao: null });
    await concluirCadastro(ctx.svc);
    expect(farolGravado(ctx.atualizacoes)).not.toContain("ADMISSAO_CONCLUIDA");
    expect(frentesInseridas(ctx.escritas)).toContain("INTEGRACAO");
  });

  it("integração JÁ existente não recarimba nada: quem manda ali é a transição dela", async () => {
    const ctx = montar({ exigeIntegracao: false, integracaoExiste: true });
    await concluirCadastro(ctx.svc);
    expect(farolGravado(ctx.atualizacoes)).not.toContain("ADMISSAO_CONCLUIDA");
  });
});

describe("os limites do carimbo", () => {
  it("admissão SEM cliente não carimba: ausência de regra não é dispensa", async () => {
    const ctx = montar({ semCliente: true });
    await concluirCadastro(ctx.svc);
    expect(farolGravado(ctx.atualizacoes)).not.toContain("ADMISSAO_CONCLUIDA");
  });

  /**
   * REVERTER não é concluir. Vale registrar o outro lado, que esta correção NÃO mexeu: uma reversão
   * depois do carimbo não desfaz o farol, exatamente como já acontecia no caminho da integração
   * (ADMISSAO_CONCLUIDA é pegajoso, §A.3). O comportamento é o mesmo dos dois lados, de propósito.
   */
  it("REVERTER o Cadastro não carimba: só a conclusão conclui", async () => {
    const ctx = montar({ exigeIntegracao: false, cadastroConcluido: true });
    await concluirCadastro(ctx.svc, "A_CADASTRAR");
    expect(farolGravado(ctx.atualizacoes)).not.toContain("ADMISSAO_CONCLUIDA");
  });
});
