import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BeneficiosService } from "./beneficios.service";

/**
 * Catálogo de BENEFÍCIOS (OST cadastro de benefícios por tela). O que estes testes travam:
 *  - INATIVAR é exclusão LÓGICA (`ativo=false`), nunca `delete`. É a garantia de que o benefício já
 *    alocado numa admissão não é arrancado do histórico (a FK é RESTRICT justamente por isso);
 *  - colisão de nome vira 409 com mensagem útil, inclusive o caso do benefício INATIVO de mesmo
 *    nome, onde a ação certa é reativar e não criar outro;
 *  - `exigeValor` é CAMPO DO CADASTRO: nasce false por omissão, é gravado na criação e é editável na
 *    atualização. É o ponto da OST, então tem teste próprio.
 */

interface Linha {
  id: string;
  nome: string;
  ativo: boolean;
  exigeValor: boolean;
}

interface DbFake {
  linhas: Linha[];
  ultimoSet?: Record<string, unknown>;
  ultimoInsert?: Record<string, unknown>;
  deleteChamado: boolean;
}

function makeDb(linhas: Linha[] = []) {
  const estado: DbFake = { linhas, deleteChamado: false };
  const db = {
    select: () => ({ from: () => ({ orderBy: () => Promise.resolve(estado.linhas) }) }),
    insert: () => ({
      values: (v: { nome: string; exigeValor?: boolean }) => {
        estado.ultimoInsert = v;
        return {
          returning: () =>
            Promise.resolve([
              { id: "novo", nome: v.nome, ativo: true, exigeValor: v.exigeValor ?? false },
            ]),
        };
      },
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
      beneficiosCatalogo: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
  return { db, estado };
}

const VR: Linha = { id: "1", nome: "VR (Vale-Refeição)", ativo: true, exigeValor: true };

describe("BeneficiosService", () => {
  it("lista o catálogo inteiro (a tela de administração é quem filtra)", async () => {
    const { db } = makeDb([VR]);
    const svc = new BeneficiosService(db as never);
    await expect(svc.list()).resolves.toHaveLength(1);
  });

  it("cria aparando espaço nas pontas", async () => {
    const { db } = makeDb();
    const svc = new BeneficiosService(db as never);
    const r = await svc.create({ nome: "  Auxílio home office  " });
    expect(r).toMatchObject({ nome: "Auxílio home office", ativo: true });
  });

  it("nome repetido em benefício ATIVO vira 409", async () => {
    const { db } = makeDb();
    db.query.beneficiosCatalogo.findFirst.mockResolvedValue(VR);
    const svc = new BeneficiosService(db as never);
    await expect(svc.create({ nome: "VR (Vale-Refeição)" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("nome repetido em benefício INATIVO orienta a REATIVAR em vez de criar outro", async () => {
    const { db } = makeDb();
    db.query.beneficiosCatalogo.findFirst.mockResolvedValue({ ...VR, ativo: false });
    const svc = new BeneficiosService(db as never);
    await expect(svc.create({ nome: "VR (Vale-Refeição)" })).rejects.toThrow(/[Rr]eative/);
  });

  it("renomear para nome de OUTRO benefício vira 409", async () => {
    const { db } = makeDb([VR]);
    db.query.beneficiosCatalogo.findFirst.mockResolvedValue({ ...VR, id: "2", nome: "VA" });
    const svc = new BeneficiosService(db as never);
    await expect(svc.update("1", { nome: "VA" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("INATIVAR é exclusão lógica: seta ativo=false e NÃO chama delete", async () => {
    const { db, estado } = makeDb([VR]);
    const svc = new BeneficiosService(db as never);
    await expect(svc.inativar("1")).resolves.toEqual({ ok: true, ativo: false });
    expect(estado.ultimoSet).toEqual({ ativo: false });
    expect(estado.deleteChamado).toBe(false);
  });

  it("reativar devolve o benefício às opções selecionáveis", async () => {
    const { db, estado } = makeDb([{ ...VR, ativo: false }]);
    const svc = new BeneficiosService(db as never);
    await expect(svc.reativar("1")).resolves.toEqual({ ok: true, ativo: true });
    expect(estado.ultimoSet).toEqual({ ativo: true });
  });

  it("id inexistente vira 404 em vez de sucesso silencioso", async () => {
    const { db } = makeDb([]);
    const svc = new BeneficiosService(db as never);
    await expect(svc.inativar("nao-existe")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reativar("nao-existe")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update("nao-existe", { nome: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── `exigeValor`: o ponto da OST ────────────────────────────────────────────
  describe("exigeValor é campo do CADASTRO, não dedução do nome", () => {
    it("omitido na criação nasce false (mesmo default da coluna)", async () => {
      const { db, estado } = makeDb();
      const svc = new BeneficiosService(db as never);
      await expect(svc.create({ nome: "Seguro de vida" })).resolves.toMatchObject({
        exigeValor: false,
      });
      expect(estado.ultimoInsert).toEqual({ nome: "Seguro de vida", exigeValor: false });
    });

    it("criar COM exigeValor grava true, mesmo num nome que a régua antiga não reconheceria", async () => {
      const { db, estado } = makeDb();
      const svc = new BeneficiosService(db as never);
      // "Auxílio home office" não casa com nenhuma chave de BENEFICIOS_COM_VALOR: pela régua antiga
      // ele NUNCA exigiria valor. Pelo cadastro, exige.
      await expect(
        svc.create({ nome: "Auxílio home office", exigeValor: true }),
      ).resolves.toMatchObject({ exigeValor: true });
      expect(estado.ultimoInsert).toEqual({ nome: "Auxílio home office", exigeValor: true });
    });

    it("update alterna a exigência sem tocar em nada mais", async () => {
      const { db, estado } = makeDb([VR]);
      const svc = new BeneficiosService(db as never);
      await svc.update("1", { exigeValor: false });
      expect(estado.ultimoSet).toEqual({ exigeValor: false });
    });

    it("RENOMEAR não mexe na exigência: o set não carrega exigeValor", async () => {
      const { db, estado } = makeDb([VR]);
      const svc = new BeneficiosService(db as never);
      // Era exatamente aqui que a régua por NOME mudava a exigência em silêncio.
      await svc.update("1", { nome: "Vale Refeição" });
      expect(estado.ultimoSet).toEqual({ nome: "Vale Refeição" });
      expect(estado.ultimoSet).not.toHaveProperty("exigeValor");
    });
  });
});
