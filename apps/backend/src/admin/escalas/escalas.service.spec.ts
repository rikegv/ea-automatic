import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { EscalasService } from "./escalas.service";

/**
 * Catálogo de ESCALAS (OST produção, Bloco 4). O que estes testes travam:
 *  - INATIVAR é exclusão LÓGICA (`ativo=false`), nunca `delete`. É a garantia de que a escala já
 *    escolhida numa admissão não é arrancada do histórico;
 *  - colisão de nome vira 409 com mensagem útil, inclusive o caso da escala INATIVA de mesmo nome,
 *    onde a ação certa é reativar e não criar outra.
 */

interface DbFake {
  linhas: Array<{ id: string; nome: string; ativo: boolean }>;
  ultimoSet?: Record<string, unknown>;
  deleteChamado: boolean;
}

function makeDb(linhas: DbFake["linhas"] = []) {
  const estado: DbFake = { linhas, deleteChamado: false };
  const db = {
    select: () => ({ from: () => ({ orderBy: () => Promise.resolve(estado.linhas) }) }),
    insert: () => ({
      values: (v: { nome: string }) => ({
        returning: () => Promise.resolve([{ id: "nova", nome: v.nome, ativo: true }]),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        estado.ultimoSet = v;
        return {
          where: () => ({
            returning: () => Promise.resolve(estado.linhas.length ? [estado.linhas[0]] : []),
          }),
        };
      },
    }),
    // Presente de propósito: se algum dia alguém trocar a inativação por exclusão física, o teste
    // que checa `deleteChamado` pega.
    delete: () => {
      estado.deleteChamado = true;
      return { where: () => ({ returning: () => Promise.resolve([]) }) };
    },
    query: {
      escalasCatalogo: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
  return { db, estado };
}

describe("EscalasService", () => {
  it("lista o catálogo inteiro (a tela de administração é quem filtra)", async () => {
    const { db } = makeDb([{ id: "1", nome: "12x36", ativo: true }]);
    const svc = new EscalasService(db as never);
    await expect(svc.list()).resolves.toHaveLength(1);
  });

  it("cria aparando espaço nas pontas", async () => {
    const { db } = makeDb();
    const svc = new EscalasService(db as never);
    const r = await svc.create({ nome: "  12x36  " });
    expect(r).toMatchObject({ nome: "12x36", ativo: true });
  });

  it("nome repetido em escala ATIVA vira 409", async () => {
    const { db } = makeDb();
    db.query.escalasCatalogo.findFirst.mockResolvedValue({ id: "1", nome: "12x36", ativo: true });
    const svc = new EscalasService(db as never);
    await expect(svc.create({ nome: "12x36" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("nome repetido em escala INATIVA orienta a REATIVAR em vez de criar outra", async () => {
    const { db } = makeDb();
    db.query.escalasCatalogo.findFirst.mockResolvedValue({ id: "1", nome: "12x36", ativo: false });
    const svc = new EscalasService(db as never);
    await expect(svc.create({ nome: "12x36" })).rejects.toThrow(/[Rr]eative/);
  });

  it("renomear para nome de OUTRA escala vira 409", async () => {
    const { db } = makeDb([{ id: "1", nome: "12x36", ativo: true }]);
    db.query.escalasCatalogo.findFirst.mockResolvedValue({ id: "2", nome: "5x2", ativo: true });
    const svc = new EscalasService(db as never);
    await expect(svc.update("1", { nome: "5x2" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("INATIVAR é exclusão lógica: seta ativo=false e NÃO chama delete", async () => {
    const { db, estado } = makeDb([{ id: "1", nome: "12x36", ativo: true }]);
    const svc = new EscalasService(db as never);
    await expect(svc.inativar("1")).resolves.toEqual({ ok: true, ativo: false });
    expect(estado.ultimoSet).toEqual({ ativo: false });
    expect(estado.deleteChamado).toBe(false);
  });

  it("reativar devolve a escala às opções selecionáveis", async () => {
    const { db, estado } = makeDb([{ id: "1", nome: "12x36", ativo: false }]);
    const svc = new EscalasService(db as never);
    await expect(svc.reativar("1")).resolves.toEqual({ ok: true, ativo: true });
    expect(estado.ultimoSet).toEqual({ ativo: true });
  });

  it("id inexistente vira 404 em vez de sucesso silencioso", async () => {
    const { db } = makeDb([]);
    const svc = new EscalasService(db as never);
    await expect(svc.inativar("nao-existe")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reativar("nao-existe")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update("nao-existe", { nome: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });
});
