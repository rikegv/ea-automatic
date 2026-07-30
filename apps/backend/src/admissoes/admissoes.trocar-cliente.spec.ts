import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import {
  admissoes,
  candidatoAlteracoesLog,
  cargos,
  clientes,
  frentesAdmissao,
  reguaDocumental,
} from "../db/schema";
import type { AuthUser } from "../auth/auth.types";

/**
 * TROCA DE CLIENTE E CARGO (OST da correção do cliente errado).
 *
 * As duas travas e a trilha são o que estes testes protegem. O RBAC (só MASTER) vive no controller,
 * com `@Roles`, e é o mesmo mecanismo já usado pela rota de recusa; aqui se trava o resto: não trocar
 * depois de concluído, limpar o ponteiro do cliente antigo e registrar o que aconteceu.
 */

const ADM_ID = "adm-1";
const MASTER: AuthUser = {
  id: "user-master",
  email: "master@soulan.com.br",
  papel: "MASTER",
  senhaTemporaria: false,
};

const ADMISSAO = {
  id: ADM_ID,
  codCliente: "C-VELHO",
  cargoId: "cargo-velho",
  candidatoCpf: "52998224725",
  dataAdmissao: "2026-08-01",
  tipoContrato: "Temporário",
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/** `frentes` diz quais estão concluídas; o resto do fake é o mínimo para o método rodar. */
function makeDb(
  frentes: { tipo: string; concluida: boolean }[],
  opts: { temRegua?: boolean } = {},
) {
  const temRegua = opts.temRegua !== false;
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    const linhas = () => {
      if (tabela === frentesAdmissao) return frentes;
      if (tabela === clientes) return [{ codCliente: "C-NOVO", razaoSocial: "CLIENTE NOVO LTDA" }];
      if (tabela === cargos) return [{ id: "cargo-novo", nome: "Auxiliar de Produção" }];
      // Régua documental do par NOVO: `n = 0` significa par sem régua, que a troca barra.
      if (tabela === reguaDocumental) return [{ n: temRegua ? 12 : 0 }];
      return [];
    };
    b.where = () => Promise.resolve(linhas());
    b.innerJoin = () => b;
    b.leftJoin = () => b;
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
      return Promise.resolve(undefined);
    },
  });
  const tx = { update: vi.fn(registrar(updates)), insert: vi.fn(registrar(inserts)) };

  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      admissoes: { findFirst: vi.fn().mockResolvedValue(ADMISSAO) },
      candidatos: { findFirst: vi.fn().mockResolvedValue({ nome: "Fulano", cpf: ADMISSAO.candidatoCpf }) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000.00" }) },
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
  };
  return { db, updates, inserts };
}

const EM_ANDAMENTO = [
  { tipo: "AUDITORIA", concluida: true },
  { tipo: "EXAME", concluida: false },
];
const TODAS_CONCLUIDAS = [
  { tipo: "AUDITORIA", concluida: true },
  { tipo: "EXAME", concluida: true },
  { tipo: "CADASTRO_CONTRATO", concluida: true },
];

const novo = { codCliente: "C-NOVO", cargoId: "cargo-novo" };

afterEach(() => vi.restoreAllMocks());

describe("trocarCliente", () => {
  it("troca o par e LIMPA o ponteiro do cliente antigo", async () => {
    const { db, updates } = makeDb(EM_ANDAMENTO);
    const svc = new AdmissoesService(db as never);

    const r = await svc.trocarCliente(ADM_ID, novo, MASTER);

    expect(r.cliente.codCliente).toBe("C-NOVO");
    expect(r.cargo.nome).toBe("Auxiliar de Produção");
    const troca = updates.find((u) => u.tabela === admissoes && u.valores.codCliente);
    expect(troca?.valores).toMatchObject({
      codCliente: "C-NOVO",
      cargoId: "cargo-novo",
      // O ponteiro para o vínculo do cliente ANTIGO não pode sobreviver à troca.
      clienteVinculoId: null,
      trocaClientePor: MASTER.id,
    });
    expect(troca?.valores.trocaClienteEm).toBeInstanceOf(Date);
  });

  it("registra os DOIS eventos no histórico, com o de/para legível", async () => {
    const { db, inserts } = makeDb(EM_ANDAMENTO);
    const svc = new AdmissoesService(db as never);

    await svc.trocarCliente(ADM_ID, novo, MASTER);

    const log = inserts.filter((i) => i.tabela === candidatoAlteracoesLog);
    const cliente = log.find((l) => l.valores.campo === "trocaCliente");
    const cargo = log.find((l) => l.valores.campo === "trocaCargo");
    expect(cliente?.valores.valorNovo).toContain("CLIENTE NOVO LTDA");
    expect(cliente?.valores.autorId).toBe(MASTER.id);
    expect(cargo?.valores.valorNovo).toBe("Auxiliar de Produção");
  });

  it("NÃO troca quando as três frentes já concluíram", async () => {
    const { db, updates } = makeDb(TODAS_CONCLUIDAS);
    const svc = new AdmissoesService(db as never);

    await expect(svc.trocarCliente(ADM_ID, novo, MASTER)).rejects.toBeInstanceOf(ConflictException);
    // E não escreve nada: a trava barra ANTES de tocar a admissão.
    expect(updates.filter((u) => u.tabela === admissoes)).toEqual([]);
  });

  it("recusa trocar para o MESMO par (não gera evento vazio no histórico)", async () => {
    const { db } = makeDb(EM_ANDAMENTO);
    db.query.admissoes.findFirst = vi
      .fn()
      .mockResolvedValue({ ...ADMISSAO, codCliente: "C-NOVO", cargoId: "cargo-novo" });
    const svc = new AdmissoesService(db as never);

    await expect(svc.trocarCliente(ADM_ID, novo, MASTER)).rejects.toBeInstanceOf(ConflictException);
  });

  it("BLOQUEIA a troca para par SEM régua documental, dizendo QUAL par", async () => {
    // Sem esta trava a admissão ficaria com checklist VAZIO, e o problema só apareceria depois,
    // quando alguém notasse que a auditoria não cobra documento nenhum. Aconteceu em produção.
    const { db, updates } = makeDb(EM_ANDAMENTO, { temRegua: false });
    const svc = new AdmissoesService(db as never);

    const err = await svc.trocarCliente(ADM_ID, novo, MASTER).catch((e: ConflictException) => e);

    expect(err).toBeInstanceOf(ConflictException);
    const msg = String((err as ConflictException).message);
    expect(msg).toContain("C-NOVO");
    expect(msg).toContain("CLIENTE NOVO LTDA");
    expect(msg).toContain("Auxiliar de Produção");
    expect(msg).toContain("régua documental");
    // Não aplica NADA: a trava roda antes de tocar a admissão.
    expect(updates.filter((u) => u.tabela === admissoes)).toEqual([]);
  });

  it("admissão inexistente é 404", async () => {
    const { db } = makeDb(EM_ANDAMENTO);
    db.query.admissoes.findFirst = vi.fn().mockResolvedValue(undefined);
    const svc = new AdmissoesService(db as never);

    await expect(svc.trocarCliente(ADM_ID, novo, MASTER)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("marcarTrocaRevisada", () => {
  it("limpa o carimbo e registra QUEM revisou", async () => {
    const { db, updates, inserts } = makeDb(EM_ANDAMENTO);
    db.query.admissoes.findFirst = vi
      .fn()
      .mockResolvedValue({ ...ADMISSAO, trocaClienteEm: new Date() });
    const svc = new AdmissoesService(db as never);

    const r = await svc.marcarTrocaRevisada(ADM_ID, MASTER);

    expect(r.ok).toBe(true);
    const limpeza = updates.find((u) => u.tabela === admissoes);
    expect(limpeza?.valores).toMatchObject({ trocaClienteEm: null, trocaClientePor: null });
    const log = inserts.find((i) => i.valores.campo === "trocaClienteRevisada");
    expect(log?.valores.autorId).toBe(MASTER.id);
  });

  it("sem troca pendente, não faz nada e não polui o histórico", async () => {
    const { db, updates, inserts } = makeDb(EM_ANDAMENTO);
    const svc = new AdmissoesService(db as never);

    const r = await svc.marcarTrocaRevisada(ADM_ID, MASTER);

    expect(r).toMatchObject({ ok: true, jaRevisada: true });
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });
});
