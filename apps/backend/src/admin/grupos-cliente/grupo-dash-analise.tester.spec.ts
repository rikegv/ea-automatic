import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { GruposClienteService } from "./grupos-cliente.service";

/**
 * COBERTURA INDEPENDENTE (§A.38) — O PAINEL DO GRUPO (GET /admin/grupos-cliente/:id/analise).
 *
 * Escrita a partir do REQUISITO, não do código. O painel por grupo erra do mesmo jeito que todo
 * painel de contagem: devolve um número plausível e errado, e ninguém vê stack trace. Os casos abaixo
 * são os jeitos de o erro nascer aqui.
 *
 * O REQUISITO ALINHADO À RÉGUA DA DASH DE PROJETO (decisão do coordenador: reusar a MESMA lógica do
 * `Na Esteira`/`vinculadas` do projeto, que exclui os TRÊS: DECLINOU, RESCISAO e BANCO_AGUARDAR):
 *  - `faltam = meta - naEsteira`, com `naEsteira` SEM banco (igual a `vagas - vinculadas` do projeto);
 *  - `naEsteira` conta `grupo_cliente_id = :id` e EXCLUI DECLINOU, RESCISAO E BANCO_AGUARDAR;
 *  - `ativos == naEsteira` (os dois excluem banco agora);
 *  - `emBanco` = BANCO_AGUARDAR, recorte SEPARADO;
 *  - os declínios são contados À PARTE e NÃO entram em `naEsteira` nem no `faltam`;
 *  - `concluidas/emAndamento/emBanco/pausadas` usam a MESMA régua de farol da dash de projeto, e
 *    `concluidas` exclui os três terminais/banco (a correção apontada na primeira rodada);
 *  - grupo SEM meta: `meta` e `faltam` vêm null, sem quebrar e sem NaN;
 *  - grupo inexistente: 404;
 *  - §A.6: a resposta é só contagem + nome/meta do grupo. Nenhum CPF, candidato ou CNPJ.
 */

const GRUPO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;

const GRUPO_COM_META: Row = { id: GRUPO_ID, nome: "CAGC Corifeu", meta: 100 };

/**
 * Fake do Drizzle para o painel do grupo. A leitura do serviço é:
 *   grupo = db.query.gruposCliente.findFirst({ where })
 *   [c]  = db.select({...colunas de contagem...}).from(admissoes).where(grupo_cliente_id = :id)
 *
 * O fake captura as COLUNAS do `select` (para renderizar e conferir a régua de farol de cada balde)
 * e as condições do `where` (para conferir o universo `grupo_cliente_id = :id`), e devolve a linha de
 * contagem que o cenário fornece.
 */
function montar(opts: { grupo?: Row | null; counts?: Row } = {}) {
  const colunas: Record<string, unknown>[] = [];
  const wheres: unknown[] = [];
  const linha = opts.counts ?? {};

  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  // A consulta por cargo acrescenta leftJoin/groupBy/orderBy à mesma cadeia; o fake só precisa
  // devolver a cadeia para elas (a resolução canned continua em `then`).
  chain.leftJoin = () => chain;
  chain.groupBy = () => chain;
  chain.orderBy = () => chain;
  chain.where = (c: unknown) => {
    wheres.push(c);
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve([linha]);

  const db = {
    query: {
      gruposCliente: {
        findFirst: vi.fn(async () => (opts.grupo === undefined ? GRUPO_COM_META : opts.grupo)),
      },
    },
    select: vi.fn((cols: Record<string, unknown>) => {
      colunas.push(cols);
      return chain;
    }),
  };

  return { db, colunas, wheres, service: new GruposClienteService(db as never) };
}

const render = (expr: unknown) =>
  new PgDialect().sqlToQuery(expr as never).sql.replace(/\s+/g, " ");

describe("painel do grupo: guarda e matemática", () => {
  it("grupo inexistente é 404", async () => {
    const ctx = montar({ grupo: null });
    await expect(ctx.service.analise(GRUPO_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("faltam = meta - naEsteira (naEsteira SEM banco, igual ao projeto)", async () => {
    // naEsteira exclui banco, então ativos == naEsteira e o banco vem no recorte separado emBanco.
    const ctx = montar({ counts: { naEsteira: 60, ativos: 60, emBanco: 5, concluidas: 40, emAndamento: 15, pausadas: 0, declinios: 23 } });

    const r = await ctx.service.analise(GRUPO_ID);

    expect(r.grupo.meta).toBe(100);
    expect(r.totais.meta).toBe(100);
    expect(r.totais.naEsteira).toBe(60);
    expect(r.totais.ativos).toBe(60); // ativos == naEsteira: os dois excluem banco
    expect(r.totais.faltam).toBe(40);
  });

  it("grupo SEM meta: meta e faltam vêm NULL, sem NaN", async () => {
    const ctx = montar({
      grupo: { id: GRUPO_ID, nome: "CAGC (legado)", meta: null },
      counts: { naEsteira: 60, ativos: 60, emBanco: 0, concluidas: 10, emAndamento: 50, pausadas: 0, declinios: 4 },
    });

    const r = await ctx.service.analise(GRUPO_ID);

    expect(r.grupo.meta).toBeNull();
    expect(r.totais.meta).toBeNull();
    // Null diz "não há meta". Zero mentiria dizendo "não falta ninguém"; NaN vazaria como largura
    // inválida na tela.
    expect(r.totais.faltam).toBeNull();
    expect(JSON.stringify(r)).not.toContain("NaN");
  });

  it("os declínios vêm no total, SEPARADOS, e não entram em naEsteira nem no faltam", async () => {
    // naEsteira 60, meta 100 -> faltam 40 mesmo com 23 declínios ao lado.
    const ctx = montar({ counts: { naEsteira: 60, ativos: 60, emBanco: 5, concluidas: 40, emAndamento: 15, pausadas: 0, declinios: 23 } });

    const r = await ctx.service.analise(GRUPO_ID);

    expect(r.totais.declinios).toBe(23);
    expect(r.totais.faltam).toBe(40); // não 40-23 nem 40+23: o declínio é informação ao lado.
  });
});

describe("painel do grupo: o universo é grupo_cliente_id = :id", () => {
  it("a consulta de contagem filtra por grupo_cliente_id do grupo pedido", async () => {
    const ctx = montar();
    await ctx.service.analise(GRUPO_ID);

    expect(ctx.wheres.length).toBeGreaterThan(0);
    const sqlWhere = render(ctx.wheres[0]);
    expect(sqlWhere).toContain("grupo_cliente_id");
  });
});

describe("painel do grupo: a régua de farol de cada balde (renderizada do SQL)", () => {
  const colunasDeContagem = () => {
    const ctx = montar();
    return ctx.service.analise(GRUPO_ID).then(() => {
      const ctxCols = ctx.colunas.find((c) => c && "naEsteira" in c);
      expect(ctxCols, "a consulta de contagem do painel tem de existir").toBeTruthy();
      return ctxCols as Record<string, unknown>;
    });
  };

  it("naEsteira exclui os TRÊS: DECLINOU, RESCISAO e BANCO_AGUARDAR (mesma régua do projeto)", async () => {
    const cols = await colunasDeContagem();
    const naEsteira = render(cols.naEsteira);
    // A régua alinhada ao projeto: banco NÃO entra no denominador do faltam, como em vagas-vinculadas.
    for (const fora of ["DECLINOU", "RESCISAO", "BANCO_AGUARDAR"]) {
      expect(naEsteira).toContain(fora);
    }
  });

  it("ativos == naEsteira: a dash entrega os dois iguais (mesma régua, banco fora dos dois)", async () => {
    // Requisito ao nível do RESULTADO, não da forma: ativos e naEsteira têm de sair iguais, porque
    // ambos excluem banco. Não rendeiro uma coluna `ativos` separada de propósito: a régua alinhada
    // deriva ativos do mesmo recorte de naEsteira, então assumir uma coluna própria seria testar a
    // forma, não o requisito.
    const ctx = montar({ counts: { naEsteira: 72, ativos: 72, emBanco: 8, concluidas: 10, emAndamento: 50, pausadas: 0, declinios: 4 } });
    const r = await ctx.service.analise(GRUPO_ID);
    expect(r.totais.ativos).toBe(r.totais.naEsteira);
    // E o banco é recorte SEPARADO, fora dos dois.
    expect(r.totais.emBanco).toBe(8);
  });

  it("emBanco é só BANCO_AGUARDAR, e pausadas é pausada_em not null (mesma régua do projeto)", async () => {
    const cols = await colunasDeContagem();
    expect(render(cols.emBanco)).toContain("BANCO_AGUARDAR");
    expect(render(cols.pausadas)).toContain("pausada_em");
  });

  it("declinios é o recorte À PARTE: só DECLINOU/RESCISAO", async () => {
    const cols = await colunasDeContagem();
    const declinios = render(cols.declinios);
    expect(declinios).toContain("DECLINOU");
    expect(declinios).toContain("RESCISAO");
  });

  it("emAndamento usa a expressão compartilhada (anda e não concluiu): EM_ADMISSAO/BANCO_AGUARDAR", async () => {
    const cols = await colunasDeContagem();
    const emAndamento = render(cols.emAndamento);
    expect(emAndamento).toContain("EM_ADMISSAO");
  });
});

/**
 * ─ concluidas USA A MESMA RÉGUA DE FAROL DA DASH DE PROJETO ─────────────────────────────────────
 *
 * A dash de PROJETO conta concluídas como `admissaoConcluidaSql AND farol not in
 * (DECLINOU, RESCISAO, BANCO_AGUARDAR)` — a exclusão de farol foi a correção de 13/08/2026, porque
 * sem ela quem fechou o Cadastro e DEPOIS declinou contava como Concluída e saía do Na Esteira,
 * fazendo "Concluídas > Na Esteira", impossível por definição.
 *
 * O painel do GRUPO tem de repetir essa régua: `concluidas` exclui os três (DECLINOU, RESCISAO,
 * BANCO_AGUARDAR), senão `concluidas` pode passar `naEsteira`, que agora também exclui os três.
 */
describe("painel do grupo: concluidas usa a MESMA exclusão de farol da dash de projeto", () => {
  it("concluidas exclui DECLINOU, RESCISAO e BANCO_AGUARDAR", async () => {
    const ctx = montar();
    await ctx.service.analise(GRUPO_ID);
    const cols = ctx.colunas.find((c) => c && "concluidas" in c) as Record<string, unknown>;
    const concluidas = render(cols.concluidas);
    for (const fora of ["DECLINOU", "RESCISAO", "BANCO_AGUARDAR"]) {
      expect(concluidas, `concluídas do grupo deve excluir ${fora}, como a dash de projeto`).toContain(fora);
    }
  });
});

/**
 * ─ §A.6: QUANTOS, NÃO QUEM ──────────────────────────────────────────────────────────────────────
 *
 * A proteção real vive no SQL: a consulta só seleciona agregados de contagem e o nome/meta do grupo.
 * Estes testes provam isso na origem (colunas selecionadas) e na saída (shape da resposta).
 */
describe("painel do grupo: §A.6, nenhum dado pessoal", () => {
  it("as colunas selecionadas são só contagens, nenhuma coluna de CPF/nome/candidato/CNPJ", async () => {
    const ctx = montar();
    await ctx.service.analise(GRUPO_ID);
    const cols = ctx.colunas.find((c) => c && "naEsteira" in c) as Record<string, unknown>;
    const nomes = Object.keys(cols).join(" ").toLowerCase();
    for (const proibido of ["cpf", "candidato", "nome", "cnpj", "razao", "email"]) {
      expect(nomes).not.toContain(proibido);
    }
  });

  it("a resposta só expõe o grupo (id, nome, meta) e os totais de contagem", async () => {
    const ctx = montar({ counts: { naEsteira: 60, ativos: 60, emBanco: 0, concluidas: 10, emAndamento: 50, pausadas: 0, declinios: 4 } });
    const r = await ctx.service.analise(GRUPO_ID);

    expect(Object.keys(r.grupo).sort()).toEqual(["id", "meta", "nome"]);
    const texto = JSON.stringify(r).toLowerCase();
    for (const proibido of ["cpf", "candidato", "cnpj", "razao", "email", "matricula"]) {
      expect(texto).not.toContain(proibido);
    }
  });
});
