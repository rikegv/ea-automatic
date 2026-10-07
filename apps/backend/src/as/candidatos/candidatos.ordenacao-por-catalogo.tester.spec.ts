import { describe, expect, it } from "vitest";
import { bancoDaCentral, type CandidatoFingido, type CandidaturaFingida } from "./central-candidatos-conserto.tester-fake";
import type { BuscarCandidatosDto } from "./candidatos.dto";
import type { AsCandidatoOrdenarPor, AsDirecaoOrdenacao } from "@ea/shared-types";

/**
 * ─ ORDENACAO POR CATALOGO, E NUNCA ALFABETICA (paginacao no servidor, 07/10/2026) ───────────────
 *
 * COBERTURA INDEPENDENTE (§A.38/§A.40): escrita pelo `tester` ANTES do codigo, a partir do REQUISITO
 * do mapa (`docs/MAPA-ALCANCE-PAGINACAO-SERVIDOR-CANDIDATOS-VAGAS.md`, secao 1.1), SEM ler a
 * implementacao nova do service. O backend a fara passar.
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ──────────────────────────────────────────────┐
 * │ A ordenacao era client-side (o navegador segurava 83 mil linhas e ordenava no cliente). Com a  │
 * │ paginacao no servidor ela viaja como chave FECHADA de coluna, e o RISCO novo e ordenar pelo     │
 * │ TEXTO: `etapa` e `situacao` sao codigos de catalogo cuja ordem de NEGOCIO (a ordem do funil, a  │
 * │ ordem da vida da candidatura) NAO e a ordem alfabetica. Ordenar por texto poria "APROVACAO"     │
 * │ antes de "CAPTACAO" (A antes de C), invertendo o funil, e ninguem suspeitaria de ordenacao:     │
 * │ e o modo de falha silencioso e plausivel que a §A.27 manda pegar antes da operacao.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ORACULO E A CLAUSULA `orderBy` MONTADA, lida pelo fingido do mesmo jeito que o
 * `busca-funil-pedido-e-ordem.tester.spec` ja le a ordem do funil: o fingido nao reordena as linhas
 * (um banco de verdade faria), entao a prova de que a ordem esta certa e que a CONSULTA pede a ordem
 * certa ao Postgres. etapa pela ordem do funil (`as_etapas_funil.ordem`), situacao por
 * `array_position` do catalogo, nulos ao FIM nas duas direcoes, e o desempate `id desc` SEMPRE.
 */

function cenario() {
  const candidatos: CandidatoFingido[] = [
    { id: "p1", nome: "Ana", origem: "PANDAPE" },
    { id: "p2", nome: "Bia", origem: "PANDAPE" },
    { id: "p3", nome: "Caio", origem: "PANDAPE" },
  ];
  const candidaturas: CandidaturaFingida[] = [
    { id: "c1", candidatoId: "p1", vagaId: "v1", etapa: "APROVACAO", situacao: "APROVADO" },
    { id: "c2", candidatoId: "p2", vagaId: "v1", etapa: "CAPTACAO", situacao: "ATIVO" },
    { id: "c3", candidatoId: "p3", vagaId: "v1", etapa: "TRIAGEM", situacao: "DESCARTADO" },
  ];
  return bancoDaCentral({ candidatos, candidaturas });
}

/** O argumento com a ordenacao nova, alcancado por `as unknown as` so para o `typecheck` das outras
 * sessoes nao acender enquanto o DTO nao ganha os campos. Quando `ordenarPor`/`direcao` entrarem em
 * `BuscarCandidatosDto`, este molde sai e a chamada volta a ser conferida pelo compilador. */
function comOrdenacao(
  ordenarPor: AsCandidatoOrdenarPor | undefined,
  direcao?: AsDirecaoOrdenacao,
): BuscarCandidatosDto {
  return { ordenarPor, direcao } as unknown as BuscarCandidatosDto;
}

/** A clausula `orderBy` da consulta paginada (a de `as_candidatos` que leva o `limit`), renderizada. */
async function ordemDa(
  banco: ReturnType<typeof bancoDaCentral>,
  arg: BuscarCandidatosDto,
): Promise<string> {
  await banco.service.buscar(arg);
  const paginada = banco.paginada;
  expect(paginada, "a consulta paginada de `as_candidatos` tem de existir").toBeDefined();
  return paginada!.ordem.join(" || ").toLowerCase();
}

describe("a situacao ordena pelo CATALOGO (array_position), nunca pelo texto", () => {
  it("ordenar por situacao usa `array_position` do catalogo, nao a coluna de texto", async () => {
    const ordem = await ordemDa(cenario(), comOrdenacao("situacao", "asc"));
    expect(
      ordem,
      "sem `array_position` a situacao sai em ordem alfabetica (ALOCADO, APROVADO, ATIVO...), que nao e a ordem da vida da candidatura que o mapa 1.1 pede.",
    ).toContain("array_position");
  });

  it("o desempate `id desc` fica SEMPRE, mesmo ordenando por situacao", async () => {
    const banco = cenario();
    await banco.service.buscar(comOrdenacao("situacao", "asc"));
    const cols = banco.paginada!.ordem.map((c) => c.toLowerCase());
    const ultima = cols[cols.length - 1] ?? "";
    expect(ultima, "a ultima expressao de ordem tem de ser o id").toContain('"id"');
    expect(
      ultima,
      "sem o desempate por id, duas linhas do mesmo instante trocam de lugar entre paginas e a mesma pessoa aparece duas vezes ou some.",
    ).toContain("desc");
  });
});

describe("a etapa ordena pela ORDEM DO FUNIL (as_etapas_funil.ordem), nunca pelo texto", () => {
  it("ordenar por etapa referencia a ordem do catalogo, nao a coluna de etapa", async () => {
    const ordem = await ordemDa(cenario(), comOrdenacao("etapa", "asc"));
    expect(
      ordem.includes("as_etapas_funil") || ordem.includes("ordem"),
      "o mapa 1.2 pede a ordem do funil (`as_etapas_funil.ordem`), por subconsulta correlacionada; sem ela a etapa sai alfabetica e inverte o funil (APROVACAO antes de CAPTACAO).",
    ).toBe(true);
  });
});

describe("nulos vao ao FIM nas DUAS direcoes", () => {
  it("por ultimo contato ASCENDENTE, os nulos vao ao fim (nulls last explicito)", async () => {
    const ordem = await ordemDa(cenario(), comOrdenacao("ultimoContato", "asc"));
    expect(
      ordem,
      "ascendente ja poe nulo por ultimo por padrao no Postgres, mas o mapa exige o fim nas DUAS direcoes, entao o `nulls last` e explicito.",
    ).toContain("nulls last");
  });

  it("por ultimo contato DESCENDENTE, os nulos CONTINUAM ao fim (o padrao do banco os poria primeiro)", async () => {
    const ordem = await ordemDa(cenario(), comOrdenacao("ultimoContato", "desc"));
    expect(
      ordem,
      "descendente, o padrao do Postgres e `nulls first`: sem o `nulls last` explicito, quem nunca teve contato vai para o TOPO da lista, que e o oposto do pedido.",
    ).toContain("nulls last");
  });
});

describe("o default, quando nenhuma ordenacao e pedida", () => {
  it("ausente = `criadoEm desc` com desempate `id desc`", async () => {
    const banco = cenario();
    await banco.service.buscar({});
    const cols = banco.paginada!.ordem.map((c) => c.toLowerCase());
    const texto = cols.join(" || ");
    expect(texto, "o default preserva a ordem que a tela ja tinha: o mais recente primeiro.").toContain(
      "criado_em",
    );
    expect(texto).toContain("desc");
    const ultima = cols[cols.length - 1] ?? "";
    expect(ultima, "o desempate por id fica mesmo no default").toContain('"id"');
    expect(ultima).toContain("desc");
  });
});
