import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EtapasFunilService } from "./etapas-funil.service";
import { bancoFingido, etapasSemente, metodo, type Estado, type LinhaEtapa } from "./etapas-funil.fake-db";

/**
 * ─ AS DUAS LEITURAS QUE O RESTO DO SISTEMA FAZ DO CATÁLOGO, E OS DOIS RISCOS SILENCIOSOS ────────
 *
 * ESCRITO CONTRA O REQUISITO (§A.40, regra 2). Este arquivo NÃO cobre o gerenciador: cobre as
 * SEMENTES de erro que o desenho listou como riscos 1 e 2, e que nenhum teste de CRUD alcança,
 * porque nenhuma das duas falha com erro. As duas passam a MENTIR, calada.
 *
 * ┌─ RISCO 1: A ORDEM DO FUNIL, QUE ERA `indexOf` DE UMA CONSTANTE ────────────────────────────┐
 * │ Quatro pontos ordenavam por `CANDIDATURA_ETAPAS.indexOf(...)`: a fila de pendentes do        │
 * │ fechamento da vaga, o painel da vaga, a coluna Etapa e os cards do mover. Com a lista virando │
 * │ dado, um `indexOf` sobre QUALQUER outra lista continua compilando e passa a ordenar errado.   │
 * │ Pior: `indexOf` devolve `-1` para o que não acha, e -1 é MENOR que tudo, então a etapa        │
 * │ INATIVA (que continua gravada em quem passou por ela) seria jogada para ANTES da primeira     │
 * │ etapa do funil, invertendo a fila que existe para mostrar quem está mais perto do fim.        │
 * │                                                                                             │
 * │ POR ISSO O MAPA DE ORDEM INCLUI AS INATIVAS. Não é generosidade: é o único jeito de a etapa  │
 * │ aposentada continuar tendo LUGAR no funil em vez de virar buraco.                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ RISCO 2: A ETAPA DE NASCIMENTO TINHA TRÊS DONOS ──────────────────────────────────────────┐
 * │ Ela era (1) o DEFAULT da coluna no banco, (2) uma constante escrita à mão no estado inicial  │
 * │ do modal de cadastro e (3), agora, a coluna `inicial` do catálogo. Três fontes que            │
 * │ concordavam por coincidência, e a do banco capaz de apontar para uma etapa que o diretor      │
 * │ INATIVOU: a candidatura nasceria numa etapa que não existe mais para ninguém.                 │
 * │                                                                                             │
 * │ A PROPRIEDADE, e ela vale com qualquer implementação: a etapa de nascimento é a MARCADA, e   │
 * │ NUNCA é uma inativa.                                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A TERCEIRA LEITURA, que substituiu os DOIS `@IsIn` estáticos (o de mover uma e o de mover em
 * lote): a guarda que pergunta ao catálogo se a etapa existe e está ativa. Converter só um dos dois
 * deixaria o LOTE aceitando etapa que não existe mais, para trinta pessoas de uma vez.
 */

function comCatalogo(etapas: LinhaEtapa[] = etapasSemente(), resto: Partial<Estado> = {}) {
  const { db, estado } = bancoFingido({
    etapas,
    candidaturas: resto.candidaturas ?? [],
    historico: resto.historico ?? [],
  });
  const service = new EtapasFunilService(db as never);
  return {
    estado,
    service,
    inicial: metodo(service, ["etapaInicial", "inicial", "etapaDeNascimento"]),
    ordemPorCodigo: metodo(service, ["ordemPorCodigo", "ordemDoFunil", "ordens"]),
    exigirAtiva: metodo(service, ["exigirEtapaAtiva", "validarEtapa", "exigirEtapa"]),
    codigosAtivos: metodo(service, ["codigosAtivos", "ativos"]),
  };
}

function comInicialEm(codigo: string, alterar: Partial<LinhaEtapa> = {}): LinhaEtapa[] {
  return etapasSemente().map((e) => ({
    ...e,
    ...(e.codigo === codigo ? { inicial: true, ...alterar } : { inicial: false }),
  }));
}

async function erroDe(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

describe("risco 2: a etapa de nascimento é a MARCADA, e tem um dono só", () => {
  it("é a marcada `inicial`, e não a de menor ordem", async () => {
    const c = comCatalogo(comInicialEm("ENTREVISTA_SOULAN"));

    const etapa = (await c.inicial()) as LinhaEtapa;

    expect(etapa.codigo).toBe("ENTREVISTA_SOULAN");
  });

  /**
   * O CASO QUE O DEFAULT DO BANCO PRODUZIA: a marca ficou numa etapa INATIVADA. Nascer nela é
   * nascer num lugar que sumiu de todos os seletores, e a pessoa entra invisível no funil.
   * Recusar alto ou cair numa ATIVA, os dois servem; devolver a inativa, não.
   */
  it("NUNCA devolve uma etapa inativa", async () => {
    const c = comCatalogo(comInicialEm("TRIAGEM", { ativa: false }));

    const r = await erroDe(async () => {
      const etapa = (await c.inicial()) as LinhaEtapa;
      expect(etapa.ativa, "a candidatura nasceria numa etapa inativada").toBe(true);
    });

    if (r) expect(r, "a recusa precisa ser legível, não um erro cru").toBeInstanceOf(HttpException);
  });

  it("com NENHUMA marcada, não devolve etapa inativa nem inventa uma que não está no catálogo", async () => {
    const c = comCatalogo(etapasSemente().map((e) => ({ ...e, inicial: false })));

    const r = await erroDe(async () => {
      const etapa = (await c.inicial()) as LinhaEtapa;
      expect(etapa.ativa).toBe(true);
      expect(c.estado.etapas.some((e) => e.codigo === etapa.codigo)).toBe(true);
    });

    if (r) expect(r).toBeInstanceOf(HttpException);
  });
});

describe("risco 1: a ordem do funil sai da coluna `ordem`, e a inativa não vira buraco", () => {
  it("o mapa de ordem reflete a coluna, e não a ordem de chegada da consulta", async () => {
    const etapas = etapasSemente().map((e) =>
      e.codigo === "APROVACAO" ? { ...e, ordem: 1 } : { ...e, ordem: e.ordem + 1 },
    );
    const c = comCatalogo(etapas);

    const mapa = (await c.ordemPorCodigo()) as ReadonlyMap<string, number>;

    expect(mapa.get("APROVACAO")).toBe(1);
    expect(mapa.get("APROVACAO")).toBeLessThan(mapa.get("CAPTACAO") as number);
  });

  /**
   * A ETAPA INATIVA PRECISA TER LUGAR NO MAPA. Sem ela, quem ordena não acha o código gravado na
   * candidatura antiga, e o valor ausente (ou o `-1` do `indexOf`) a joga para o começo da fila: a
   * pessoa que estava mais perto do fim do funil aparece como se estivesse na entrada.
   */
  it("a etapa INATIVA continua no mapa de ordem, com o lugar dela", async () => {
    const etapas = etapasSemente().map((e) =>
      e.codigo === "ENTREVISTA_CLIENTE" ? { ...e, ativa: false } : e,
    );
    const c = comCatalogo(etapas);

    const mapa = (await c.ordemPorCodigo()) as ReadonlyMap<string, number>;

    expect(mapa.get("ENTREVISTA_CLIENTE")).toBe(4);
    expect(mapa.get("ENTREVISTA_CLIENTE")).toBeGreaterThan(mapa.get("TRIAGEM") as number);
    expect(mapa.get("ENTREVISTA_CLIENTE")).toBeLessThan(mapa.get("APROVACAO") as number);
  });

  /** A ETAPA NOVA CRIADA NO MEIO DO FUNIL: o caso que o desenho pediu por nome. */
  it("uma etapa nova NO MEIO do funil fica entre as vizinhas, sem ninguém tocar as telas", async () => {
    const etapas: LinhaEtapa[] = [
      ...etapasSemente().map((e) => (e.ordem >= 3 ? { ...e, ordem: e.ordem + 1 } : e)),
      { id: 9, codigo: "DINAMICA", rotulo: "Dinâmica", ordem: 3, tom: "wn", inicial: false, ativa: true },
    ];
    const c = comCatalogo(etapas);

    const mapa = (await c.ordemPorCodigo()) as ReadonlyMap<string, number>;

    expect(mapa.get("DINAMICA")).toBeGreaterThan(mapa.get("TRIAGEM") as number);
    expect(mapa.get("DINAMICA")).toBeLessThan(mapa.get("ENTREVISTA_SOULAN") as number);
  });
});

describe("a guarda que substituiu os DOIS `@IsIn`: a etapa tem de existir e estar ativa", () => {
  it("a etapa ATIVA passa", async () => {
    const c = comCatalogo();

    await expect(c.exigirAtiva("TRIAGEM")).resolves.toBeTruthy();
  });

  it.each([["TRIGEM"], ["captacao"], [""], ["ENTREVISTA_QUE_NAO_EXISTE"]])(
    "a etapa desconhecida %j é recusada com frase, e não com 500",
    async (codigo) => {
      const c = comCatalogo();

      const err = await erroDe(() => c.exigirAtiva(codigo));

      expect(err, `o código ${JSON.stringify(codigo)} passou pela guarda`).toBeInstanceOf(
        HttpException,
      );
      expect((err as HttpException).getStatus()).toBeLessThan(500);
    },
  );

  /**
   * MOVER PARA UMA ETAPA INATIVADA É O CASO VIVO: a tela de quem estava com a página aberta ainda
   * oferece a etapa que o diretor acabou de aposentar. A guarda é o que impede a candidatura de ir
   * parar num lugar que sumiu dos seletores.
   */
  it("a etapa INATIVA é recusada, mesmo existindo no catálogo", async () => {
    const c = comCatalogo(
      etapasSemente().map((e) => (e.codigo === "TRIAGEM" ? { ...e, ativa: false } : e)),
    );

    const err = await erroDe(() => c.exigirAtiva("TRIAGEM"));

    expect(err).toBeInstanceOf(HttpException);
  });

  it("`codigosAtivos` não devolve a inativa: é a lista que os seletores oferecem", async () => {
    const c = comCatalogo(
      etapasSemente().map((e) => (e.codigo === "TRIAGEM" ? { ...e, ativa: false } : e)),
    );

    const ativos = (await c.codigosAtivos()) as string[];

    expect(ativos).not.toContain("TRIAGEM");
    expect(ativos).toContain("CAPTACAO");
  });
});
