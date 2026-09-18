import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { IngestaoRepositorio } from "./ingestao-repositorio";

/**
 * ─ A TRAVA DO BIND DE LISTA, E POR QUE ELA PRECISOU EXISTIR ────────────────────────────────────
 *
 * O `encerrarAusentes` nasceu com `<> all(${ativos}::text[])`, e essa forma NÃO EXECUTA. Drizzle
 * sobre postgres-js não liga um array de JS a um array de Postgres: com 1 id o valor chega como
 * TEXTO (`malformed array literal`, 22P02) e com 2 ou mais chega como RECORD (`cannot cast type
 * record to text[]`, 42846). Medido contra Postgres, nas três cardinalidades, em
 * `docs/PROVA-BIND-ARRAY-ENCERRAR-AUSENTES.md`.
 *
 * ┌─ O DEFEITO ERA INVISÍVEL PARA A SUÍTE INTEIRA, E É ISSO QUE ESTE ARQUIVO CONSERTA ───────────┐
 * │ 3.680 testes verdes conviveram com a instrução CENTRAL da frente sendo inexecutável, porque   │
 * │ nenhum contrato da ingestão tem Postgres: todos medem SENTIDO contra um banco fingido, que    │
 * │ aceita qualquer forma de parâmetro. E o chamador (`ingestao-ciclo.ts`) ENGOLE a exceção: soma  │
 * │ `resumo.erros` e segue. A vaga espelhada nunca encerraria, `encerrada_em` ficaria nulo para    │
 * │ sempre, e a cláusula `v.encerrada_em is null` do expurgo manteria toda pessoa viva dentro dela │
 * │ retida indefinidamente, com CPF, e-mail, telefone e nascimento, sem nada falhar.               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ESTE TESTE É POR FORMA, E A FORMA AQUI É A DO DRIVER, NÃO A DO TEXTO ───────────────────────┐
 * │ Ele NÃO tem banco, e por isso NÃO prova o efeito: declarado com todas as letras, porque a     │
 * │ suíte inteira da ingestão não tem Postgres. O que ele faz é COMPILAR a instrução com o        │
 * │ `PgDialect` REAL do drizzle, que é exatamente o que produz o `$1, $2, ...` entregue ao         │
 * │ postgres-js. A afirmação, então, não é sobre o texto que alguém escreveu: é sobre o que o     │
 * │ driver recebe.                                                                                 │
 * │                                                                                                │
 * │ A INVARIANTE FOI MEDIDA, E NÃO SUPOSTA. A primeira redação deste arquivo afirmava que nenhum   │
 * │ parâmetro podia ser um array de JS, e essa afirmação NUNCA FICA VERMELHA: o drizzle ESPALHA o  │
 * │ array em parâmetros soltos, e é justamente o espalhamento que produz o defeito. Compilada, a   │
 * │ forma quebrada vira um CONSTRUTOR DE LINHA, e é essa a invariante que se afirma aqui:          │
 * │    com 1 id  -> `all(($2)::text[])`            escalar entre parênteses -> 22P02               │
 * │    com 3 ids -> `all(($2, $3, $4)::text[])`    construtor de LINHA      -> 42846 (record)      │
 * │ Um teste que não sabe ficar vermelho não é trava, é decoração: a forma quebrada foi recolocada │
 * │ no repositório de propósito e ESTE arquivo ficou vermelho antes de ser aceito.                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal. Os valores são números de vaga do ATS, sintéticos.
 */

const dialeto = new PgDialect();

/** O banco que não responde nada: só guarda o objeto SQL que o repositório mandou executar. */
function bancoQueSoAnota(): { db: never; consultas: unknown[] } {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve([]);
    },
  };
  return { db: db as never, consultas };
}

/** O catálogo fora do caminho: o encerramento só lhe pede o código do papel FECHAMENTO. */
const catalogoDeStatus = { codigoDoPapel: () => Promise.resolve("FECHADA") } as never;

/** Compila o encerramento de N ids como o driver o receberia. */
async function instrucaoDoEncerramento(
  quantos: number,
): Promise<{ sql: string; params: unknown[] }> {
  const banco = bancoQueSoAnota();
  const repo = new IngestaoRepositorio(banco.db, catalogoDeStatus, null as never);
  const ids = Array.from({ length: quantos }, (_, i) => 900000 + i);
  await repo.encerrarAusentes(ids);
  const consulta = banco.consultas[0];
  expect(consulta, "o encerramento não emitiu instrução nenhuma").toBeDefined();
  const compilada = dialeto.sqlToQuery(consulta as never);
  return { sql: compilada.sql, params: compilada.params as unknown[] };
}

describe("o bind da lista de vagas ativas, na forma em que o driver a recebe", () => {
  it("compara contra um ARRAY, e nunca contra um construtor de linha, em NENHUMA cardinalidade", async () => {
    // As três cardinalidades medidas: a que quebrou com 22P02, a que quebrou com 42846, e a de
    // produção (621 vagas ativas).
    for (const quantos of [1, 3, 621]) {
      const { sql } = await instrucaoDoEncerramento(quantos);
      const trecho = /<>\s*all\(([\s\S]*?)::text\[\]\)/.exec(sql.replace(/\s+/g, " "));
      expect(trecho, `com ${quantos} id(s) o encerramento não comparou contra uma lista`).not.toBeNull();
      const comparado = (trecho as RegExpExecArray)[1];
      expect(
        comparado.startsWith("array["),
        `com ${quantos} id(s) o encerramento compara contra \`${comparado.slice(0, 40)}\`, que o ` +
          "Postgres recusa: parênteses soltos viram escalar (22P02) ou construtor de linha (42846)",
      ).toBe(true);
    }
  });

  it("monta UM PLACEHOLDER POR ID dentro de um `array[...]`, e não um parâmetro só", async () => {
    const { sql, params } = await instrucaoDoEncerramento(3);
    // A forma quebrada compila para `all($2::text[])`: um placeholder só, com o array dentro dele.
    expect(
      /<>\s*all\(\s*\$\d+::text\[\]\s*\)/.test(sql),
      "o encerramento voltou à forma de parâmetro único, que não executa no Postgres",
    ).toBe(false);
    expect(sql).toMatch(/<>\s*all\(array\[\$\d+,\s*\$\d+,\s*\$\d+\]::text\[\]\)/);
    // Os três ids viajam como TEXTO, um por parâmetro: a coluna comparada é `varchar`.
    expect(params).toContain("900000");
    expect(params).toContain("900001");
    expect(params).toContain("900002");
  });

  it("cresce um placeholder por id, e a conta de produção cabe no protocolo", async () => {
    const { sql, params } = await instrucaoDoEncerramento(621);
    const placeholders = sql.match(/\$\d+/g) ?? [];
    // 621 ids mais o código do status do fechamento.
    expect(params).toHaveLength(622);
    // O teto do protocolo do Postgres é 65.535 parâmetros: 622 está longe dele, e a folga é medida.
    expect(placeholders.length).toBeLessThan(65_535);
    expect(sql).toContain("$621");
  });

  it("a lista vazia continua não encerrando ninguém, e nem chega ao banco", async () => {
    const banco = bancoQueSoAnota();
    const repo = new IngestaoRepositorio(banco.db, catalogoDeStatus, null as never);
    await expect(repo.encerrarAusentes([])).resolves.toBe(0);
    expect(
      banco.consultas,
      "a lista vazia emitiu instrução: um `not in ()` vazio encerraria TODA vaga espelhada",
    ).toHaveLength(0);
  });
});
