import { HttpException } from "@nestjs/common";
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
 * ─ A ORDEM DO FUNIL É DADO, E A REESCRITA É COMPLETA OU NÃO É ───────────────────────────────────
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2).
 *
 * ┌─ POR QUE ESTE ARQUIVO É O DE MAIOR RISCO SILENCIOSO DA FRENTE ─────────────────────────────┐
 * │ A ordem do funil JÁ É LIDA COMO DADO em quatro lugares, hoje via `indexOf` de uma constante  │
 * │ que está saindo: a fila de pendentes do fechamento da vaga, o painel da vaga, a ordenação da │
 * │ coluna Etapa e a fileira de cards do mover. NENHUM deles quebra com erro quando a ordem      │
 * │ passa a mentir: eles ordenam ERRADO, em silêncio, e ninguém percebe até alguém reparar que o │
 * │ funil está de cabeça para baixo numa tela e certo em outra.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA (§3.2 do desenho):
 *   . reordenar recebe a LISTA COMPLETA de ids, na ordem nova, e reescreve `ordem = 1..N` numa
 *     transação. Não é "sobe/desce" trocando pares: dois cliques rápidos produzem ordem duplicada,
 *     e a colisão só aparece na tela do outro;
 *   . NÃO HÁ UNIQUE em `ordem`, de propósito: a reescrita passa por estados transitórios com
 *     duplicata, e um unique não postergável recusaria a própria reordenação;
 *   . lista INCOMPLETA é recusada, e a recusa NÃO PODE deixar meia reescrita gravada.
 *
 * O QUE ESTE ARQUIVO NÃO TESTA, e a razão: se a lista completa inclui as INATIVAS. Isso depende da
 * tela, que ainda não existe, então todo cenário aqui tem o catálogo INTEIRO ativo, onde "completa"
 * não é ambíguo. Fica registrado como pergunta ao construtor.
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
    reordenar: metodo(service, ["reordenar", "definirOrdem", "ordenar", "reordenarEtapas"]),
    listar: metodo(service, ["listar", "list"]),
  };
}

/**
 * O CORPO DA REORDENAÇÃO, NAS DUAS FORMAS AO MESMO TEMPO.
 *
 * O desenho pede `{ ids: [...] }` e um serviço poderia receber o array direto. O teste guarda a
 * PROPRIEDADE (a ordem final), não a forma do parâmetro, então ele manda um array que TAMBÉM
 * responde por `.ids`: as duas assinaturas lêem a mesma lista, e nenhuma das duas fica vermelha por
 * um detalhe que não é a régua.
 */
function corpo(ids: number[]): number[] & { ids: number[] } {
  return Object.assign([...ids], { ids: [...ids] });
}

function ordemPorId(estado: Estado): Record<number, number> {
  return Object.fromEntries(estado.etapas.map((e) => [e.id, e.ordem]));
}

/** A ordem é CONTÍGUA: 1..N, sem buraco e sem repetição. É a invariante da reescrita completa. */
function ordemContigua(estado: Estado): void {
  const ordens = [...estado.etapas.map((e) => e.ordem)].sort((a, b) => a - b);
  expect(ordens).toEqual(estado.etapas.map((_e, i) => i + 1));
}

async function recusaAo(fn: () => Promise<unknown>): Promise<HttpException> {
  try {
    await fn();
  } catch (e) {
    expect(e, `a recusa precisa ser HttpException, veio: ${String(e)}`).toBeInstanceOf(
      HttpException,
    );
    return e as HttpException;
  }
  throw new Error("esperava a recusa e a reordenação passou");
}

describe("reordenar reescreve 1..N, na ordem pedida", () => {
  it("a lista completa invertida deixa a ordem contígua e na ordem nova", async () => {
    const c = comCatalogo();
    const ids = c.estado.etapas.map((e) => e.id);

    await c.reordenar(corpo([...ids].reverse()));

    ordemContigua(c.estado);
    const ordens = ordemPorId(c.estado);
    // O ÚLTIMO virou o primeiro, e o primeiro virou o último: a régua é a POSIÇÃO NA LISTA.
    expect(ordens[ids[ids.length - 1]]).toBe(1);
    expect(ordens[ids[0]]).toBe(ids.length);
  });

  it("uma etapa puxada para o meio: só a posição dela e a de quem foi empurrado mudam de valor", async () => {
    const c = comCatalogo();
    const [a, b, d, e, f] = c.estado.etapas.map((x) => x.id);

    await c.reordenar(corpo([a, f, b, d, e]));

    ordemContigua(c.estado);
    expect(ordemPorId(c.estado)).toEqual({ [a]: 1, [f]: 2, [b]: 3, [d]: 4, [e]: 5 });
  });

  /**
   * A ORDEM DE PARTIDA ESBURACADA (10, 20, 30) é o estado que sobra de qualquer carga feita à mão.
   * A reescrita completa é o que a conserta, e é por isso que ela é COMPLETA e não incremental.
   */
  it("partindo de ordens esburacadas, a reescrita as normaliza para 1..N", async () => {
    const etapas: LinhaEtapa[] = [
      { id: 1, codigo: "CAPTACAO", rotulo: "Captação", ordem: 10, tom: "nt", inicial: true, ativa: true },
      { id: 2, codigo: "TRIAGEM", rotulo: "Triagem", ordem: 20, tom: "in", inicial: false, ativa: true },
      { id: 3, codigo: "APROVACAO", rotulo: "Aprovação", ordem: 30, tom: "ok", inicial: false, ativa: true },
    ];
    const c = comCatalogo(etapas);

    await c.reordenar(corpo([3, 1, 2]));

    ordemContigua(c.estado);
    expect(ordemPorId(c.estado)).toEqual({ 3: 1, 1: 2, 2: 3 });
  });

  /**
   * A REESCRITA PASSA POR ESTADOS DUPLICADOS, e isso NÃO é erro: não há unique em `ordem`. Trocar
   * duas etapas de lugar é o movimento mais comum da tela e o que mais rápido produziria a colisão
   * se alguém decidisse criar o índice único "por segurança".
   */
  it("trocar duas etapas de lugar funciona, mesmo passando por ordem duplicada no meio", async () => {
    const c = comCatalogo();
    const ids = c.estado.etapas.map((e) => e.id);
    const trocado = [ids[1], ids[0], ...ids.slice(2)];

    await c.reordenar(corpo(trocado));

    ordemContigua(c.estado);
    expect(ordemPorId(c.estado)[ids[1]]).toBe(1);
    expect(ordemPorId(c.estado)[ids[0]]).toBe(2);
  });

  it("a leitura seguinte devolve a ordem nova, e não a de antes", async () => {
    const c = comCatalogo();
    const ids = c.estado.etapas.map((e) => e.id);

    await c.reordenar(corpo([...ids].reverse()));
    const lista = comoLista(await c.listar());

    const porId = new Map(lista.map((e) => [Number(e.id), Number(e.ordem)]));
    expect(porId.get(ids[ids.length - 1])).toBe(1);
    expect(porId.get(ids[0])).toBe(ids.length);
  });
});

describe("a lista tem de ser COMPLETA, e a recusa não deixa meia reescrita", () => {
  it("faltando um id, recusa e NADA muda", async () => {
    const c = comCatalogo();
    const antes = ordemPorId(c.estado);
    const ids = c.estado.etapas.map((e) => e.id);

    await recusaAo(() => c.reordenar(corpo(ids.slice(0, ids.length - 1).reverse())));

    expect(ordemPorId(c.estado), "sobrou meia reescrita gravada").toEqual(antes);
  });

  it("com um id que não existe no catálogo, recusa e NADA muda", async () => {
    const c = comCatalogo();
    const antes = ordemPorId(c.estado);
    const ids = c.estado.etapas.map((e) => e.id);

    await recusaAo(() => c.reordenar(corpo([...ids, 4242])));

    expect(ordemPorId(c.estado)).toEqual(antes);
  });

  it("com id repetido, recusa e NADA muda: duas posições para a mesma etapa não é ordem", async () => {
    const c = comCatalogo();
    const antes = ordemPorId(c.estado);
    const ids = c.estado.etapas.map((e) => e.id);

    await recusaAo(() => c.reordenar(corpo([ids[0], ...ids])));

    expect(ordemPorId(c.estado)).toEqual(antes);
  });

  /**
   * ─ O CONTRATO QUE ATRAVESSA AS DUAS CAMADAS, e é onde ele costuma quebrar ───────────────────
   *
   * "COMPLETA" INCLUI AS INATIVAS. A leitura PADRÃO do catálogo devolve só as ATIVAS, então uma tela
   * que monte a lista a partir dela vai mandar uma lista MENOR do que o catálogo assim que existir
   * UMA etapa inativa, e a reordenação passa a ser recusada SEMPRE, com um recado que manda
   * recarregar a página e não resolve nada: o diretor arrasta, toma erro, recarrega, arrasta de
   * novo, toma erro.
   *
   * ESTE CASO FIXA O CONTRATO para quem construir a tela: o gerenciador lista com
   * `incluirInativas` (ele precisa disso de qualquer forma, para poder REATIVAR) e manda a lista
   * INTEIRA na reordenação. Se a decisão for outra (aceitar só as ativas), é aqui que ela muda, e
   * ela muda de propósito, não por acidente.
   */
  it("a lista SEM as inativas é recusada: completa quer dizer o catálogo inteiro", async () => {
    const etapas: LinhaEtapa[] = etapasSemente().map((e) =>
      e.codigo === "ENTREVISTA_CLIENTE" ? { ...e, ativa: false } : e,
    );
    const c = comCatalogo(etapas);
    const antes = ordemPorId(c.estado);
    const soAtivas = c.estado.etapas.filter((e) => e.ativa).map((e) => e.id);

    await recusaAo(() => c.reordenar(corpo([...soAtivas].reverse())));

    expect(ordemPorId(c.estado)).toEqual(antes);
  });

  it("com o catálogo INTEIRO (ativas e inativas), a reordenação passa", async () => {
    const etapas: LinhaEtapa[] = etapasSemente().map((e) =>
      e.codigo === "ENTREVISTA_CLIENTE" ? { ...e, ativa: false } : e,
    );
    const c = comCatalogo(etapas);
    const todos = c.estado.etapas.map((e) => e.id);

    await c.reordenar(corpo([...todos].reverse()));

    ordemContigua(c.estado);
    expect(ordemPorId(c.estado)[todos[todos.length - 1]]).toBe(1);
  });

  it("lista vazia recusa, e o funil continua com a ordem que tinha", async () => {
    const c = comCatalogo();
    const antes = ordemPorId(c.estado);

    await recusaAo(() => c.reordenar(corpo([])));

    expect(ordemPorId(c.estado)).toEqual(antes);
  });
});
