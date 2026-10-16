/**
 * ─ ITEM 2: A FAIXA (POSICOES min/max, DATA DE ABERTURA de/ate) COMO PREDICADO PURO ─────────────
 *
 * COBERTURA INDEPENDENTE do `tester` (§A.38/§A.40), escrita a partir do REQUISITO, ANTES do codigo.
 *
 * O REQUISITO (OST Alto Volume, item 2):
 *   1. A logica de faixa sai da tela (`app/(app)/as/vagas/page.tsx`, hoje inline no `useMemo`) para
 *      uma funcao PURA em `lib/as-vagas-lista.ts`, testavel nas BORDAS (inclui/exclui no limite).
 *   2. A regua "a encerrada reaparece quando ha busca OU filtro ativo"
 *      (`encerradaEntraNaVisaoDeTrabalho`) passa a valer tambem quando um filtro de FAIXA esta
 *      ativo: faixa conta como filtro ativo, igual a um status escolhido.
 *
 * O contrato das BORDAS, lido do comportamento inline de hoje (linhas ~1764-1786 da page):
 *   - ponta vazia NAO filtra; com qualquer ponta escolhida, a vaga SEM valor (rascunho: posicoes
 *     `null` / data ausente) SAI;
 *   - os limites sao INCLUSIVOS (p === min e p === max passam; d === de e d === ate passam);
 *   - a data compara STRING com STRING (`yyyy-mm-dd`), sem `Date`, para o fuso nao roubar um dia.
 *
 * O NOME `vagaNaFaixa` E PROPOSTA (idioma de `candidatos.lote-dto`/`idsDaVaga`): o contrato e o
 * predicado, nao o nome. A construcao ajusta o nome/assinatura; estes testes sao a especificacao.
 * Import por namespace de proposito: export ausente vira `undefined` (nao derruba o arquivo), e
 * cada teste acende sozinho com a mensagem do que falta.
 */
import { describe, expect, it } from "vitest";
import * as lib from "./as-vagas-lista";
import { encerradaEntraNaVisaoDeTrabalho } from "./as-vagas-lista";

type VagaFaixa = { posicoesOficiais: number | null; dataAbertura: string | null };
type FiltroFaixa = {
  posicoesMin?: string;
  posicoesMax?: string;
  abertaDe?: string;
  abertaAte?: string;
};
type Predicado = (v: VagaFaixa, f: FiltroFaixa) => boolean;

/** Le o predicado proposto sem derrubar o arquivo quando ele ainda nao existe. */
const naFaixa = (lib as unknown as Record<string, unknown>).vagaNaFaixa as Predicado | undefined;

/** Falha com mensagem clara enquanto o predicado nao foi extraido. */
function exigirPredicado(): Predicado {
  expect(
    typeof naFaixa,
    "`vagaNaFaixa(vaga, filtro)` ainda nao existe em `lib/as-vagas-lista.ts`. ITEM 2 pede a extracao da faixa (posicoes + data) para esta funcao pura. Enquanto nao existir, este teste e a especificacao dela.",
  ).toBe("function");
  return naFaixa as Predicado;
}

const vaga = (posicoesOficiais: number | null, dataAbertura: string | null = null): VagaFaixa => ({
  posicoesOficiais,
  dataAbertura,
});

describe("ITEM 2: predicado da FAIXA DE POSICOES, nas bordas", () => {
  it("sem nenhuma ponta, passa tudo (inclusive a vaga sem meta)", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(10), {})).toBe(true);
    expect(fn(vaga(null), {})).toBe(true);
  });

  it("limite inferior e INCLUSIVO: p === min passa, p < min sai", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(5), { posicoesMin: "5" })).toBe(true);
    expect(fn(vaga(4), { posicoesMin: "5" })).toBe(false);
    expect(fn(vaga(6), { posicoesMin: "5" })).toBe(true);
  });

  it("limite superior e INCLUSIVO: p === max passa, p > max sai", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(10), { posicoesMax: "10" })).toBe(true);
    expect(fn(vaga(11), { posicoesMax: "10" })).toBe(false);
    expect(fn(vaga(9), { posicoesMax: "10" })).toBe(true);
  });

  it("intervalo fechado [5,10]: as duas pontas entram, o de fora sai", () => {
    const fn = exigirPredicado();
    const f = { posicoesMin: "5", posicoesMax: "10" };
    expect(fn(vaga(5), f)).toBe(true);
    expect(fn(vaga(10), f)).toBe(true);
    expect(fn(vaga(7), f)).toBe(true);
    expect(fn(vaga(4), f)).toBe(false);
    expect(fn(vaga(11), f)).toBe(false);
  });

  it("vaga sem meta (`null`) SAI assim que uma ponta e escolhida", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(null), { posicoesMin: "1" })).toBe(false);
    expect(fn(vaga(null), { posicoesMax: "99" })).toBe(false);
  });
});

describe("ITEM 2: predicado da DATA DE ABERTURA (de/ate), nas bordas", () => {
  it("limite inicial INCLUSIVO: d === de passa, d < de sai (comparacao de string)", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(1, "2026-03-10"), { abertaDe: "2026-03-10" })).toBe(true);
    expect(fn(vaga(1, "2026-03-09"), { abertaDe: "2026-03-10" })).toBe(false);
    expect(fn(vaga(1, "2026-03-11"), { abertaDe: "2026-03-10" })).toBe(true);
  });

  it("limite final INCLUSIVO: d === ate passa, d > ate sai", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(1, "2026-03-20"), { abertaAte: "2026-03-20" })).toBe(true);
    expect(fn(vaga(1, "2026-03-21"), { abertaAte: "2026-03-20" })).toBe(false);
    expect(fn(vaga(1, "2026-03-19"), { abertaAte: "2026-03-20" })).toBe(true);
  });

  it("a data com hora (ISO) e aparada para `yyyy-mm-dd` antes de comparar", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(1, "2026-03-10T23:30:00.000Z"), { abertaDe: "2026-03-10", abertaAte: "2026-03-10" })).toBe(true);
  });

  it("vaga sem data (rascunho) SAI assim que uma ponta de periodo e escolhida", () => {
    const fn = exigirPredicado();
    expect(fn(vaga(1, null), { abertaDe: "2026-01-01" })).toBe(false);
    expect(fn(vaga(1, null), { abertaAte: "2026-12-31" })).toBe(false);
  });
});

describe("ITEM 2: posicoes E data juntas sao E (as duas tem de passar)", () => {
  it("passa so quem cabe nas duas faixas ao mesmo tempo", () => {
    const fn = exigirPredicado();
    const f = { posicoesMin: "5", abertaDe: "2026-03-01", abertaAte: "2026-03-31" };
    expect(fn(vaga(8, "2026-03-15"), f)).toBe(true);
    expect(fn(vaga(2, "2026-03-15"), f)).toBe(false); // posicoes fora
    expect(fn(vaga(8, "2026-04-02"), f)).toBe(false); // data fora
  });
});

/**
 * ─ A ENCERRADA REAPARECE TAMBEM POR FILTRO DE FAIXA (ITEM 2, parte 2) ──────────────────────────
 *
 * A assinatura de hoje e `(temBusca, statusEscolhidos)`. O ITEM 2 acrescenta a FAIXA como terceira
 * dimensao de "filtro ativo": com uma faixa ativa (e so ela), a encerrada volta a visao de trabalho.
 * O terceiro argumento `faixaAtiva` e a PROPOSTA; se a construcao escolher outra forma de injetar a
 * faixa, ajusta a chamada. Os casos de hoje (sem faixa) seguem intactos (compatibilidade).
 */
describe("ITEM 2: encerradaEntraNaVisaoDeTrabalho conta a FAIXA como filtro ativo", () => {
  it("os casos de HOJE seguem valendo (compatibilidade)", () => {
    expect(encerradaEntraNaVisaoDeTrabalho(false, 0)).toBe(false);
    expect(encerradaEntraNaVisaoDeTrabalho(true, 0)).toBe(true);
    expect(encerradaEntraNaVisaoDeTrabalho(false, 1)).toBe(true);
  });

  it("SO uma faixa ativa (sem busca, sem status) ja traz a encerrada de volta", () => {
    const fn = encerradaEntraNaVisaoDeTrabalho as unknown as (
      b: boolean,
      s: number,
      faixaAtiva?: boolean,
    ) => boolean;
    expect(
      fn(false, 0, true),
      "faixa ativa tem de contar como filtro ativo: a encerrada volta a visao de trabalho (ITEM 2).",
    ).toBe(true);
  });

  it("sem busca, sem status e sem faixa: a encerrada continua fora (o padrao nao mudou)", () => {
    const fn = encerradaEntraNaVisaoDeTrabalho as unknown as (
      b: boolean,
      s: number,
      faixaAtiva?: boolean,
    ) => boolean;
    expect(fn(false, 0, false)).toBe(false);
  });
});
