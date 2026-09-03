import { describe, expect, it, vi } from "vitest";
import { GruposClienteService } from "./grupos-cliente.service";
import { admissoes, clientes, grupoClienteMembros, gruposCliente } from "../../db/schema";

/**
 * VINCULAR UM CNPJ CARIMBA AS ADMISSÕES DELE, NA HORA (decisão do diretor).
 *
 * O DEFEITO QUE ISTO CORRIGE, encontrado por ele na homologação: criar um grupo e ticar os CNPJs não
 * aparecia em lugar nenhum. O Controle Gerencial e o Gerenciador leem o CARIMBO da admissão, e o
 * backfill só alcançou os grupos que existiam no dia em que rodou. O grupo nascia certo e invisível.
 *
 * O que estes testes protegem é a convergência: depois de salvar, o carimbo das admissões de cada
 * CNPJ tocado é o que `carimboDoGrupo` responde, seja um grupo (entrou, trocou) ou nulo (saiu).
 */

interface Escrita {
  tabela: unknown;
  valores?: Record<string, unknown>;
}

/**
 * Banco falso: responde por TABELA, que é como o serviço distingue as consultas. `membros` é a
 * associação vigente, e ela MUDA dentro da transação, porque é isso que faz o carimbo ler o estado
 * novo em vez do antigo.
 */
function fakeDb(opts: {
  membrosAtuais: { codCliente: string; grupoId: string; grupoNome: string }[];
  admissoesPorCliente: { codCliente: string; n: number }[];
  /** Os CNPJs que existem no cadastro. O serviço recusa lista com cliente inexistente. */
  clientesExistentes?: string[];
}) {
  const updates: Escrita[] = [];
  let membros = [...opts.membrosAtuais];

  const seletor = (linhasPorTabela: (t: unknown) => unknown[]) =>
    vi.fn(() => {
      let tabela: unknown = null;
      const b: Record<string, unknown> = {};
      b.from = (t: unknown) => {
        tabela = t;
        return b;
      };
      b.innerJoin = () => b;
      // `where` devolve o PRÓPRIO builder, para a cadeia poder continuar em `groupBy`. Quem aguarda
      // direto no `where` continua funcionando, porque o builder é thenable pelo `then` abaixo.
      b.where = () => b;
      b.groupBy = () => Promise.resolve(linhasPorTabela(tabela));
      b.then = (r: (v: unknown) => unknown) => Promise.resolve(linhasPorTabela(tabela)).then(r);
      return b;
    });

  const linhas = (t: unknown): unknown[] => {
    if (t === clientes) return (opts.clientesExistentes ?? ["A", "B"]).map((codCliente) => ({ codCliente }));
    if (t === grupoClienteMembros) return membros;
    if (t === admissoes) return opts.admissoesPorCliente.map((a) => ({ codCliente: a.codCliente, n: a.n }));
    return [];
  };

  const tx = {
    delete: vi.fn(() => ({
      where: async () => {
        membros = [];
        return undefined;
      },
    })),
    insert: vi.fn(() => ({
      values: (vs: { codCliente: string; grupoId: string }[]) => ({
        onConflictDoUpdate: async () => {
          for (const v of vs) {
            membros = membros.filter((m) => m.codCliente !== v.codCliente);
            membros.push({ codCliente: v.codCliente, grupoId: v.grupoId, grupoNome: "novo" });
          }
          return undefined;
        },
      }),
    })),
    update: vi.fn((tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        updates.push({ tabela, valores });
        return { where: async () => undefined };
      },
    })),
    select: seletor(linhas),
  };

  const db = {
    select: seletor(linhas),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      gruposCliente: { findFirst: vi.fn().mockResolvedValue({ id: "g-novo", nome: "GRUPO NOVO" }) },
    },
  };
  return { db, updates, membrosDepois: () => membros };
}

describe("definirMembros carimba as admissões do CNPJ", () => {
  it("VINCULAR: a prévia diz quantas admissões entram, e o salvar carimba", async () => {
    const { db, updates } = fakeDb({
      membrosAtuais: [],
      admissoesPorCliente: [{ codCliente: "A", n: 26 }, { codCliente: "B", n: 12 }],
    });
    const svc = new GruposClienteService(db as never);

    const previa = await svc.previaMembros("g-novo", { codClientes: ["A", "B"] });
    expect(previa.resumo.admissoesACarimbar).toBe(38);
    expect(previa.resumo.admissoesADescarimbar).toBe(0);

    const r = await svc.definirMembros("g-novo", { codClientes: ["A", "B"] });
    expect(r.admissoesACarimbar).toBe(38);
    // O carimbo é do GRUPO, e vem da mesma função que o wizard e a liberação usam.
    const naAdmissao = updates.filter((u) => u.tabela === admissoes);
    expect(naAdmissao).toHaveLength(2);
    for (const u of naAdmissao) expect(u.valores?.grupoClienteId).toBe("g-novo");
  });

  it("DESVINCULAR: quem sai volta a NÃO ter grupo", async () => {
    const { db, updates } = fakeDb({
      membrosAtuais: [{ codCliente: "A", grupoId: "g-novo", grupoNome: "GRUPO NOVO" }],
      admissoesPorCliente: [{ codCliente: "A", n: 26 }],
      clientesExistentes: [],
    });
    const svc = new GruposClienteService(db as never);

    const previa = await svc.previaMembros("g-novo", { codClientes: [] });
    expect(previa.resumo.admissoesADescarimbar).toBe(26);

    await svc.definirMembros("g-novo", { codClientes: [] });
    const naAdmissao = updates.filter((u) => u.tabela === admissoes);
    expect(naAdmissao).toHaveLength(1);
    // `null`, e não o grupo antigo: sair do grupo é ficar sem grupo.
    expect(naAdmissao[0].valores?.grupoClienteId).toBeNull();
  });

  it("nunca escreve em `grupos_cliente`: salvar membros não mexe no cadastro do grupo", async () => {
    const { db, updates } = fakeDb({
      membrosAtuais: [],
      admissoesPorCliente: [{ codCliente: "A", n: 3 }],
      clientesExistentes: ["A"],
    });
    await new GruposClienteService(db as never).definirMembros("g-novo", { codClientes: ["A"] });
    expect(updates.some((u) => u.tabela === gruposCliente)).toBe(false);
  });
});
