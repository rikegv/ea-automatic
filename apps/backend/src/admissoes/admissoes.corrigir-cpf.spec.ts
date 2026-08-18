import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import { admissoes, candidatoAlteracoesLog, candidatos } from "../db/schema";
import type { AuthUser } from "../auth/auth.types";

/**
 * Fake do `select()` do Drizzle com DUAS respostas, e o que as distingue é o JOIN.
 *
 * A liberação faz duas leituras por `select`: a RÉGUA do par (sem join) e a TRAVA DE CPF DUPLICADO
 * (item 3 da OST dos 3 ajustes, que usa leftJoin em cliente e cargo). O fake devolve as linhas da
 * régua na consulta sem join e VAZIO na com join, que é o cenário destes testes: nenhum outro CPF
 * vivo, então a trava não dispara e o caminho medido segue sendo o de sempre.
 */
function selectFake(linhasRegua: unknown[]) {
  return () => ({
    from: () => {
      const comJoin: { leftJoin: () => typeof comJoin; where: () => Promise<unknown[]> } = {
        leftJoin: () => comJoin,
        where: async () => [],
      };
      return { ...comJoin, where: async () => linhasRegua };
    },
  });
}


/**
 * ITEM 9 — CPF ERRADO DO PANDAPÉ.
 *
 * Frente A: o dígito verificador é conferido na LIBERAÇÃO (individual e lote), que é a porta de
 * entrada da esteira. Frente B: o Master corrige o CPF de uma admissão, com o CPF novo passando pela
 * MESMA validação, colisão avisada com o NOME de quem já tem o CPF, e o de/para no histórico.
 *
 * O RBAC (só MASTER/SUPER_ADMIN corrige) vive no controller, com `@Roles`, mesmo mecanismo da troca
 * de cliente e da recusa; aqui se trava o resto.
 */

const ADM_ID = "adm-1";
const CPF_OK = "52998224725"; // dígito fecha
const CPF_NOVO_OK = "11144477735"; // dígito fecha
const CPF_RUIM = "52998224726"; // um dígito trocado: não fecha

const MASTER: AuthUser = {
  id: "user-master",
  email: "master@soulan.com.br",
  papel: "MASTER",
  senhaTemporaria: false,
};

const ADMISSAO = {
  id: ADM_ID,
  codCliente: "C-1",
  cargoId: "cargo-1",
  candidatoCpf: CPF_RUIM,
  farolGlobal: "EM_ADMISSAO",
  idVacancy: null as string | null,
  possivelDuplicata: false,
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/**
 * `duplicado` = candidato que JÁ tem o CPF novo (colisão). `restantes` = quantas admissões continuam
 * apontando para o CPF antigo depois da correção (0 = fantasma de digitação, que sai).
 */
function makeDb(
  opts: {
    admissao?: Record<string, unknown>;
    duplicado?: { nome: string } | null;
    restantes?: number;
    admissoesDoCpfNovo?: unknown[];
    vivaMesmaVaga?: boolean;
  } = {},
) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const deletes: unknown[] = [];
  const restantes = opts.restantes ?? 0;

  const select = vi.fn((cols?: Record<string, unknown>) => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    const linhas = () => {
      if (tabela !== admissoes) return [];
      // `count()` é a contagem de admissões que sobraram no CPF antigo.
      if (cols && "n" in cols) return [{ n: restantes }];
      // Consulta do índice parcial (candidato_cpf + id_vacancy vivo).
      if (cols && "id" in cols) return opts.vivaMesmaVaga ? [{ id: "adm-outra" }] : [];
      return opts.admissoesDoCpfNovo ?? [];
    };
    b.where = () => Promise.resolve(linhas());
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(linhas()).then(r);
    return b;
  });

  const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return { where: async () => undefined };
    },
    values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
      for (const x of Array.isArray(v) ? v : [v]) lista.push({ tabela, valores: x });
      const p = Promise.resolve(undefined);
      return Object.assign(p, { onConflictDoNothing: () => p });
    },
  });
  const tx = {
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    delete: vi.fn((t: unknown) => ({
      where: async () => {
        deletes.push(t);
      },
    })),
    select,
  };

  const candidatoPorCpf = vi.fn(({ where }: { where: unknown }) => {
    // O fake não interpreta o `eq`; alterna pela ordem das chamadas do serviço: 1ª = candidato
    // ANTERIOR (CPF atual), 2ª = candidato do CPF NOVO (a colisão).
    void where;
    const n = candidatoPorCpf.mock.calls.length;
    if (n === 1) return Promise.resolve({ cpf: ADMISSAO.candidatoCpf, nome: "Fulano Da Silva" });
    return Promise.resolve(opts.duplicado ?? undefined);
  });

  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      admissoes: {
        findFirst: vi.fn().mockResolvedValue({ ...ADMISSAO, ...(opts.admissao ?? {}) }),
      },
      candidatos: { findFirst: candidatoPorCpf },
    },
  };
  return { db, updates, inserts, deletes };
}

afterEach(() => vi.restoreAllMocks());

describe("liberar (item 9, Frente A)", () => {
  /** Fake mínimo: a trava do CPF roda logo após o farol, antes de tocar cliente, cargo ou régua. */
  function dbLiberacao(cpf: string) {
    const transacoes = { n: 0 };
    return {
      transacoes,
      db: {
        query: {
          admissoes: {
            findFirst: vi.fn().mockResolvedValue({
              id: ADM_ID,
              candidatoCpf: cpf,
              farolGlobal: "AGUARDANDO_LIBERACAO",
              isBanco: false,
              possivelDuplicata: false,
            }),
          },
          clientes: { findFirst: vi.fn().mockResolvedValue({ codCliente: "100" }) },
          cargos: { findFirst: vi.fn().mockResolvedValue({ id: "cargo-1" }) },
          candidatos: { findFirst: vi.fn().mockResolvedValue({ nome: "Fulano", cpf }) },
          beneficiosCatalogo: { findMany: vi.fn().mockResolvedValue([]) },
        },
        select: vi.fn(selectFake([])),
        transaction: async () => {
          transacoes.n += 1;
          return { admissaoId: ADM_ID, temRegua: false };
        },
      },
    };
  }

  // A resposta do UNIFORME passou a ser obrigatória na liberação individual (OST Onda 3, item 1):
  // sem ela a chamada morreria na trava do uniforme, antes de exercitar a trava do CPF.
  const DTO = { codCliente: "100", cargoId: "cargo-1", uniforme: { possui: false } };

  it("BLOQUEIA a liberação individual quando o dígito verificador não fecha", async () => {
    const { db, transacoes } = dbLiberacao(CPF_RUIM);
    const svc = new AdmissoesService(db as never);

    const err = await svc.liberar(ADM_ID, DTO, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("dígito verificador");
    // A admissão NÃO nasce: a trava roda antes de qualquer escrita.
    expect(transacoes.n).toBe(0);
  });

  it("CPF válido passa pela trava e a liberação segue", async () => {
    const { db, transacoes } = dbLiberacao(CPF_OK);
    const svc = new AdmissoesService(db as never);

    await svc.liberar(ADM_ID, DTO, MASTER);

    expect(transacoes.n).toBe(1);
  });
});

describe("corrigirCpf (item 9, Frente B)", () => {
  it("recusa CPF novo com dígito verificador que não fecha", async () => {
    const { db, updates } = makeDb();
    const svc = new AdmissoesService(db as never);

    const err = await svc
      .corrigirCpf(ADM_ID, { cpf: "11144477700" }, MASTER)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("dígito verificador");
    // Não troca um errado por outro inválido: nada é escrito.
    expect(updates).toEqual([]);
  });

  it("aceita CPF válido, reaponta a admissão e registra o de/para no histórico", async () => {
    const { db, updates, inserts } = makeDb();
    const svc = new AdmissoesService(db as never);

    const r = await svc.corrigirCpf(ADM_ID, { cpf: "111.444.777-35" }, MASTER);

    expect(r).toMatchObject({ ok: true, cpfAnterior: CPF_RUIM, cpfNovo: CPF_NOVO_OK });
    const troca = updates.find((u) => u.tabela === admissoes);
    expect(troca?.valores).toMatchObject({ candidatoCpf: CPF_NOVO_OK });
    // Linha nova do candidato herda os dados: só o CPF estava errado.
    const novoCandidato = inserts.find((i) => i.tabela === candidatos);
    expect(novoCandidato?.valores).toMatchObject({ cpf: CPF_NOVO_OK, nome: "Fulano Da Silva" });
    const log = inserts.find((i) => i.tabela === candidatoAlteracoesLog);
    expect(log?.valores).toMatchObject({
      campo: "correcaoCpf",
      valorAnterior: CPF_RUIM,
      valorNovo: CPF_NOVO_OK,
      autorId: MASTER.id,
    });
  });

  it("apaga o CPF antigo quando ele fica sem NENHUMA admissão (§A.6)", async () => {
    const { db, deletes } = makeDb({ restantes: 0 });
    const svc = new AdmissoesService(db as never);

    await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER);

    expect(deletes).toEqual([candidatos]);
  });

  it("PRESERVA o CPF antigo quando outra admissão ainda o usa", async () => {
    const { db, deletes } = makeDb({ restantes: 2 });
    const svc = new AdmissoesService(db as never);

    await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER);

    expect(deletes).toEqual([]);
  });

  it("AVISA a colisão com o NOME de quem já tem o CPF, sem aplicar nada", async () => {
    const { db, updates } = makeDb({
      duplicado: { nome: "Beltrano De Souza" },
      admissoesDoCpfNovo: [{ admissaoId: "adm-9", farol: "EM_ADMISSAO" }],
    });
    const svc = new AdmissoesService(db as never);

    const err = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    const corpo = (err as ConflictException).getResponse() as Record<string, unknown>;
    expect(corpo.codigo).toBe("CPF_DUPLICADO");
    expect(corpo.nomeDuplicado).toBe("Beltrano De Souza");
    expect(String(corpo.message)).toContain("Beltrano De Souza");
    // AVISA, não bloqueia por conta própria: o Master decide, então nada é escrito ainda.
    expect(updates).toEqual([]);
  });

  it("com `confirmarDuplicado`, aplica e NÃO sobrescreve o candidato existente", async () => {
    const { db, updates, inserts } = makeDb({ duplicado: { nome: "Beltrano De Souza" } });
    const svc = new AdmissoesService(db as never);

    const r = await svc.corrigirCpf(
      ADM_ID,
      { cpf: CPF_NOVO_OK, confirmarDuplicado: true },
      MASTER,
    );

    expect(r.duplicadoConfirmado).toEqual({ nome: "Beltrano De Souza" });
    expect(updates.find((u) => u.tabela === admissoes)?.valores).toMatchObject({
      candidatoCpf: CPF_NOVO_OK,
    });
    // O candidato do CPF novo JÁ existe: não é recriado nem tem o nome regravado.
    expect(inserts.filter((i) => i.tabela === candidatos)).toEqual([]);
  });

  it("recusa corrigir para o MESMO CPF (não polui o histórico com evento vazio)", async () => {
    const { db } = makeDb({ admissao: { candidatoCpf: CPF_OK } });
    const svc = new AdmissoesService(db as never);

    await expect(svc.corrigirCpf(ADM_ID, { cpf: CPF_OK }, MASTER)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("barra quando o CPF novo já tem admissão VIVA na mesma vaga do Pandapé", async () => {
    // O índice parcial `uq_admissao_cpf_vaga_viva` estouraria no banco; a checagem antecipada
    // transforma isso em mensagem legível.
    const { db, updates } = makeDb({ admissao: { idVacancy: "vaga-1" }, vivaMesmaVaga: true });
    const svc = new AdmissoesService(db as never);

    const err = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(String((err as Error).message)).toContain("MESMA vaga");
    expect(updates).toEqual([]);
  });

  it("corrige em QUALQUER estado: não há trava de fase (decisão do diretor)", async () => {
    const { db, updates } = makeDb({ admissao: { farolGlobal: "ADMISSAO_CONCLUIDA" } });
    const svc = new AdmissoesService(db as never);

    await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER);

    expect(updates.find((u) => u.tabela === admissoes)?.valores).toMatchObject({
      candidatoCpf: CPF_NOVO_OK,
    });
  });

  it("admissão inexistente é 404", async () => {
    const { db } = makeDb();
    db.query.admissoes.findFirst = vi.fn().mockResolvedValue(undefined);
    const svc = new AdmissoesService(db as never);

    await expect(svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
