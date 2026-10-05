import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { VAGA_STATUS_PAPEIS_LIBERADAS } from "@ea/shared-types";
import { vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ A CENTRAL DE VAGAS MOSTRA SÓ VAGA JÁ LIBERADA (decisão do diretor, 05/10/2026) ───────────────
 *
 * COBERTURA INDEPENDENTE (§A.38/§A.39): escrito por `tester` que não construiu a frente. O REQUISITO
 * é o que está sob teste, não o desenho: `listCentral()` devolve só as vagas cujo PAPEL está em
 * `VAGA_STATUS_PAPEIS_LIBERADAS` (ABERTURA, ENTREGA, FECHAMENTO, CANCELAMENTO), e as de REVISAO,
 * RASCUNHO e LIVRE somem. A prova de §A.27 mora no caso da vaga aberta À MÃO: o recorte é por PAPEL,
 * não pelo evento de liberação, então uma ABERTA que nunca passou por REVISAO tem de aparecer.
 *
 * §A.6: nada de dado pessoal entra aqui. São códigos de status e ids sintéticos de vaga.
 *
 * ┌─ O BANCO FINGIDO ─────────────────────────────────────────────────────────────────────────────┐
 * │ Mesmo molde do `vagas.ocupacao-listagem.spec.ts`, que já prova `list()` rodando contra ele: o   │
 * │ `select` sobre `vagas` devolve as linhas no formato `{ v, ...joins }`, todo o resto devolve      │
 * │ vazio, e `execute` (a leitura da proposta de cliente da fila de revisão) devolve vazio também.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const AGORA = new Date("2026-10-05T12:00:00.000Z");

/** A linha crua da vaga, no formato `{ v, ...joins }` que a consulta da `list()` projeta. */
function linhaDeVaga(id: string, status: string) {
  return {
    v: {
      id,
      codigo: `PS-${id}`,
      nomeDivulgacao: `Vaga ${id}`,
      status,
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
    },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
  };
}

/**
 * O BANCO FINGIDO: `select` resolve as `linhas` quando a consulta é sobre `vagas`, e vazio para
 * qualquer outra tabela (benefícios, ocupação, redução de meta). `execute` e `selectDistinct`
 * devolvem vazio, que é o suficiente para a proposta de cliente e para o conjunto da liberação.
 */
function bancoFingido(linhas: ReturnType<typeof linhaDeVaga>[]) {
  const resolverLeitura = (tabela: unknown) => (tabela === vagas ? linhas : []);

  const construtor = () => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    const resultado = () => resolverLeitura(tabela);
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.orderBy = () => Promise.resolve(resultado());
    b.groupBy = () => Promise.resolve(resultado());
    b.limit = () => Promise.resolve(resultado());
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
    return b;
  };

  const db = {
    select: () => construtor(),
    selectDistinct: () => construtor(),
    execute: () => Promise.resolve([]),
  };
  return db;
}

/** O serviço com o banco fingido, o catálogo de etapas e o de status (com os ajustes de papel). */
function servicoCom(
  linhas: ReturnType<typeof linhaDeVaga>[],
  ajustesDeStatus: readonly { codigo?: string; papel?: string }[] = [],
) {
  return new VagasService(
    bancoFingido(linhas) as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido(ajustesDeStatus as never) as never,
  );
}

// Um status com papel LIVRE que NÃO é o `VAGA_BANCO` dormente: assim `statusVivoDaVaga` não o
// traduz para ABERTA, e a propriedade medida é de verdade "papel LIVRE não aparece".
const STAND_BY = { codigo: "STAND_BY", papel: "LIVRE" as const };

describe("listCentral(): a Central de Vagas mostra só vaga já liberada", () => {
  it("devolve só os papéis liberados e exclui REVISAO, RASCUNHO e LIVRE", async () => {
    const service = servicoCom(
      [
        linhaDeVaga("rev", "PENDENTE_REVISAO"),
        linhaDeVaga("rasc", "RASCUNHO"),
        linhaDeVaga("ab", "ABERTA"),
        linhaDeVaga("ent", "ENTREGUE"),
        linhaDeVaga("fec", "FECHADA"),
        linhaDeVaga("can", "CANCELADA"),
        linhaDeVaga("livre", "STAND_BY"),
      ],
      [STAND_BY],
    );

    const central = await service.listCentral();
    const ids = central.map((v) => v.id).sort();

    expect(ids, "só os quatro papéis liberados aparecem na Central").toEqual([
      "ab",
      "can",
      "ent",
      "fec",
    ]);
    expect(ids, "a espelhada do Pandapé (REVISAO) não aparece").not.toContain("rev");
    expect(ids, "o RASCUNHO não aparece").not.toContain("rasc");
    expect(ids, "o status LIVRE (Stand By) não aparece").not.toContain("livre");
  });

  /**
   * §A.27: o recorte é por PAPEL, não pelo evento REVISAO->ABERTURA. A vaga aberta À MÃO nasce
   * ABERTA sem nunca ter passado pela fila de revisão, e o banco fingido não guarda evento nenhum.
   * Ela TEM de aparecer: filtrar pelo evento de liberação a sumiria em silêncio.
   */
  it("a vaga aberta à mão (ABERTA, sem evento de liberação) aparece na Central", async () => {
    const service = servicoCom([linhaDeVaga("manual", "ABERTA")]);

    const central = await service.listCentral();

    expect(central.map((v) => v.id)).toEqual(["manual"]);
  });

  /**
   * A FONTE É ÚNICA: o filtro casa com `VAGA_STATUS_PAPEIS_LIBERADAS`, a mesma lista que o frontend
   * lê. Este caso prova que todo papel DA lista passa e nenhum de fora passa, sem repetir os códigos
   * de status à mão (eles derivam do catálogo e do papel).
   */
  it("todo papel de VAGA_STATUS_PAPEIS_LIBERADAS, e só esses, sobrevive ao filtro", async () => {
    const porPapel: Record<string, string> = {
      ABERTURA: "ABERTA",
      ENTREGA: "ENTREGUE",
      FECHAMENTO: "FECHADA",
      CANCELAMENTO: "CANCELADA",
      REVISAO: "PENDENTE_REVISAO",
      RASCUNHO: "RASCUNHO",
      LIVRE: "STAND_BY",
    };
    const linhas = Object.entries(porPapel).map(([papel, status]) => linhaDeVaga(papel, status));
    const service = servicoCom(linhas, [STAND_BY]);

    const central = await service.listCentral();
    const papeisQuePassaram = central.map((v) => v.id).sort();

    expect(papeisQuePassaram).toEqual([...VAGA_STATUS_PAPEIS_LIBERADAS].sort());
  });
});

describe("§A.27: o Liberar Vaga continua enxergando a vaga em REVISAO", () => {
  /**
   * `pendentesDeRevisao` e `liberadasDaRevisao` leem a `list()` CRUA, não a `listCentral`, então a
   * vaga em REVISAO tem de aparecer na fila de revisão E sumir da Central, NA MESMA BASE. Se o filtro
   * da Central tivesse descido para a `list()` compartilhada (o jeito errado que o código avisa não
   * ter feito), a vaga sumiria dos DOIS lugares e a fila de revisão ficaria vazia.
   */
  it("uma vaga em REVISAO aparece em pendentesDeRevisao e some de listCentral", async () => {
    const base = [linhaDeVaga("rev", "PENDENTE_REVISAO"), linhaDeVaga("ab", "ABERTA")];

    const servicoFila = servicoCom(base);
    const fila = await servicoFila.pendentesDeRevisao();
    expect(
      fila.map((v) => v.id),
      "a espelhada do Pandapé continua na fila de revisão",
    ).toEqual(["rev"]);

    const servicoCentral = servicoCom(base);
    const central = await servicoCentral.listCentral();
    expect(
      central.map((v) => v.id),
      "a mesma vaga em REVISAO não aparece na Central",
    ).toEqual(["ab"]);
  });
});
