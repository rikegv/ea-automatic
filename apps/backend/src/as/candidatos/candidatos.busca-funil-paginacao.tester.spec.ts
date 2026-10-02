import { describe, expect, it } from "vitest";
import { bancoDaBuscaComFunil, type CandidaturaFingida } from "./busca-funil.tester-fake";

/**
 * ─ A PAGINACAO NAO PODE QUEBRAR, e aqui o risco e de DADO, nao de tela (emenda E-6 do mapa) ─────
 *
 * ┌─ A ARMADILHA, dita na ordem em que ela acontece ────────────────────────────────────────────┐
 * │ A busca conta com `count(*) over ()` e corta com `.limit(limite)` sobre LINHAS DE CANDIDATO. │
 * │ Resolver o funil com JOIN na consulta paginada troca as duas coisas ao mesmo tempo: `total`  │
 * │ passa a contar CANDIDATURAS e o `limite` passa a cortar CANDIDATURAS.                        │
 * │                                                                                              │
 * │ Com o maximo medido em producao, 118 candidaturas numa unica pessoa, uma pagina de 200       │
 * │ poderia entregar DUAS PESSOAS, e o `truncado` mentiria na direcao contraria a que a Frente D │
 * │ consertou: a tela diria "mostrando 200 de 73.000" enquanto exibe duas linhas de gente.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A REGRA QUE ISTO TRAVA: o funil vem em SEGUNDA consulta, por `candidato_id in (ids da pagina)`,
 * NUNCA por join na consulta paginada.
 *
 * O banco fingido deste arquivo expande as linhas quando a consulta paginada tem join, exatamente
 * como o Postgres faria, e e por isso que estes testes MORREM com o conserto feito por join em vez
 * de passarem por descuido.
 */

/** A pessoa pesada: 118 candidaturas, que e o maximo medido na producao. */
function candidaturasEmLote(candidatoId: string, quantas: number, de = 0): CandidaturaFingida[] {
  return Array.from({ length: quantas }, (_, i) => ({
    id: `${candidatoId}-cand-${de + i}`,
    candidatoId,
    vagaId: `vaga-${de + i}`,
    vagaCodigo: `${900000 + de + i}`,
    vagaNome: `Vaga ${de + i}`,
  }));
}

function cenarioDeTresPessoasPesadas() {
  return bancoDaBuscaComFunil({
    pessoas: [
      { id: "pessoa-1", nome: "Primeira Pessoa" },
      { id: "pessoa-2", nome: "Segunda Pessoa" },
      { id: "pessoa-3", nome: "Terceira Pessoa" },
    ],
    candidaturas: [
      ...candidaturasEmLote("pessoa-1", 118),
      ...candidaturasEmLote("pessoa-2", 7, 200),
      ...candidaturasEmLote("pessoa-3", 3, 300),
    ],
  });
}

describe("o limite corta PESSOAS, e o total conta PESSOAS", () => {
  it("pagina de 2, com gente de 118 candidaturas, devolve 2 PESSOAS distintas", async () => {
    const { service } = cenarioDeTresPessoasPesadas();
    const pagina = await service.buscar({ limite: 2 });

    expect(
      pagina.itens,
      "com join na consulta paginada, o limite corta candidaturas: a pagina de 2 vira duas linhas da MESMA pessoa.",
    ).toHaveLength(2);
    expect(new Set(pagina.itens.map((i) => i.id)).size, "pessoa repetida na pagina.").toBe(2);
    expect(pagina.itens.map((i) => i.id)).toEqual(["pessoa-1", "pessoa-2"]);
  });

  it("`total` conta PESSOAS (3), e nunca candidaturas (128)", async () => {
    const { service } = cenarioDeTresPessoasPesadas();
    const pagina = await service.buscar({ limite: 2 });

    expect(
      pagina.total,
      "`count(*) over ()` sobre linhas com join conta candidaturas, e a tela passa a dizer 'mostrando 2 de 128'.",
    ).toBe(3);
    expect(pagina.truncado).toBe(true);
  });

  it("cabendo todas as pessoas na pagina, `truncado` e falso mesmo com 128 candidaturas", async () => {
    const { service } = cenarioDeTresPessoasPesadas();
    const pagina = await service.buscar({ limite: 200 });

    expect(pagina.itens).toHaveLength(3);
    expect(pagina.total).toBe(3);
    expect(pagina.truncado, "o corte passou a ser medido em candidatura, nao em pessoa.").toBe(
      false,
    );
  });

  it("a pessoa de 118 candidaturas recebe as 118 no funil, sem o limite da pagina cortar nenhuma", async () => {
    const { service } = cenarioDeTresPessoasPesadas();
    const pagina = await service.buscar({ limite: 2 });

    expect(pagina.itens[0]!.candidaturas).toHaveLength(118);
    expect(pagina.itens[1]!.candidaturas).toHaveLength(7);
  });

  /** A trava estrutural da regra, para o caminho nao voltar por refatoracao. */
  it("a consulta PAGINADA nao tem join com `as_candidaturas`", async () => {
    const cenario = cenarioDeTresPessoasPesadas();
    await cenario.service.buscar({ limite: 2 });

    const paginada = cenario.paginada;
    expect(paginada, "nenhuma consulta levou `limit`: a paginacao sumiu.").toBeDefined();
    expect(
      paginada!.joins.map((j) => j.tabela),
      "join de candidatura na consulta que tem o `limit` e a armadilha E-6 do mapa.",
    ).not.toContain("as_candidaturas");
  });

  it("o funil e uma SEGUNDA consulta, filtrada pelos ids DESTA pagina e so eles", async () => {
    const cenario = cenarioDeTresPessoasPesadas();
    await cenario.service.buscar({ limite: 2 });

    const funil = cenario.doFunil;
    expect(
      funil,
      "nenhuma consulta leu `as_candidaturas`: o funil nao veio do servidor.",
    ).toBeDefined();
    expect(funil!.where).toContain("pessoa-1");
    expect(funil!.where).toContain("pessoa-2");
    expect(
      funil!.where,
      "a segunda consulta pediu candidatura de quem nao esta na pagina: e varredura, nao paginacao (§A.6).",
    ).not.toContain("pessoa-3");
  });

  /**
   * O NUMERO DE CONSULTAS NAO CRESCE COM O TAMANHO DA PAGINA. A assercao e sobre CRESCIMENTO, e nao
   * sobre um numero fixo: uma terceira consulta constante (as vagas, por exemplo) e escolha de
   * implementacao e nao defeito. Uma consulta POR PESSOA e o mesmo defeito do painel por vaga, com
   * outro nome, e e isso que esta travado aqui.
   */
  it("o numero de consultas nao cresce com a quantidade de pessoas", async () => {
    const tres = cenarioDeTresPessoasPesadas();
    await tres.service.buscar({ limite: 200 });

    const muitas = bancoDaBuscaComFunil({
      pessoas: Array.from({ length: 40 }, (_, i) => ({ id: `p-${i}`, nome: `Pessoa ${i}` })),
      candidaturas: Array.from({ length: 40 }, (_, i) => ({
        id: `c-${i}`,
        candidatoId: `p-${i}`,
        vagaId: `v-${i}`,
      })),
    });
    await muitas.service.buscar({ limite: 200 });

    expect(muitas.consultas.length).toBe(tres.consultas.length);
  });
});

/**
 * ─ PESSOA SEM CANDIDATURA CONTINUA EXISTINDO ────────────────────────────────────────────────────
 *
 * Medido na producao em 02/10/2026: existe EXATAMENTE UMA pessoa em 59.961 sem nenhuma candidatura,
 * "Gizele Alves", com CPF, origem PANDAPE. A busca de hoje e `from as_candidatos` SEM join, entao
 * ela e encontravel por nome e aparece como "Vaga Nao Alocada" legitimamente, porque de fato nao
 * esta em vaga nenhuma. Pessoa na base sem vaga e estado LEGITIMO.
 *
 * Se o conserto do funil virar um join, ela desaparece da busca: quem procurar por ela recebe
 * "nenhum candidato encontrado", que e uma resposta sobre a BASE, e o time cadastra de novo alguem
 * que ja existe. Este arquivo e o que pega isso.
 */
describe("quem nao tem candidatura nenhuma continua na lista", () => {
  function cenarioComGizele() {
    return bancoDaBuscaComFunil({
      pessoas: [
        { id: "gizele", nome: "Gizele Alves", temCpf: true, origem: "PANDAPE" },
        { id: "pessoa-2", nome: "Outra Pessoa" },
      ],
      candidaturas: [{ id: "cand-1", candidatoId: "pessoa-2", vagaId: "vaga-1" }],
    });
  }

  it("ela aparece na pagina, e o total conta as duas pessoas", async () => {
    const { service } = cenarioComGizele();
    const pagina = await service.buscar({});

    expect(
      pagina.itens.map((i) => i.id),
      "join interno com candidatura APAGA da busca quem nao esta em vaga nenhuma.",
    ).toContain("gizele");
    expect(pagina.total).toBe(2);
  });

  it("ela vem com o funil VAZIO, e nao com o funil ausente", async () => {
    const { service } = cenarioComGizele();
    const pagina = await service.buscar({});
    const dela = pagina.itens.find((i) => i.id === "gizele");

    expect(
      dela!.candidaturas,
      "lista vazia e a resposta certa: a tela pinta 'Vaga Nao Alocada' por um fato, nao por ausencia de dado.",
    ).toEqual([]);
  });

  it("buscando so por ela, a pagina traz uma pessoa e nao uma lista vazia", async () => {
    const { service } = bancoDaBuscaComFunil({
      pessoas: [{ id: "gizele", nome: "Gizele Alves" }],
      candidaturas: [],
    });
    const pagina = await service.buscar({ nome: "gizele" });

    expect(pagina.itens).toHaveLength(1);
    expect(pagina.total).toBe(1);
    expect(pagina.itens[0]!.candidaturas).toEqual([]);
  });
});
