import { describe, expect, it } from "vitest";
import { bancoDaCentral } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ ITEM 3: A BUSCA DA CENTRAL ACHA POR E-MAIL PARCIAL, E A LISTA NUNCA DEVOLVE O E-MAIL ────────
 *
 * COBERTURA INDEPENDENTE do `tester` (§A.38/§A.40): escrita a partir do REQUISITO, ANTES do codigo
 * que o atende, para FALHAR agora (vermelho esperado) e passar quando a construcao ligar o filtro.
 *
 * O REQUISITO (OST Alto Volume, item 3):
 *   1. `buscar` casa por e-mail PARCIAL (`like %trecho%`), com `lower`/`trim` nos DOIS lados: a coluna
 *      gravada e o termo chegam dobrados para baixo, entao caixa e espaco nao impedem o casamento.
 *   2. O e-mail NUNCA desce no payload. A projecao (`AsCandidatoListItem`) continua sem e-mail, sem
 *      CPF (so o booleano `temCpf`) e sem telefone. Anti-vazamento (§A.6), precedente do `substituidoCpf`.
 *
 * COMO O TESTE OLHA: o `bancoDaCentral` grava a consulta MONTADA (a clausula `where` renderizada com
 * os parametros de volta no texto, e a SELECAO por alias). Entao da para afirmar o filtro de e-mail
 * sem depender de o fingido resolver linhas, e afirmar a projecao sem depender de dado semeado.
 *
 * O e-mail de teste e de dominio `exemplo.com.br` (dado sintetico, §A.43), nunca um e-mail real.
 */

const EMAIL = "Maria.Souza@Exemplo.COM.BR";

function cenario() {
  return bancoDaCentral({
    candidatos: [
      { id: "p1", nome: "Maria Souza", origem: "PANDAPE", cpf: "52998224725" },
    ],
  });
}

/** A consulta PAGINADA da lista (tabela `as_candidatos`, com teto): e nela que o filtro entra. */
function whereDaBusca(consultas: Array<{ tabela: string; limite: number | null; where: string }>) {
  const q = consultas.find((c) => c.tabela === "as_candidatos" && c.limite !== null);
  expect(q, "a consulta paginada da lista nao foi montada").toBeDefined();
  return q!.where.toLowerCase();
}

describe("ITEM 3: busca por e-mail PARCIAL, com lower/trim nos dois lados", () => {
  it("o filtro de e-mail EXISTE na clausula (hoje `buscar` ignora o campo: vermelho esperado)", async () => {
    const { service, consultas } = cenario();
    await service.buscar({ email: EMAIL } as never);
    const where = whereDaBusca(consultas);
    expect(
      where.includes("email"),
      "a busca por e-mail nao chegou ao `where`: o service ainda nao le `dto.email`.",
    ).toBe(true);
  });

  it("casa por TRECHO (`like %...%`), nao exato", async () => {
    const { service, consultas } = cenario();
    await service.buscar({ email: "souza" } as never);
    const where = whereDaBusca(consultas);
    expect(where).toMatch(/email[\s\S]*i?like[\s\S]*%souza%|%souza%[\s\S]*email/i);
  });

  it("o LADO GRAVADO e dobrado para baixo (`lower(email)` ou `ilike`), nao comparado cru", async () => {
    const { service, consultas } = cenario();
    await service.buscar({ email: EMAIL } as never);
    const where = whereDaBusca(consultas);
    // Aceita `lower(email)`, `lower(trim(coalesce(email, '')))` ou `email ilike`: o que importa e
    // que o lado GRAVADO seja dobrado para baixo, nao a forma exata do envelope.
    const dobraOLadoGravado = /lower\([\s\S]*?email/i.test(where) || /email"?\s+ilike/i.test(where);
    expect(
      dobraOLadoGravado,
      "o e-mail gravado tem de ser comparado case-insensitive: `lower(email) like` ou `email ilike`.",
    ).toBe(true);
  });

  it("o TERMO chega aparado e em minuscula (espaco/caixa insensivel)", async () => {
    const { service, consultas } = cenario();
    // Mixed case + espacos nas bordas: o padrao renderizado tem de ser `%maria.souza@exemplo.com.br%`.
    await service.buscar({ email: "  Maria.Souza@Exemplo.COM.BR  " } as never);
    const where = whereDaBusca(consultas);
    expect(
      where.includes("%maria.souza@exemplo.com.br%"),
      "o termo de e-mail nao foi aparado+minusculado antes do `like` (lado do termo).",
    ).toBe(true);
    expect(
      where.includes("maria.souza@exemplo.com.br  "),
      "sobrou espaco no termo: faltou o trim do lado do termo.",
    ).toBe(false);
  });
});

describe("ITEM 3: a lista NAO devolve e-mail, CPF nem telefone (anti-vazamento §A.6)", () => {
  /**
   * Esta trava le a SELECAO da consulta paginada: a projecao e o que desce para o navegador. CPF so
   * pode aparecer como o booleano `is not null` (o `temCpf`), nunca a coluna crua; e-mail e telefone
   * nao podem aparecer de forma nenhuma. GUARDA de regressao: passa hoje, acende se a construcao
   * acrescentar a coluna crua na projecao para "facilitar" a busca por e-mail.
   */
  function selecaoDaBusca() {
    const { service, consultas } = cenario();
    return service.buscar({ email: "souza" } as never).then(() => {
      const q = consultas.find((c) => c.tabela === "as_candidatos" && c.limite !== null);
      expect(q, "a consulta paginada da lista nao foi montada").toBeDefined();
      return q!;
    });
  }

  it("nenhum alias seleciona a coluna `email`", async () => {
    const q = await selecaoDaBusca();
    const vazaEmail = Object.values(q.selecao).some((expr) => expr.toLowerCase().includes("email"));
    expect(vazaEmail, "a projecao da lista selecionou a coluna de e-mail: vazamento (§A.6).").toBe(false);
  });

  it("nenhum alias seleciona `telefone`", async () => {
    const q = await selecaoDaBusca();
    const vazaTelefone = Object.values(q.selecao).some((expr) => expr.toLowerCase().includes("telefone"));
    expect(vazaTelefone, "a projecao da lista selecionou telefone: vazamento (§A.6).").toBe(false);
  });

  it("CPF so aparece como booleano `is not null` (o `temCpf`), nunca a coluna crua", async () => {
    const q = await selecaoDaBusca();
    for (const [alias, expr] of Object.entries(q.selecao)) {
      if (expr.toLowerCase().includes("cpf")) {
        expect(
          expr.toLowerCase().includes("is not null"),
          `o alias ${alias} toca CPF sem ser 'is not null': so o booleano temCpf e permitido (§A.6).`,
        ).toBe(true);
      }
    }
  });

  it("os itens devolvidos nao tem as chaves email/cpf/telefone", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({} as never);
    const item = (pagina.itens[0] ?? {}) as unknown as Record<string, unknown>;
    expect(item).not.toHaveProperty("email");
    expect(item).not.toHaveProperty("cpf");
    expect(item).not.toHaveProperty("telefone");
  });
});
