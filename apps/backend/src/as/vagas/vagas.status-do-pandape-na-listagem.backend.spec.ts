import { describe, expect, it, vi } from "vitest";
import { VagasService } from "./vagas.service";
import { vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ A LISTAGEM SERVE O STATUS DA VAGA **NO ATS** (`statusPandape`), E ELE CHEGA CRU ──────────────
 *
 * ┌─ POR QUE ESTE CAMPO EXISTE, E POR QUE ELE TEM DE CHEGAR AO NAVEGADOR ───────────────────────┐
 * │ A ingestao do Digai cria vaga-espelho so para pendurar candidatura, e as que o rastreio       │
 * │ alcanca estao TODAS ENCERRADAS no Pandape (medido em 08/10/2026: 13 vagas em branco, 223      │
 * │ candidaturas dentro, as 7 alcancaveis em status 3). Sem o campo na listagem, o time ve uma    │
 * │ vaga comum na fila e nao sabe que ha gente pendurada em algo que ja acabou. A coluna
 * │ (`vagas.status_pandape`, migration 0152) ja era escrita pelo rastreio e ja vinha na consulta: │
 * │ o que faltava era a linha do MAPEAMENTO, e e exatamente isso que este arquivo trava.          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS TRES COISAS QUE SE PROVA AQUI:
 *  1. O NUMERO CHEGA, cru, no item da listagem (e a listagem alimenta a Central de Vagas E a fila
 *     de revisao, que reusa o mesmo item);
 *  2. NULO CHEGA COMO NULO, e nao como zero nem string vazia: nulo e "o ATS ainda nao disse", e a
 *     tela nao renderiza tag; um zero de conveniencia viraria "Status 0 No ATS" em centenas de
 *     linhas;
 *  3. NAO SE TRADUZ NO BACKEND: nenhum rotulo de status do ATS sai daqui. O rotulo e
 *     `rotuloDoStatusDoPandape`, no contrato compartilhado, e dois dicionarios do mesmo rotulo
 *     divergem no primeiro valor novo do fornecedor.
 *
 * §A.6: numero de estado de uma VAGA no ATS. Nenhum dado de pessoa.
 */

const AGORA = new Date("2026-10-08T12:00:00.000Z");

/** A linha como o `select` da listagem a entrega: `v` e a linha INTEIRA de `vagas`. */
function linhaDeVaga(id: string, statusPandape: number | null) {
  return {
    v: {
      id,
      codigo: `PS-${id}`,
      nomeDivulgacao: `PS-${id}`,
      status: "PENDENTE_REVISAO",
      idVacancyPandape: `90000${id}`,
      statusPandape,
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
      naturezaOrigem: null,
      linhaServicoOrigem: null,
      cargoOrigem: null,
      dataAberturaOrigem: null,
      dataLimiteOrigem: null,
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
  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    const resultado = () => (tabela === vagas ? linhas : []);
    b.from = (t: unknown) => {
      tabela = t;
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
  return new VagasService(
    { select } as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
  );
}

describe("GET /as/vagas: o status da vaga no ATS chega ao item da listagem", () => {
  it("o numero CHEGA, cru, exatamente como esta na coluna", async () => {
    /*
     * MUTANTE QUE ISTO MATA: a coluna existir, o rastreio escreve-la e o mapeamento nao a servir,
     * que era o estado medido pelo agente de frontend (ele parou em vez de inventar acesso por
     * `cast`, e estava certo). Teste de banco nao pega isso: a escrita estava certa.
     */
    const service = makeDb([linhaDeVaga("1", 3)]);

    const [v] = await service.list();

    expect(v?.statusPandape, "o status do ATS nao chegou ao item da listagem").toBe(3);
  });

  it("e chega CRU para QUALQUER valor do fornecedor, inclusive um que nao conhecemos", async () => {
    /*
     * O vocabulario e DELE (medido: 3 = encerrada em 6.408 vagas, 2 = ativa em 507, 1 em 29) e pode
     * crescer sem aviso. Numero desconhecido tem de atravessar: quem decide o que mostrar e o
     * rotulo do contrato compartilhado, que diz "Status N No ATS" em vez de inventar nome.
     */
    const service = makeDb([linhaDeVaga("2", 2), linhaDeVaga("3", 7)]);

    const itens = await service.list();

    expect(itens.map((i) => i.statusPandape)).toEqual([2, 7]);
  });

  it("NULO chega como NULO: nao vira zero, nem string vazia, nem desaparece do item", async () => {
    /*
     * ┌─ NULO TEM SIGNIFICADO PROPRIO, E PERDE-LO E PIOR DO QUE NAO TER O CAMPO ────────────────┐
     * │ Nulo e "o ATS ainda nao disse": vaga manual, vaga da carga historica, vaga que a lista do │
     * │ Pandape nao tem (cinco das 13 medidas estao nesse caso). A tela NAO renderiza tag nesse   │
     * │ estado. Um `?? 0` de conveniencia no mapeamento escreveria "Status 0 No ATS" em todas as  │
     * │ 546 vagas de hoje, e nada ficaria vermelho.                                               │
     * │                                                                                          │
     * │ A CHAVE TAMBEM TEM DE EXISTIR: campo omitido e `undefined`, e `undefined` em JSON         │
     * │ DESAPARECE na serializacao. A tela nao distinguiria "o ATS nao disse" de "o backend ainda │
     * │ nao serve o campo", que sao coisas diferentes e exigem conserto em lugares diferentes.    │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const service = makeDb([linhaDeVaga("4", null)]);

    const [v] = await service.list();

    expect(v?.statusPandape, "o nulo virou zero ou texto").toBeNull();
    expect(Object.keys(v ?? {}), "a chave sumiu do item").toContain("statusPandape");
  });

  it("e o backend NAO traduz: nenhum rotulo de status do ATS sai da listagem", async () => {
    /*
     * MUTANTE QUE ISTO MATA: `statusPandapeRotulo: vaga.statusPandape === 3 ? "Encerrada" : ...`
     * acrescentado "para a tela nao precisar do dicionario". Seriam DOIS dicionarios do mesmo
     * rotulo, e o do backend e o que ninguem lembraria de atualizar.
     */
    const service = makeDb([linhaDeVaga("5", 3)]);

    const [v] = await service.list();

    const textos = JSON.stringify(v ?? {});
    for (const rotulo of ["Encerrada", "ENCERRADA", "No ATS", "Ativa no ATS"]) {
      expect(textos, `a listagem traduziu o status do ATS (${rotulo})`).not.toContain(rotulo);
    }
    expect(Object.keys(v ?? {})).not.toContain("statusPandapeRotulo");
  });
});
