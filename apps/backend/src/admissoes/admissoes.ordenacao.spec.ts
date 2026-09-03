import "reflect-metadata";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { AdmissoesService, COLUNAS_ORDENAVEIS_GERENCIADOR } from "./admissoes.service";

/**
 * ORDENAÇÃO DO GERENCIADOR (a tela intitulada "Esteira Admissional"), leva 2.
 *
 * POR QUE ELA É NO BANCO. A tela é paginada no SERVIDOR, 20 de 2.574, 129 páginas. Ordenar em memória
 * ordenaria só as 20 linhas abertas: a primeira linha da tela não seria a primeira da lista, e a
 * página 2 recomeçaria a sequência. O `order by` tem de entrar antes do `limit`, e é isso que estes
 * testes travam.
 *
 * O QUE MAIS ESTÁ EM JOGO:
 *  1. §A.26: SEM coluna escolhida, a lista sai idêntica à de hoje (`criado_em desc`). A ordenação é
 *     sobreposição por ação do usuário, não mudança de comportamento para quem só abre a tela.
 *  2. LISTA FECHADA: nome de coluna vem da URL, então o que não está na lista cai na ordem padrão em
 *     vez de virar injeção ou tela derrubada.
 *  3. DESEMPATE ESTÁVEL: `criado_em` acompanha toda ordem pedida. Sem ele, duas linhas de mesmo valor
 *     podem trocar de lugar entre a página 1 e a 2, e a mesma pessoa aparece duas vezes ou some.
 */

/** Captura o `order by` que a consulta da LISTA montou, sem Postgres. */
function montar() {
  const orders: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "limit", "offset"]) {
    chain[m] = () => chain;
  }
  chain.orderBy = (...args: unknown[]) => {
    orders.push(args);
    return chain;
  };
  // A PRIMEIRA leitura é a contagem total (`[{ total }]`, desestruturada no serviço); as demais podem
  // devolver lista vazia, porque o que este teste observa é o `order by`, não os dados.
  let n = 0;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(n++ === 0 ? [{ total: 0 }] : []);

  const db = {
    select: vi.fn(() => chain),
    selectDistinct: vi.fn(() => chain),
    query: { admissoes: { findFirst: async () => undefined } },
  };
  return { svc: new AdmissoesService(db as never, {} as never), orders };
}

const sqlDaOrdem = (args: unknown[]) =>
  args.map((a) => new PgDialect().sqlToQuery(a as never).sql.replace(/\s+/g, " ")).join(" | ");

async function ordemDe(filtros: Parameters<AdmissoesService["listar"]>[0]) {
  const { svc, orders } = montar();
  await svc.listar(filtros);
  // A primeira consulta com `order by` é a da lista paginada.
  return sqlDaOrdem(orders[0] ?? []);
}

describe("a ordem padrão continua a de hoje (§A.26)", () => {
  it("sem coluna escolhida, ordena por criado_em desc e nada mais", async () => {
    const ordem = await ordemDe({});
    expect(ordem).toContain("criado_em");
    expect(ordem).toContain("desc");
    expect(ordem.split("|")).toHaveLength(1);
  });
});

describe("a coluna pedida vira order by de verdade", () => {
  it.each([
    ["candidato", "nome"],
    ["cliente", "nome_operacao"],
    ["cargo", "nome"],
    ["contrato", "tipo_contrato"],
    ["dataAdmissao", "data_admissao"],
    ["status", "farol_global"],
  ])("%s ordena por %s", async (chave, esperado) => {
    expect(await ordemDe({ ordenarPor: chave, direcao: "asc" })).toContain(esperado);
  });

  it("a direção pedida é respeitada nos dois sentidos", async () => {
    expect(await ordemDe({ ordenarPor: "candidato", direcao: "asc" })).toMatch(/nome" asc/);
    expect(await ordemDe({ ordenarPor: "candidato", direcao: "desc" })).toMatch(/nome" desc/);
  });

  /**
   * Sem desempate estável, paginação perde linha em silêncio: é o pior desfecho possível numa tela
   * que a operação usa para achar gente.
   */
  it("criado_em desempata toda ordem pedida", async () => {
    const ordem = await ordemDe({ ordenarPor: "status", direcao: "asc" });
    expect(ordem.split("|")).toHaveLength(2);
    expect(ordem).toContain("criado_em");
  });
});

describe("a lista de colunas é fechada", () => {
  it("coluna desconhecida cai na ordem padrão", async () => {
    const ordem = await ordemDe({ ordenarPor: "salario" });
    expect(ordem).toContain("criado_em");
    expect(ordem.split("|")).toHaveLength(1);
  });

  it("tentativa de injeção não vira SQL", async () => {
    const ordem = await ordemDe({ ordenarPor: "nome; drop table admissoes; --" });
    expect(ordem).not.toContain("drop table");
    expect(ordem).toContain("criado_em");
  });

  it("a lista exportada é a que a tela usa, e as colunas de FRENTE não entram", async () => {
    expect([...COLUNAS_ORDENAVEIS_GERENCIADOR]).toEqual([
      "candidato",
      "cliente",
      "cargo",
      "contrato",
      "dataAdmissao",
      "status",
      // GRUPO (cenário 2, etapa 4): entrou porque VEM DESTA CONSULTA, pelo `leftJoin` da coluna, e
      // não depois como as colunas de frente. É a régua deste teste, não uma exceção a ela.
      "grupo",
      // PROJETO (etapa 5): entra pela MESMA régua, e pelo mesmo motivo. `admissao_projeto` tem unique
      // em `admissao_id`, então o join não multiplica linha e a ordem é a da consulta paginada.
      "projeto",
    ]);
    // Auditoria, Exame e Cadastro são carregadas depois, só para as 20 linhas da página: ordenar por
    // elas seria exatamente a ordem falsa que esta frente veio corrigir.
    for (const fora of ["auditoria", "exame", "cadastro", "pendencias"]) {
      expect(await ordemDe({ ordenarPor: fora })).toContain("criado_em");
    }
  });
});
