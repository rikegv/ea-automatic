import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import { admissoes } from "../db/schema";
import type { AuthUser } from "../auth/auth.types";

/**
 * FRENTE 3 — CORRIGIR CPF NA PRÓPRIA LIBERAÇÃO.
 *
 * Esta suíte é INDEPENDENTE do autor (§A.38): exercita o gate NOVO de `corrigirCpf`, o de PAPEL por
 * FASE, e a duplicidade por papel. O harness é o mesmo da suíte Frente A/B, reduzido ao mínimo para
 * este gate: a admissão alvo, o candidato anterior, e um possível colidido.
 *
 * Regras sob teste:
 *  - CONSULTOR (COMUM) corrige SÓ em `AGUARDANDO_LIBERACAO`; fora disso, `ForbiddenException`.
 *  - CONSULTOR + colisão: BLOQUEIA com `codigo: "CPF_EM_USO"` e SEM nome (§A.6).
 *  - MASTER mantém o comportamento de sempre em qualquer fase (colisão avisa com nome e pode forçar).
 *  - SISTEMA (`user` nulo) passa sem gate de fase.
 */

const ADM_ID = "adm-1";
const CPF_ATUAL = "52998224726"; // um dígito trocado: não fecha (serve de "errado" atual)
const CPF_NOVO_OK = "11144477735"; // dígito fecha
const CPF_NOVO_RUIM = "11144477700"; // dígito não fecha

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
const MASTER: AuthUser = {
  id: "user-master",
  email: "master@soulan.com.br",
  papel: "MASTER",
  senhaTemporaria: false,
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function makeDb(
  opts: {
    farol?: string;
    duplicado?: { nome: string } | null;
  } = {},
) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn((cols?: Record<string, unknown>) => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    const linhas = () => {
      if (tabela !== admissoes) return [];
      if (cols && "n" in cols) return [{ n: 0 }]; // sem admissões restantes no CPF antigo
      if (cols && "id" in cols) return []; // nenhuma viva na mesma vaga
      return []; // nenhuma outra admissão no CPF novo
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
    delete: vi.fn(() => ({ where: async () => undefined })),
    select,
  };

  const candidatoPorCpf = vi.fn(() => {
    const n = candidatoPorCpf.mock.calls.length;
    if (n === 1) return Promise.resolve({ cpf: CPF_ATUAL, nome: "Fulano Da Silva" });
    return Promise.resolve(opts.duplicado ?? undefined);
  });

  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      admissoes: {
        findFirst: vi.fn().mockResolvedValue({
          id: ADM_ID,
          codCliente: "C-1",
          cargoId: "cargo-1",
          candidatoCpf: CPF_ATUAL,
          farolGlobal: opts.farol ?? "AGUARDANDO_LIBERACAO",
          idVacancy: null,
        }),
      },
      candidatos: { findFirst: candidatoPorCpf },
    },
  };
  return { db, updates, inserts };
}

afterEach(() => vi.restoreAllMocks());

describe("corrigirCpf — gate de papel por fase (Frente 3)", () => {
  it("CONSULTOR corrige na fila de liberação (AGUARDANDO_LIBERACAO)", async () => {
    const { db, updates } = makeDb({ farol: "AGUARDANDO_LIBERACAO" });
    const svc = new AdmissoesService(db as never);

    const r = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, COMUM);

    expect(r.ok).toBe(true);
    // A admissão foi reapontada para o CPF novo.
    const reaponta = updates.find(
      (u) => u.tabela === admissoes && u.valores.candidatoCpf === CPF_NOVO_OK,
    );
    expect(reaponta).toBeTruthy();
  });

  it("CONSULTOR é BLOQUEADO depois da liberação (farol fora de AGUARDANDO_LIBERACAO)", async () => {
    const { db, updates } = makeDb({ farol: "EM_ADMISSAO" });
    const svc = new AdmissoesService(db as never);

    const err = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, COMUM).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    // Nada foi escrito: o gate roda antes de qualquer alteração.
    expect(updates.length).toBe(0);
  });

  it("CONSULTOR com dígito que não fecha é recusado, sem escrever", async () => {
    const { db, updates } = makeDb({ farol: "AGUARDANDO_LIBERACAO" });
    const svc = new AdmissoesService(db as never);

    const err = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_RUIM }, COMUM).catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("dígito verificador");
    expect(updates.length).toBe(0);
  });

  it("CONSULTOR com CPF duplicado: BLOQUEIA com CPF_EM_USO e SEM expor o nome (§A.6)", async () => {
    const { db, updates } = makeDb({
      farol: "AGUARDANDO_LIBERACAO",
      duplicado: { nome: "Beltrano De Tal" },
    });
    const svc = new AdmissoesService(db as never);

    const err = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, COMUM).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    const corpo = (err as ConflictException).getResponse() as Record<string, unknown>;
    expect(corpo.codigo).toBe("CPF_EM_USO");
    // O nome do duplicado NUNCA chega ao consultor.
    expect(JSON.stringify(corpo)).not.toContain("Beltrano");
    expect(corpo.nomeDuplicado).toBeUndefined();
    expect(updates.length).toBe(0);
  });

  it("MASTER continua corrigindo depois da liberação (comportamento de sempre)", async () => {
    const { db, updates } = makeDb({ farol: "EM_ADMISSAO" });
    const svc = new AdmissoesService(db as never);

    const r = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER);

    expect(r.ok).toBe(true);
    expect(
      updates.find((u) => u.tabela === admissoes && u.valores.candidatoCpf === CPF_NOVO_OK),
    ).toBeTruthy();
  });

  it("MASTER com colisão AVISA com o nome e pode forçar (CPF_DUPLICADO, inalterado)", async () => {
    const { db } = makeDb({ farol: "EM_ADMISSAO", duplicado: { nome: "Beltrano De Tal" } });
    const svc = new AdmissoesService(db as never);

    const err = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    const corpo = (err as ConflictException).getResponse() as Record<string, unknown>;
    expect(corpo.codigo).toBe("CPF_DUPLICADO");
    expect(corpo.nomeDuplicado).toBe("Beltrano De Tal");
  });

  it("SISTEMA (user nulo) não passa pelo gate de fase: corrige fora de AGUARDANDO_LIBERACAO", async () => {
    const { db, updates } = makeDb({ farol: "EM_ADMISSAO" });
    const svc = new AdmissoesService(db as never);

    const r = await svc.corrigirCpf(ADM_ID, { cpf: CPF_NOVO_OK }, null);

    expect(r.ok).toBe(true);
    expect(
      updates.find((u) => u.tabela === admissoes && u.valores.candidatoCpf === CPF_NOVO_OK),
    ).toBeTruthy();
  });
});
