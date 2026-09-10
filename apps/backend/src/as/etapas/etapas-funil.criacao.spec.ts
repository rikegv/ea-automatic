import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { ETAPA_TONS } from "@ea/shared-types";
import * as corpos from "./etapas-funil.dto";
import { codigoDoRotulo } from "../../ifractal/ifractal-status.service";
import { EtapasFunilService } from "./etapas-funil.service";
import {
  bancoFingido,
  etapasSemente,
  metodo,
  type Estado,
  type LinhaEtapa,
} from "./etapas-funil.fake-db";

/**
 * ─ CRIAR ETAPA: O CÓDIGO JÁ EXISTIU UM DIA, E A LINHA QUE CONFLITA ESTÁ INVISÍVEL NA TELA ───────
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2).
 *
 * ┌─ O CASO REAL, e ele acontece meses depois, com outra pessoa na cadeira ────────────────────┐
 * │ O diretor INATIVA "Triagem" em março. Em junho ele digita "Triagem" de novo. O código        │
 * │ derivado é o MESMO (`TRIAGEM`, e o código é imutável de propósito), a linha que conflita     │
 * │ está `ativa = false` e portanto FORA da tela, e o `INSERT` bate na UNIQUE do banco.          │
 * │                                                                                             │
 * │ SEM TRATAMENTO ISSO É 500. Quem digitou vê "erro interno" para um nome que, na tela dele,    │
 * │ não existe em lugar nenhum. Não há como adivinhar o que fazer.                               │
 * │                                                                                             │
 * │ AS DUAS SAÍDAS ACEITÁVEIS, e o teste aceita as DUAS porque a escolha é de quem constrói:     │
 * │   . REATIVAR a linha existente, preservando o histórico que aponta para ela (é o caminho     │
 * │     recomendado: o código é a identidade, e a etapa é a MESMA etapa voltando);                │
 * │   . RECUSAR com frase legível, dizendo que já existe uma etapa com esse nome, inativa.       │
 * │ O QUE NUNCA É ACEITÁVEL: o erro cru do Postgres subindo, e uma SEGUNDA linha com o mesmo     │
 * │ código nascendo (que a FK e a UNIQUE existem para impedir).                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MAIS DUAS PORTAS PARA A MESMA COLISÃO, e as duas são fáceis de esquecer:
 *   . O TRUNCAMENTO EM 40 CARACTERES. `codigoDoRotulo` corta em 40, então dois rótulos LONGOS e
 *     DIFERENTES podem gerar o mesmo código. Quem lê a tela vê dois nomes distintos e não entende
 *     a recusa, então a frase precisa ser legível, e o 500 continua proibido.
 *   . O RÓTULO QUE GERA CÓDIGO VAZIO ("###", "  ,  "): sem letra nem número, a normalização devolve
 *     string vazia, e uma etapa de código vazio é uma etapa que nenhuma FK consegue apontar.
 *
 * §A.6: nada de dado pessoal aqui. Código, rótulo e cor.
 */

function comCatalogo(cenario: Partial<Estado> = {}) {
  const { db, estado } = bancoFingido({
    etapas: cenario.etapas ?? etapasSemente(),
    candidaturas: cenario.candidaturas ?? [],
    historico: cenario.historico ?? [],
  });
  const service = new EtapasFunilService(db as never);
  return {
    estado,
    service,
    criar: metodo(service, ["criar", "create", "adicionar"]),
  };
}

/** O resultado de uma tentativa, sem `try/catch` espalhado pelos casos. */
async function tentar(fn: () => Promise<unknown>): Promise<{ erro: unknown; valor: unknown }> {
  try {
    return { erro: null, valor: await fn() };
  } catch (e) {
    return { erro: e, valor: null };
  }
}

/**
 * A AFIRMAÇÃO QUE VALE PARA TODA COLISÃO DE CÓDIGO, seja qual for a saída escolhida:
 * nunca erro cru do banco, e nunca duas linhas com o mesmo código.
 */
function semColisaoCrua(erro: unknown, estado: Estado): void {
  if (erro) {
    expect(erro, `o erro do banco subiu cru: ${String(erro)}`).toBeInstanceOf(HttpException);
    expect((erro as HttpException).getStatus(), "colisão de nome é 4xx, nunca 500").toBeLessThan(500);
  }
  const codigos = estado.etapas.map((e) => e.codigo);
  expect(new Set(codigos).size, "nasceu uma segunda linha com o mesmo código").toBe(codigos.length);
}

/**
 * A CLASSE DO CORPO DA COR, resolvida por NOME dentro do módulo de DTOs. O contrato fixou a PALETA,
 * não o nome da classe: assim o teste diz QUAL corpo falta, em vez de o arquivo inteiro morrer na
 * importação. Mesma técnica do `candidatos.lote-dto.spec.ts`.
 */
function classeDeTom(): new () => object {
  const achada = Object.entries(corpos).find(
    ([nome, valor]) => /tom|cor/i.test(nome) && typeof valor === "function",
  );
  if (!achada) {
    throw new Error(
      `Nenhum corpo de cor em etapas-funil.dto: ${Object.keys(corpos).join(", ")}`,
    );
  }
  return achada[1] as new () => object;
}

describe("recriar uma etapa INATIVADA não pode virar 500", () => {
  const catalogoComTriagemInativa = (): LinhaEtapa[] =>
    etapasSemente().map((e) => (e.codigo === "TRIAGEM" ? { ...e, ativa: false } : e));

  it('digitar "Triagem" de novo: ou reativa a mesma linha, ou recusa com frase, nunca estoura', async () => {
    const c = comCatalogo({
      etapas: catalogoComTriagemInativa(),
      historico: [{ id: "ev1", candidaturaId: "cand1", etapaDe: "CAPTACAO", etapaPara: "TRIAGEM" }],
    });
    const idOriginal = c.estado.etapas.find((e) => e.codigo === "TRIAGEM")?.id;

    const { erro } = await tentar(() => c.criar({ rotulo: "Triagem" }));

    semColisaoCrua(erro, c.estado);
    // O HISTÓRICO CONTINUA APONTANDO PARA A MESMA LINHA, com qualquer das duas saídas: a linha do
    // código `TRIAGEM` é uma só, e é a de sempre.
    const triagens = c.estado.etapas.filter((e) => e.codigo === "TRIAGEM");
    expect(triagens).toHaveLength(1);
    expect(triagens[0].id).toBe(idOriginal);
  });

  it("se a escolha for REATIVAR, a linha volta ATIVA e o catálogo não cresce", async () => {
    const c = comCatalogo({ etapas: catalogoComTriagemInativa() });

    const { erro } = await tentar(() => c.criar({ rotulo: "Triagem" }));

    expect(c.estado.etapas).toHaveLength(5);
    if (!erro) expect(c.estado.etapas.find((e) => e.codigo === "TRIAGEM")?.ativa).toBe(true);
  });

  it("a colisão com uma etapa ATIVA continua sendo recusa legível (o caso de sempre)", async () => {
    const c = comCatalogo();

    const { erro } = await tentar(() => c.criar({ rotulo: "Triagem" }));

    expect(erro).toBeInstanceOf(HttpException);
    semColisaoCrua(erro, c.estado);
    expect(c.estado.etapas).toHaveLength(5);
  });
});

describe("as outras duas portas da mesma colisão", () => {
  /**
   * O TRUNCAMENTO EM 40. As duas frases abaixo são DIFERENTES e geram o MESMO código, e o teste
   * afirma essa premissa antes de medir o comportamento: se a normalização mudar e elas deixarem
   * de colidir, o caso deixa de ser o caso, e é melhor ele dizer isso alto.
   */
  it("dois rótulos longos que truncam no mesmo código não estouram a unique", async () => {
    const primeiro = "Entrevista Com O Cliente Final Da Operacao Norte";
    const segundo = "Entrevista Com O Cliente Final Da Operacao Sul";
    expect(codigoDoRotulo(primeiro), "a premissa do caso: os dois truncam igual").toBe(
      codigoDoRotulo(segundo),
    );

    const c = comCatalogo();
    await tentar(() => c.criar({ rotulo: primeiro }));
    const { erro } = await tentar(() => c.criar({ rotulo: segundo }));

    semColisaoCrua(erro, c.estado);
  });

  it.each([["###"], ["  ,  "], ["- -"], ["   "]])(
    "o rótulo %j, que geraria código vazio, é recusado e nada é inserido",
    async (rotulo) => {
      const c = comCatalogo();

      const { erro } = await tentar(() => c.criar({ rotulo }));

      expect(erro, "código vazio precisa de recusa com frase").toBeInstanceOf(HttpException);
      expect(c.estado.etapas).toHaveLength(5);
    },
  );
});

describe("a etapa nova nasce inteira, e a cor vem da paleta fechada", () => {
  it("nasce no FIM da fila, ATIVA e NÃO inicial", async () => {
    const c = comCatalogo();

    await c.criar({ rotulo: "Teste Prático" });

    const nova = c.estado.etapas.find((e) => e.codigo === codigoDoRotulo("Teste Prático"));
    expect(nova, "a etapa nova não foi criada").toBeDefined();
    expect(nova?.ordem).toBe(6);
    expect(nova?.ativa).toBe(true);
    expect(nova?.inicial, "etapa nova não pode roubar o nascimento da candidatura").toBe(false);
    // A inicial continua sendo uma só, e é a de antes.
    expect(c.estado.etapas.filter((e) => e.inicial)).toHaveLength(1);
  });

  it("sem tom escolhido, a etapa nasce com um tom DA PALETA, nunca vazio", async () => {
    const c = comCatalogo();

    await c.criar({ rotulo: "Dinâmica" });

    const nova = c.estado.etapas.find((e) => e.codigo === "DINAMICA");
    expect(nova).toBeDefined();
    expect(ETAPA_TONS as readonly string[]).toContain(nova?.tom);
  });

  /**
   * ─ A COR ENTRA POR OUTRA PORTA, E É LÁ QUE A PALETA SE FECHA ────────────────────────────────
   *
   * A CRIAÇÃO NÃO ESCOLHE COR (a etapa nasce neutra e a cor é definida depois, numa operação
   * própria), então é o CORPO daquela operação que precisa recusar o que não é da paleta. O teste
   * mede o DTO com o `class-validator`, e não o service, porque é ali que a régua mora: a mesma
   * técnica do `candidatos.lote-dto.spec.ts`, e pelo mesmo motivo, régua que só existe na tela não
   * é régua.
   *
   * O VERMELHO (`dg`) É O CASO QUE IMPORTA: no sistema ele significa RECUSA (§A.12 põe o X vermelho
   * nele), e etapa de funil é POSIÇÃO, não julgamento. Uma etapa vermelha diria que estar nela é um
   * problema. Ele é um tom VÁLIDO do design system, então nada além desta lista o barra.
   */
  it.each(["dg", "#ff0000", "azul", "", "OK"])(
    "o corpo que define a cor recusa o tom %j",
    (tom) => {
      const Classe = classeDeTom();
      const erros = validateSync(plainToInstance(Classe, { tom }) as object);
      expect(erros.length, `o tom ${JSON.stringify(tom)} passou pela validação`).toBeGreaterThan(0);
    },
  );

  it.each(ETAPA_TONS)("o corpo aceita o tom %s, que é da paleta", (tom) => {
    const Classe = classeDeTom();
    expect(validateSync(plainToInstance(Classe, { tom }) as object)).toHaveLength(0);
  });

  /**
   * REPETIR TOM É PERMITIDO (decisão do diretor, D3): são cinco tons para uma lista que ele pode
   * fazer maior, e quem lê se orienta pela ordem do funil, não só pela cor. Sem este caso, a régua
   * "tom da paleta" viraria "tom inédito" na primeira implementação zelosa demais.
   */
  it("duas etapas com o MESMO tom é permitido, e não vira recusa", async () => {
    const c = comCatalogo();
    const definirTom = metodo(c.service, ["definirTom", "definirCor", "atualizarTom"]);
    const alvo = c.estado.etapas.find((e) => e.codigo === "APROVACAO") as LinhaEtapa;

    await definirTom(alvo.id, { tom: "in" });

    expect(alvo.tom).toBe("in");
    expect(c.estado.etapas.filter((e) => e.tom === "in").length).toBeGreaterThan(1);
  });
});

/**
 * ─ O CAMINHO DE VOLTA PRECISA EXISTIR, senão a recusa do nome inativo é um beco sem saída ──────
 *
 * Recusar a criação dizendo "reative a que existe" só é uma saída aceitável enquanto REATIVAR for
 * uma operação de verdade, alcançável pela tela e preservando a MESMA linha: mesmo id, mesmo
 * código, mesmo histórico apontando para ela. Se a reativação não existir, o diretor fica sem
 * nenhuma forma de ter de volta uma etapa que ele mesmo inativou, e a recusa vira uma parede.
 */
describe("a etapa inativada volta pela reativação, e é a MESMA linha que volta", () => {
  it("reativar devolve a etapa à lista, com o mesmo id e o mesmo código", async () => {
    const etapas = etapasSemente().map((e) =>
      e.codigo === "TRIAGEM" ? { ...e, ativa: false } : e,
    );
    const c = comCatalogo({
      etapas,
      historico: [{ id: "ev1", candidaturaId: "cand1", etapaDe: "CAPTACAO", etapaPara: "TRIAGEM" }],
    });
    const reativar = metodo(c.service, ["reativar", "ativar", "restaurar"]);
    const alvo = c.estado.etapas.find((e) => e.codigo === "TRIAGEM") as LinhaEtapa;

    await reativar(alvo.id);

    expect(c.estado.etapas).toHaveLength(5);
    const depois = c.estado.etapas.find((e) => e.codigo === "TRIAGEM") as LinhaEtapa;
    expect(depois.id).toBe(alvo.id);
    expect(depois.ativa).toBe(true);
  });
});
