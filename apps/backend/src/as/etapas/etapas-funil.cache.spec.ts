import { describe, expect, it } from "vitest";
import { EtapasFunilService } from "./etapas-funil.service";
import {
  bancoFingido,
  comoLista,
  etapasSemente,
  metodo,
  type Estado,
  type LinhaEtapa,
} from "./etapas-funil.fake-db";

/**
 * ─ O CACHE DO CATÁLOGO É INVALIDADO EM TODA ESCRITA, e este é o defeito clássico do desenho ─────
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2).
 *
 * ┌─ POR QUE O CACHE EXISTE, e por que ele é justamente a peça que costuma sair errada ────────┐
 * │ O catálogo tem 5 a 10 linhas e é lido em TODA mudança de etapa, para validar o código que    │
 * │ chegou. Consultar o banco a cada validação seria uma consulta por requisição para um dado    │
 * │ que muda uma vez por mês, e é por isso que o desenho pede cache em memória.                  │
 * │                                                                                             │
 * │ O DEFEITO QUE ELE TRAZ JUNTO: o diretor cadastra a etapa, a tela recarrega, e a etapa NÃO    │
 * │ está lá. Ou pior: ele INATIVA a etapa, ela some da tela, e a validação continua aceitando o  │
 * │ código dela porque o cache não foi avisado. Nada falha, nada é logado, e o time conclui que  │
 * │ "o sistema demora para atualizar".                                                           │
 * │                                                                                             │
 * │ A PROPRIEDADE, e é a única coisa que estes casos afirmam: TODA ESCRITA APARECE NA LEITURA    │
 * │ SEGUINTE. Não se afirma que existe cache, nem como ele é invalidado. Serviço sem cache        │
 * │ nenhum passa por aqui, e deve passar mesmo: a régua é o resultado.                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A LEITURA VEM SEMPRE ANTES DA ESCRITA em todo caso deste arquivo, e isso é deliberado: é a
 * primeira leitura que POVOA o cache. Escrever antes de ler faria o cache nascer já correto e o
 * teste passaria verde com a invalidação removida, que é o contrário do que se quer.
 */

function comCatalogo(cenario: Partial<Estado> = {}) {
  const etapas = cenario.etapas ?? etapasSemente();
  const { db, estado } = bancoFingido({
    etapas,
    candidaturas: cenario.candidaturas ?? [],
    historico: cenario.historico ?? [],
  });
  const service = new EtapasFunilService(db as never);
  return {
    estado,
    service,
    listar: metodo(service, ["listar", "list"]),
    criar: metodo(service, ["criar", "create", "adicionar"]),
    renomear: metodo(service, ["renomear", "atualizar", "editar", "update"]),
    reordenar: metodo(service, ["reordenar", "definirOrdem", "ordenar", "reordenarEtapas"]),
    inativar: metodo(service, ["inativar", "desativar", "remover", "remove"]),
    definirInicial: metodo(service, [
      "definirInicial",
      "definirEtapaInicial",
      "marcarInicial",
      "definirInicialDoFunil",
    ]),
  };
}

function codigos(lista: Record<string, unknown>[]): string[] {
  return lista.map((e) => String(e.codigo));
}

function corpo(ids: number[]): number[] & { ids: number[] } {
  return Object.assign([...ids], { ids: [...ids] });
}

describe("toda escrita aparece na leitura seguinte", () => {
  it("CRIAR: a etapa nova está na lista logo depois de nascer", async () => {
    const c = comCatalogo();
    expect(codigos(comoLista(await c.listar()))).not.toContain("DINAMICA");

    await c.criar({ rotulo: "Dinâmica", tom: "in" });

    expect(codigos(comoLista(await c.listar()))).toContain("DINAMICA");
  });

  it("RENOMEAR: o rótulo novo sai na leitura, e o CÓDIGO continua o mesmo", async () => {
    const c = comCatalogo();
    const antes = comoLista(await c.listar());
    const alvo = antes.find((e) => e.codigo === "TRIAGEM") as Record<string, unknown>;

    await c.renomear(Number(alvo.id), { rotulo: "Triagem Inicial" });

    const depois = comoLista(await c.listar());
    const linha = depois.find((e) => e.codigo === "TRIAGEM");
    expect(linha, "o código é a IDENTIDADE e não pode mudar no rename").toBeDefined();
    expect(linha?.rotulo).toBe("Triagem Inicial");
  });

  it("REORDENAR: a ordem nova sai na leitura seguinte", async () => {
    const c = comCatalogo();
    const antes = comoLista(await c.listar());
    const ids = antes.map((e) => Number(e.id));

    await c.reordenar(corpo([...ids].reverse()));

    const depois = comoLista(await c.listar());
    const porId = new Map(depois.map((e) => [Number(e.id), Number(e.ordem)]));
    expect(porId.get(ids[ids.length - 1])).toBe(1);
    expect(porId.get(ids[0])).toBe(ids.length);
  });

  /**
   * INATIVAR É O CASO MAIS CARO DOS QUATRO: enquanto o cache não for avisado, a etapa continua
   * sendo oferecida no seletor e continua sendo aceita pela validação. O diretor tira a etapa do ar
   * e ela segue recebendo gente.
   */
  it("INATIVAR: a etapa some da leitura padrão, e continua existindo com `incluirInativas`", async () => {
    const c = comCatalogo({
      historico: [{ id: "ev1", candidaturaId: "cand1", etapaDe: "CAPTACAO", etapaPara: "TRIAGEM" }],
    });
    const antes = comoLista(await c.listar());
    const alvo = antes.find((e) => e.codigo === "TRIAGEM") as Record<string, unknown>;

    await c.inativar(Number(alvo.id));

    expect(codigos(comoLista(await c.listar()))).not.toContain("TRIAGEM");
    // E ELA CONTINUA RESOLVÍVEL, que é o motivo de inativar em vez de apagar: o histórico de quem
    // passou pela Triagem precisa do rótulo dela para sempre.
    expect(codigos(comoLista(await c.listar(true)))).toContain("TRIAGEM");
  });

  it("DEFINIR A INICIAL: a marca nova sai na leitura, e continua sendo UMA só", async () => {
    const c = comCatalogo();
    const antes = comoLista(await c.listar());
    const outra = antes.find((e) => e.inicial !== true) as Record<string, unknown>;

    await c.definirInicial(Number(outra.id));

    const depois = comoLista(await c.listar());
    const iniciais = depois.filter((e) => e.inicial === true);
    expect(iniciais).toHaveLength(1);
    expect(Number(iniciais[0].id)).toBe(Number(outra.id));
  });
});

describe("a leitura padrão do catálogo é só das ATIVAS", () => {
  it("uma etapa que já nasce inativa não aparece na lista padrão e aparece na completa", async () => {
    const etapas: LinhaEtapa[] = etapasSemente().map((e) =>
      e.codigo === "ENTREVISTA_CLIENTE" ? { ...e, ativa: false } : e,
    );
    const c = comCatalogo({ etapas });

    expect(codigos(comoLista(await c.listar()))).not.toContain("ENTREVISTA_CLIENTE");
    expect(codigos(comoLista(await c.listar(true)))).toContain("ENTREVISTA_CLIENTE");
  });
});
