import { BadRequestException, ConflictException } from "@nestjs/common";
import * as argon2 from "argon2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersService } from "./users.service";

/**
 * Gestão de usuários (OST-EA-GESTAO-USUARIOS). Mocka o Drizzle com chains encadeáveis; usa argon2
 * REAL para provar que a senha temporária retornada casa com o hash gravado (nunca o inverso).
 */
type UpdateCapture = { set?: Record<string, unknown> };

function makeDb() {
  const capturas: {
    insertValues?: Record<string, unknown>;
    update: UpdateCapture;
  } = { update: {} };
  const findFirst = vi.fn();
  let insertRow: Record<string, unknown> = {};
  let updateRow: Record<string, unknown> = {};
  let selectRows: Record<string, unknown>[] = [];

  const db = {
    query: { usuarios: { findFirst } },
    select: vi.fn(() => ({ from: () => ({ orderBy: async () => selectRows }) })),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        capturas.insertValues = v;
        return { returning: async () => [insertRow] };
      },
    })),
    update: vi.fn(() => ({
      set: (patch: Record<string, unknown>) => {
        capturas.update.set = patch;
        const p: Promise<undefined> & { returning?: () => Promise<unknown[]> } =
          Promise.resolve(undefined);
        return {
          where: () => {
            p.returning = async () => [updateRow];
            return p;
          },
        };
      },
    })),
  };

  return {
    db,
    findFirst,
    capturas,
    setInsertRow: (r: Record<string, unknown>) => (insertRow = r),
    setUpdateRow: (r: Record<string, unknown>) => (updateRow = r),
    setSelectRows: (r: Record<string, unknown>[]) => (selectRows = r),
  };
}

const ROW = {
  id: "u-1",
  nome: "Fulano",
  email: "fulano@ea.local",
  papel: "COMUM" as const,
  ativo: true,
  criadoEm: new Date("2026-01-01T00:00:00.000Z"),
};

describe("UsersService (OST — gestão de usuários)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("criar: gera senhaTemporaria=true, retorna senha em claro que casa com o hash argon2", async () => {
    const h = makeDb();
    h.findFirst.mockResolvedValue(undefined); // e-mail livre
    h.setInsertRow(ROW);
    const svc = new UsersService(h.db as never);

    const r = await svc.criar({ nome: "Fulano", email: "Fulano@EA.local", papel: "COMUM" });

    expect(r.senhaTemporaria.length).toBeGreaterThanOrEqual(12);
    expect(h.capturas.insertValues?.senhaTemporaria).toBe(true);
    expect(h.capturas.insertValues?.email).toBe("fulano@ea.local"); // normalizado
    // O hash gravado corresponde à senha retornada — e a senha NÃO é o hash.
    const hash = h.capturas.insertValues?.senhaHash as string;
    expect(hash).not.toBe(r.senhaTemporaria);
    await expect(argon2.verify(hash, r.senhaTemporaria)).resolves.toBe(true);
    // Nunca vaza senhaHash na resposta.
    expect(r.usuario).not.toHaveProperty("senhaHash");
  });

  it("criar: e-mail duplicado → 409", async () => {
    const h = makeDb();
    h.findFirst.mockResolvedValue({ id: "outro" });
    const svc = new UsersService(h.db as never);
    await expect(
      svc.criar({ nome: "X", email: "dup@ea.local", papel: "MASTER" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("listar: projeta só campos públicos (nunca senhaHash)", async () => {
    const h = makeDb();
    h.setSelectRows([{ ...ROW, senhaHash: "NAO_DEVE_VAZAR" }]);
    const svc = new UsersService(h.db as never);
    const lista = await svc.listar();
    expect(lista).toHaveLength(1);
    expect(lista[0]).not.toHaveProperty("senhaHash");
    expect(lista[0].criadoEm).toBe("2026-01-01T00:00:00.000Z");
  });

  it("resetarSenha: nova senha temporária, seta flag=true, retorna senha em claro (hash casa)", async () => {
    const h = makeDb();
    h.findFirst.mockResolvedValue(ROW);
    const svc = new UsersService(h.db as never);
    const r = await svc.resetarSenha("u-1");
    expect(r.senhaTemporaria.length).toBeGreaterThanOrEqual(12);
    expect(h.capturas.update.set?.senhaTemporaria).toBe(true);
    const hash = h.capturas.update.set?.senhaHash as string;
    await expect(argon2.verify(hash, r.senhaTemporaria)).resolves.toBe(true);
    expect(r).not.toHaveProperty("senhaHash");
  });

  it("atualizar: bloqueia auto-desativação (ativo:false no próprio id → 400)", async () => {
    const h = makeDb();
    h.findFirst.mockResolvedValue(ROW);
    const svc = new UsersService(h.db as never);
    await expect(svc.atualizar("u-1", { ativo: false }, "u-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("atualizar: permite desativar OUTRO usuário (soft-delete, nunca remove)", async () => {
    const h = makeDb();
    h.findFirst.mockResolvedValue(ROW);
    h.setUpdateRow({ ...ROW, ativo: false });
    const svc = new UsersService(h.db as never);
    const r = await svc.atualizar("u-1", { ativo: false }, "admin-9");
    expect(h.capturas.update.set?.ativo).toBe(false);
    expect(r.ativo).toBe(false);
  });

  it("atualizar: e-mail já usado por outro → 409", async () => {
    const h = makeDb();
    // 1ª chamada (findById alvo) devolve o alvo; 2ª (findByEmail) devolve outro usuário.
    h.findFirst
      .mockResolvedValueOnce(ROW)
      .mockResolvedValueOnce({ id: "outro", email: "ja@ea.local" });
    const svc = new UsersService(h.db as never);
    await expect(svc.atualizar("u-1", { email: "ja@ea.local" }, "admin-9")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("trocarSenha: senha atual correta → grava hash novo e limpa a flag", async () => {
    const h = makeDb();
    const senhaAtual = "SenhaAtual123";
    const hashAtual = await argon2.hash(senhaAtual);
    h.findFirst.mockResolvedValue({ ...ROW, senhaHash: hashAtual });
    const svc = new UsersService(h.db as never);
    await svc.trocarSenha("u-1", senhaAtual, "NovaSenha456");
    expect(h.capturas.update.set?.senhaTemporaria).toBe(false);
    await expect(
      argon2.verify(h.capturas.update.set?.senhaHash as string, "NovaSenha456"),
    ).resolves.toBe(true);
  });

  it("trocarSenha: senha atual incorreta → 400", async () => {
    const h = makeDb();
    const hashAtual = await argon2.hash("certa");
    h.findFirst.mockResolvedValue({ ...ROW, senhaHash: hashAtual });
    const svc = new UsersService(h.db as never);
    await expect(svc.trocarSenha("u-1", "errada", "NovaSenha456")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("trocarSenha: nova igual à atual → 400", async () => {
    const h = makeDb();
    const hashAtual = await argon2.hash("mesma123");
    h.findFirst.mockResolvedValue({ ...ROW, senhaHash: hashAtual });
    const svc = new UsersService(h.db as never);
    await expect(svc.trocarSenha("u-1", "mesma123", "mesma123")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
