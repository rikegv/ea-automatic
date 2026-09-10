/**
 * ─ A COBERTURA INDEPENDENTE DOS DOIS FILTROS DE CARD (tester, §A.38) ────────────────────────────
 *
 * ESTE ARQUIVO NÃO REPETE `as-vagas-lista.spec.ts`: ele fecha os buracos que a MUTAÇÃO encontrou
 * naquele, e recorta a LISTA, não só o booleano. As quatro perguntas medidas aqui:
 *
 *  1. OS DOIS MAPAS CONTINUAM SEPARADOS QUANDO A CHAVE É A MESMA. O spec vizinho afirma que "uma
 *     única função com os dois mapas somados devolveria true nos quatro casos", e isso NÃO era
 *     verdade: com etapa e desfecho usando chaves diferentes em todas as amostras, a função
 *     mesclada passava nos 30 testes. A colisão de chave é o único cenário em que a mescla é
 *     observável, e ela é CAMINHO ABERTO: o código da etapa é derivado do rótulo
 *     (`codigoDoRotulo`, `ifractal-status.service.ts`) e nada impede o diretor de cadastrar uma
 *     etapa chamada "Aprovado", que gera o código `APROVADO`, idêntico ao da situação.
 *  2. ZERO NÃO É "TODOS", medido na LISTA: clicar num card que mostra 0 devolve lista VAZIA, nunca
 *     a lista inteira. O booleano já era testado; o que a operação vê é o comprimento da tabela.
 *  3. A ETAPA FORA DE CIRCULAÇÃO CONTINUA FILTRANDO. O card dela é clicável de propósito
 *     (`KpiDoFunil`), e o recorte não pode ignorar a chave só porque a etapa saiu do catálogo ativo.
 *  4. DOIS VALORES ESCOLHIDOS RECORTAM PELA UNIÃO, e não pelo último (§A.28). O defeito clássico da
 *     conversão de valor único para múltiplo aparece na LISTA, não no booleano de uma vaga só.
 *
 * §A.6: só códigos e contagens, nenhum dado pessoal.
 */
import { describe, expect, it } from "vitest";
import type { AsOcupacaoVaga } from "@ea/shared-types";
import { temGenteNaEtapa, temGenteNoDesfecho } from "./as-vagas-lista";

type Vaga = { codigo: string; ocupacao: AsOcupacaoVaga };

const vaga = (
  codigo: string,
  porEtapa: Record<string, number>,
  porDesfecho: Record<string, number> = {},
): Vaga => ({ codigo, ocupacao: { porEtapa, porDesfecho } as unknown as AsOcupacaoVaga });

/** O MESMO recorte que a tela faz no `useMemo` de `recortadas`: dentro do grupo é OU, entre os grupos é E. */
const recortar = (lista: readonly Vaga[], etapas: string[], desfechos: string[]) =>
  lista.filter(
    (v) => temGenteNaEtapa(v.ocupacao, etapas) && temGenteNoDesfecho(v.ocupacao, desfechos),
  );

describe("etapa e desfecho com a MESMA chave nos dois mapas", () => {
  // O diretor cadastra "Aprovado" como etapa do funil e o código sai `APROVADO`, igual ao da
  // situação. A pessoa em seleção nessa etapa e a pessoa já aprovada são DUAS pessoas diferentes.
  const soNaEtapaHomonima = vaga("V1", { APROVADO: 2 }, {});
  const soNoDesfecho = vaga("V2", {}, { APROVADO: 2 });

  it("a vaga com gente na ETAPA homônima não entra pelo filtro de DESFECHO", () => {
    expect(temGenteNoDesfecho(soNaEtapaHomonima.ocupacao, ["APROVADO"])).toBe(false);
    expect(temGenteNaEtapa(soNaEtapaHomonima.ocupacao, ["APROVADO"])).toBe(true);
  });

  it("a vaga com gente no DESFECHO homônimo não entra pelo filtro de ETAPA", () => {
    expect(temGenteNaEtapa(soNoDesfecho.ocupacao, ["APROVADO"])).toBe(false);
    expect(temGenteNoDesfecho(soNoDesfecho.ocupacao, ["APROVADO"])).toBe(true);
  });

  it("os dois cards acesos com a mesma chave só trazem quem tem as duas coisas", () => {
    const asDuas = vaga("V3", { APROVADO: 1 }, { APROVADO: 1 });
    const lista = [soNaEtapaHomonima, soNoDesfecho, asDuas];
    expect(recortar(lista, ["APROVADO"], ["APROVADO"]).map((v) => v.codigo)).toEqual(["V3"]);
  });
});

describe("zero não é 'todos' (o card com 0 devolve tabela vazia)", () => {
  const lista = [vaga("V1", { TRIAGEM: 2 }, { ALOCADO: 1 }), vaga("V2", { CAPTACAO: 1 }, {})];

  it("card de desfecho zerado devolve zero linhas, e não as duas", () => {
    expect(recortar(lista, [], ["DESISTIU"])).toHaveLength(0);
  });

  it("card de etapa zerado devolve zero linhas, e não as duas", () => {
    expect(recortar(lista, ["ENTREVISTA"], [])).toHaveLength(0);
  });

  it("chave presente com contagem 0 também devolve zero linhas", () => {
    expect(recortar([vaga("V3", { TRIAGEM: 0 }, { ALOCADO: 0 })], ["TRIAGEM"], [])).toHaveLength(0);
    expect(recortar([vaga("V3", { TRIAGEM: 0 }, { ALOCADO: 0 })], [], ["ALOCADO"])).toHaveLength(0);
  });

  it("nenhum card aceso continua sendo 'todas', que é o outro lado da mesma régua", () => {
    expect(recortar(lista, [], [])).toHaveLength(2);
  });
});

describe("etapa fora de circulação continua filtrando", () => {
  // `cardsDeEtapa` desenha o card da inativa que ainda tem gente, e `KpiDoFunil` o deixa clicável.
  // Se o recorte ignorasse a chave da inativa, o clique não faria nada e ninguém entenderia por quê.
  const presos = vaga("V1", { APOSENTADA: 3 }, {});
  const vivos = vaga("V2", { TRIAGEM: 1 }, {});

  it("o clique no card da etapa inativada traz exatamente as vagas com gente presa nela", () => {
    expect(recortar([presos, vivos], ["APOSENTADA"], []).map((v) => v.codigo)).toEqual(["V1"]);
  });

  it("a inativada soma com uma etapa viva, como qualquer outra escolha múltipla", () => {
    expect(recortar([presos, vivos], ["APOSENTADA", "TRIAGEM"], [])).toHaveLength(2);
  });
});

describe("múltipla seleção recorta pela UNIÃO, nunca pelo último escolhido (§A.28)", () => {
  const daTriagem = vaga("V1", { TRIAGEM: 1 }, {});
  const daEntrevista = vaga("V2", { ENTREVISTA: 1 }, {});
  const deFora = vaga("V3", { CAPTACAO: 1 }, {});

  it("duas etapas escolhidas trazem as DUAS vagas", () => {
    const r = recortar([daTriagem, daEntrevista, deFora], ["TRIAGEM", "ENTREVISTA"], []);
    expect(r.map((v) => v.codigo)).toEqual(["V1", "V2"]);
  });

  // O DEFEITO QUE ESTE CASO PEGA: o filtro que só honra a última chave devolveria uma linha só.
  it("a primeira escolhida não some quando a segunda entra", () => {
    const so = recortar([daTriagem, daEntrevista, deFora], ["TRIAGEM"], []);
    const duas = recortar([daTriagem, daEntrevista, deFora], ["TRIAGEM", "ENTREVISTA"], []);
    expect(so).toHaveLength(1);
    expect(duas.length).toBeGreaterThan(so.length);
  });

  it("dois desfechos escolhidos trazem as duas vagas", () => {
    const alocado = vaga("V4", {}, { ALOCADO: 1 });
    const desistiu = vaga("V5", {}, { DESISTIU: 1 });
    const descartado = vaga("V6", {}, { DESCARTADO: 1 });
    const r = recortar([alocado, desistiu, descartado], [], ["ALOCADO", "DESISTIU"]);
    expect(r.map((v) => v.codigo)).toEqual(["V4", "V5"]);
  });
});

/**
 * A COMPOSIÇÃO ENTRE OS GRUPOS É "E", MEDIDA NA LISTA.
 *
 * O spec vizinho já afirma as duas metades no booleano; aqui o mesmo contrato aparece no
 * comprimento da tabela, que é o que a operação enxerga. ATENÇÃO, e está no relatório do tester:
 * o `&&` de verdade mora em `app/(app)/as/vagas/page.tsx` (o `useMemo` de `recortadas`), e NENHUM
 * teste alcança aquele arquivo. Este `recortar` é uma CÓPIA da expressão, então ele trava a régua,
 * não a tela.
 */
describe("dentro do grupo é OU, entre os grupos é E (na lista)", () => {
  const soEtapa = vaga("V1", { TRIAGEM: 1 }, {});
  const soDesfecho = vaga("V2", {}, { ALOCADO: 1 });
  const asDuas = vaga("V3", { TRIAGEM: 1 }, { ALOCADO: 1 });
  const lista = [soEtapa, soDesfecho, asDuas];

  it("acender o segundo grupo ESTREITA a lista, nunca aumenta", () => {
    const soComEtapa = recortar(lista, ["TRIAGEM"], []);
    const comOsDois = recortar(lista, ["TRIAGEM"], ["ALOCADO"]);
    expect(soComEtapa.map((v) => v.codigo)).toEqual(["V1", "V3"]);
    expect(comOsDois.map((v) => v.codigo)).toEqual(["V3"]);
    expect(comOsDois.length).toBeLessThan(soComEtapa.length);
  });

  it("dentro do MESMO grupo, acender o segundo card AUMENTA a lista", () => {
    const uma = recortar(lista, ["TRIAGEM"], []);
    const duas = recortar([...lista, vaga("V4", { CAPTACAO: 1 }, {})], ["TRIAGEM", "CAPTACAO"], []);
    expect(duas.length).toBeGreaterThan(uma.length);
  });
});
