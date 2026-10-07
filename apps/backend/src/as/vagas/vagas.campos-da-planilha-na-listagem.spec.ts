import { describe, expect, it, vi } from "vitest";
import { VagasService } from "./vagas.service";
import { vagas } from "../../db/schema";
import { PROCEDENCIA_DA_PLANILHA } from "../../domain/as-planilha-prepreenchimento";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ A LISTAGEM DIZ QUAIS CAMPOS DA VAGA VIERAM DA PLANILHA (`camposVindosDaPlanilha`) ────────────
 *
 * O QUE MUDOU: o item da listagem passou a carregar a lista de NOMES DE CAMPO cuja coluna de
 * procedência está em `PLANILHA`, derivada das cinco colunas `*_origem` que a 0146 criou. É o que
 * permite a tela MARCAR o campo pré-preenchido, em vez de apresentá-lo como se alguém o tivesse
 * digitado.
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. A LISTA É DERIVADA DA PROCEDÊNCIA, campo por campo, e não "coluna preenchida": vaga com os
 *      cinco carimbos devolve os cinco nomes, vaga com um devolve um.
 *   2. VAZIO, NUNCA NULO NEM OMITIDO. Sem o `[]`, a tela não distingue "nada veio da planilha" de
 *      "não sei", que é a mesma razão pela qual o retrato da ponte do funil também devolve vazio.
 *   3. SEM N+1 e sem consulta nova: as cinco colunas já vêm no `select` que monta o item, então a
 *      listagem continua fazendo UMA consulta a `vagas` para a página inteira.
 *   4. SÓ NOME DE CAMPO (§A.6). O texto cru da célula da planilha não tem caminho até aqui.
 */

const AGORA = new Date("2026-10-07T12:00:00.000Z");

/** A linha como o `select` da listagem a entrega: `v` é a linha INTEIRA de `vagas`. */
function linhaDeVaga(id: string, origens: Record<string, string | null>) {
  return {
    v: {
      id,
      codigo: `PS-${id}`,
      nomeDivulgacao: `PS-${id}`,
      status: "PENDENTE_REVISAO",
      posicoesOficiais: 1,
      posicoesBanco: 0,
      vagasFechadas: null,
      vagasFechadasBanco: null,
      escolaridade: null,
      regioes: [],
      idiomas: [],
      testes: [],
      etapasPs: [],
      criadoEm: AGORA,
      /* As cinco colunas de procedência, que é o que o caso de teste varia. */
      naturezaOrigem: null,
      linhaServicoOrigem: null,
      cargoOrigem: null,
      dataAberturaOrigem: null,
      dataLimiteOrigem: null,
      ...origens,
    },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
  };
}

function makeDb(linhas: ReturnType<typeof linhaDeVaga>[]) {
  const consultasPorTabela = new Map<unknown, number>();
  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    const resultado = () => (tabela === vagas ? linhas : []);
    b.from = (t: unknown) => {
      tabela = t;
      consultasPorTabela.set(t, (consultasPorTabela.get(t) ?? 0) + 1);
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.orderBy = () => Promise.resolve(resultado());
    b.groupBy = () => Promise.resolve(resultado());
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(resultado()).then(r);
    return b;
  });
  const db = { select };
  return {
    service: new VagasService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
    ),
    consultasPorTabela,
  };
}

const TODAS_AS_ORIGENS = {
  naturezaOrigem: PROCEDENCIA_DA_PLANILHA,
  linhaServicoOrigem: PROCEDENCIA_DA_PLANILHA,
  cargoOrigem: PROCEDENCIA_DA_PLANILHA,
  dataAberturaOrigem: PROCEDENCIA_DA_PLANILHA,
  dataLimiteOrigem: PROCEDENCIA_DA_PLANILHA,
};

describe("GET /as/vagas: os campos que vieram da planilha", () => {
  it("vaga com as cinco procedências em PLANILHA devolve os cinco nomes, em ordem estável", async () => {
    const { service } = makeDb([linhaDeVaga("1", TODAS_AS_ORIGENS)]);
    const [v] = await service.list();
    expect(v.camposVindosDaPlanilha).toEqual([
      "natureza",
      "linhaServico",
      "cargo",
      "dataAbertura",
      "dataLimite",
    ]);
  });

  /** A vaga digitada à mão: as cinco colunas nulas. VAZIO é a resposta, e ela não é ausência. */
  it("vaga sem procedência nenhuma devolve array VAZIO, nunca nulo nem omitido", async () => {
    const { service } = makeDb([linhaDeVaga("2", {})]);
    const [v] = await service.list();
    expect(v.camposVindosDaPlanilha).toEqual([]);
    expect(v.camposVindosDaPlanilha).not.toBeNull();
  });

  /** A abstenção é POR CAMPO: um carimbo não arrasta os outros quatro. */
  it("vaga com só o cargo carimbado devolve só o cargo", async () => {
    const { service } = makeDb([linhaDeVaga("3", { cargoOrigem: PROCEDENCIA_DA_PLANILHA })]);
    const [v] = await service.list();
    expect(v.camposVindosDaPlanilha).toEqual(["cargo"]);
  });

  /**
   * O VOCABULÁRIO É FECHADO, e não "coluna preenchida": o CHECK da 0146 tem um valor só hoje, mas
   * existe para o segundo ter de passar por alguém. Procedência desconhecida NÃO marca o campo.
   */
  it("procedência fora do vocabulário não marca o campo", async () => {
    const { service } = makeDb([linhaDeVaga("4", { naturezaOrigem: "ATS" })]);
    const [v] = await service.list();
    expect(v.camposVindosDaPlanilha).toEqual([]);
  });

  /**
   * SEM N+1: a derivação é por LOTE porque as colunas já vêm na consulta da página. Três vagas, UMA
   * consulta a `vagas`. É o defeito conhecido desta casa, e a fila tem centenas de linhas.
   */
  it("deriva a lista das três vagas com UMA consulta só a vagas", async () => {
    const { service, consultasPorTabela } = makeDb([
      linhaDeVaga("1", TODAS_AS_ORIGENS),
      linhaDeVaga("2", {}),
      linhaDeVaga("3", { dataLimiteOrigem: PROCEDENCIA_DA_PLANILHA }),
    ]);
    const itens = await service.list();
    expect(itens.map((i) => i.camposVindosDaPlanilha)).toEqual([
      ["natureza", "linhaServico", "cargo", "dataAbertura", "dataLimite"],
      [],
      ["dataLimite"],
    ]);
    expect(consultasPorTabela.get(vagas)).toBe(1);
  });
});
