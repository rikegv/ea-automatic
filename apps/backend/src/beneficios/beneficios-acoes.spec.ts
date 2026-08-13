import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BeneficiosFilaService } from "./beneficios-fila.service";
import { SEQUENCIA_BENEFICIO } from "../db/schema/enums";
import { beneficiosCatalogo } from "../db/schema";

/**
 * AVANÇO DE ESTÁGIO E EDIÇÃO DO PACOTE (§A.17 etapa 4).
 *
 * O que estes testes travam, em ordem de importância:
 *
 *  1. A RÉGUA DA SEQUÊNCIA: só avança quem está no estágio ANTERIOR. Sem isso, o lote "finalizar
 *     todos" empurraria para o fim gente que ninguém calculou, e o estágio do meio viraria enfeite.
 *  2. A RESPOSTA DIZ QUANTAS ANDARAM E QUANTAS NÃO. É o que impede o time de achar que finalizou 10
 *     quando finalizou 7.
 *  3. NÃO PULA ESTÁGIO nem aceita destino inventado.
 *  4. A EDIÇÃO SUBSTITUI O PACOTE e recalcula o sinalizador NA MESMA TRANSAÇÃO. Sem o recálculo, a
 *     coluna "Pendências Obrig." (régua viva) e o KPI (enum gravado) discordariam sobre a MESMA
 *     admissão, que é a divergência registrada na §A.19.
 */

interface Cenario {
  /** Linhas que a consulta de alvos devolve (as que estão no estágio anterior). */
  alvos?: { id: string }[];
  admissaoExiste?: boolean;
  catalogo?: { id: string }[];
}

function montar(cen: Cenario = {}) {
  const updates: Record<string, unknown>[] = [];
  const deletes: unknown[] = [];
  const inserts: unknown[][] = [];
  const ordem: string[] = [];

  const chain = (marca: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    // A tabela do `from` decide o que a leitura devolve: o catálogo é consultado para validar os ids
    // do pacote, e os alvos para saber quem está no estágio anterior.
    let tabela: unknown = null;
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    for (const m of ["innerJoin", "leftJoin", "where", "orderBy", "limit", "offset"]) {
      b[m] = () => b;
    }
    b.set = (v: Record<string, unknown>) => {
      updates.push(v);
      ordem.push(`update:${marca}`);
      return b;
    };
    b.values = (v: unknown) => {
      inserts.push(Array.isArray(v) ? v : [v]);
      ordem.push("insert");
      return b;
    };
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve(tabela === beneficiosCatalogo ? (cen.catalogo ?? []) : marca === "alvos" ? (cen.alvos ?? []) : []);
    return b;
  };

  const tx = {
    select: vi.fn(() => chain("alvos")),
    update: vi.fn(() => chain("status")),
    delete: vi.fn(() => {
      deletes.push(true);
      ordem.push("delete");
      return { where: () => Promise.resolve(undefined) };
    }),
    insert: vi.fn(() => chain("pacote")),
    query: {
      admissoes: {
        findFirst: async () => (cen.admissaoExiste === false ? undefined : { id: "adm-1" }),
      },
      candidatos: { findFirst: async () => ({ nome: "MARIA", cpf: "1" }) },
      dadosVagaFolha: { findFirst: async () => ({ salario: "2000" }) },
    },
  } as Record<string, unknown>;
  (tx as { transaction: unknown }).transaction = async (cb: (t: unknown) => Promise<unknown>) =>
    cb(tx);

  return { svc: new BeneficiosFilaService(tx as never), updates, deletes, inserts, ordem };
}

describe("avançar estágio", () => {
  it("só avança quem está no estágio anterior, e diz quantas ficaram", async () => {
    const ctx = montar({ alvos: [{ id: "a" }, { id: "b" }] });

    const r = await ctx.svc.avancar(["a", "b", "c"], "BENEFICIO_CALCULADO");

    expect(r).toEqual({ avancadas: 2, ignoradas: 1, status: "BENEFICIO_CALCULADO" });
    expect(ctx.updates[0]).toMatchObject({ statusCadastroBeneficio: "BENEFICIO_CALCULADO" });
  });

  it("ninguém no outro estágio: nada é gravado", async () => {
    const ctx = montar({ alvos: [] });

    const r = await ctx.svc.avancar(["a"], "BENEFICIO_CALCULADO");

    expect(r).toEqual({ avancadas: 0, ignoradas: 1, status: "BENEFICIO_CALCULADO" });
    expect(ctx.updates).toHaveLength(0);
  });

  it("o MESMO caminho serve o clique da linha e o lote", async () => {
    const um = montar({ alvos: [{ id: "a" }] });
    expect((await um.svc.avancar(["a"], "BENEFICIO_CALCULADO")).avancadas).toBe(1);
    const lote = montar({ alvos: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect((await lote.svc.avancar(["a", "b", "c"], "BENEFICIO_CALCULADO")).avancadas).toBe(3);
  });

  /**
   * REVERTER é o mesmo endpoint com o destino invertido (decisão do diretor): são dois estágios, e o
   * caminho é de ida e volta. Quem clicou errado traz a pessoa de volta para a fila.
   */
  it("REVERTE de calculado para aguardando, pelo mesmo caminho", async () => {
    const ctx = montar({ alvos: [{ id: "a" }] });

    const r = await ctx.svc.avancar(["a"], "AGUARDANDO_CALCULO");

    expect(r).toEqual({ avancadas: 1, ignoradas: 0, status: "AGUARDANDO_CALCULO" });
    expect(ctx.updates[0]).toMatchObject({ statusCadastroBeneficio: "AGUARDANDO_CALCULO" });
  });

  it("destino inventado é recusado", async () => {
    const ctx = montar();
    await expect(ctx.svc.avancar(["a"], "LIBERADO")).rejects.toBeInstanceOf(BadRequestException);
  });

  /** O terceiro estágio foi REMOVIDO por decisão do diretor: pedir por ele é destino inválido. */
  it("FINALIZADO não é mais destino válido", async () => {
    const ctx = montar();
    await expect(ctx.svc.avancar(["a"], "FINALIZADO")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lista vazia é recusada, em vez de virar um update sem alvo", async () => {
    const ctx = montar();
    await expect(ctx.svc.avancar([], "BENEFICIO_CALCULADO")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("a sequência é a fonte única, e são DOIS estágios", () => {
    expect([...SEQUENCIA_BENEFICIO]).toEqual(["AGUARDANDO_CALCULO", "BENEFICIO_CALCULADO"]);
  });
});

describe("editar o pacote", () => {
  it("SUBSTITUI o conjunto: apaga o que havia e grava o que veio", async () => {
    const ctx = montar({ catalogo: [{ id: "b1" }, { id: "b2" }] });

    await ctx.svc.editarPacote("adm-1", [
      { beneficioId: "b1", valor: 44 },
      { beneficioId: "b2" },
    ]);

    expect(ctx.deletes).toHaveLength(1);
    expect(ctx.inserts[0]).toEqual([
      { admissaoId: "adm-1", beneficioId: "b1", valor: "44.00" },
      // Sem valor informado grava NULO, e não zero: zero seria um valor cadastrado.
      { admissaoId: "adm-1", beneficioId: "b2", valor: null },
    ]);
  });

  /**
   * A ORDEM É A GARANTIA: apagar, gravar e SÓ ENTÃO recalcular o sinalizador, tudo na mesma
   * transação. Recalcular antes leria o pacote velho e gravaria um sinalizador que já nasce errado.
   */
  it("recalcula o sinalizador DEPOIS de gravar, na mesma transação", async () => {
    const ctx = montar({ catalogo: [{ id: "b1" }] });

    await ctx.svc.editarPacote("adm-1", [{ beneficioId: "b1" }]);

    expect(ctx.ordem).toEqual(["delete", "insert", "update:status"]);
    expect(ctx.updates.at(-1)).toHaveProperty("sinalizadorPreenchimento");
  });

  it("pacote VAZIO é decisão legítima: apaga tudo e não grava nada", async () => {
    const ctx = montar();

    await ctx.svc.editarPacote("adm-1", []);

    expect(ctx.deletes).toHaveLength(1);
    expect(ctx.inserts).toHaveLength(0);
  });

  it("benefício fora do catálogo é recusado antes da transação", async () => {
    const ctx = montar({ catalogo: [] });
    await expect(
      ctx.svc.editarPacote("adm-1", [{ beneficioId: "fantasma" }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.deletes).toHaveLength(0);
  });

  it("admissão inexistente é 404", async () => {
    const ctx = montar({ admissaoExiste: false });
    await expect(ctx.svc.editarPacote("adm-1", [])).rejects.toBeInstanceOf(NotFoundException);
  });
});
