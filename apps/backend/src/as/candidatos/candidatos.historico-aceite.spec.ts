import { describe, expect, it, vi } from "vitest";
import { ACEITE_BANCO_COM_OFICIAIS_ABERTAS } from "../../domain/candidatura";
import { CandidatosService } from "./candidatos.service";

/**
 * ─ O LOG DO ACEITE CHEGA A QUEM CONSULTA (§A.3 regra 8, achado da auditoria de 08/09) ───────────
 *
 * A REGRA PEDE DUAS COISAS, e só a primeira estava feita: log PERMANENTE e CONSULTÁVEL. O banco
 * guardava o aceite desde a migration 0097, na mesma transação da mudança de situação, com CHECK e
 * índice. A leitura do histórico, porém, era grava-e-esquece: a consulta seleciona a tabela INTEIRA,
 * então os três campos sempre chegaram do banco, e o `map` os DESCARTAVA. O aceite existia apenas
 * para quem abrisse o banco à mão.
 *
 * E A TELA JÁ PROMETIA O CONTRÁRIO, com estas palavras: "o aceite fica registrado no histórico desta
 * candidatura". Tela que promete trilha e não a exibe é pior do que trilha nenhuma, porque quem
 * confia nela para de conferir.
 *
 * §A.6, E É POR ISSO QUE O ÚLTIMO TESTE EXISTE: o que sai daqui é o NOME DA GUARDA, o LADO e um
 * NÚMERO, mais o autor, que é usuário INTERNO. Nenhum dado de candidato, nenhum CPF, nenhuma URL.
 */

/** Uma linha da tabela de eventos, como a consulta do histórico a devolve (a tabela inteira). */
function evento(over: Record<string, unknown> = {}) {
  return {
    h: {
      id: "ev-1",
      candidaturaId: "cand-1",
      etapaDe: null,
      etapaPara: "APROVACAO",
      situacao: null,
      motivo: null,
      vagaDe: null,
      vagaPara: null,
      porId: "user-1",
      posicaoLado: null,
      aceite: null,
      aceiteNumero: null,
      ocorridoEm: new Date("2026-09-08T12:00:00.000Z"),
      criadoEm: new Date("2026-09-08T12:00:00.000Z"),
      ...over,
    },
    autor: "Consultor Fulano",
    vagaDeNome: null,
    vagaDeCodigo: null,
    vagaParaNome: null,
    vagaParaCodigo: null,
  };
}

function makeDb(linhas: ReturnType<typeof evento>[]) {
  const select = vi.fn(() => {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    b.orderBy = () => Promise.resolve(linhas);
    return b;
  });
  return new CandidatosService({ select } as never);
}

/** O evento que a alocação no banco com posição oficial aberta grava, com o aceite preenchido. */
const COM_ACEITE = evento({
  id: "ev-aceite",
  situacao: "ALOCADO",
  posicaoLado: "BANCO",
  aceite: ACEITE_BANCO_COM_OFICIAIS_ABERTAS,
  aceiteNumero: 3,
});

describe("listarHistoricoEtapas: o aceite sai na resposta, e não morre no banco", () => {
  it("devolve a guarda destravada, o lado e o número que o consultor estava vendo", async () => {
    const [item] = await makeDb([COM_ACEITE]).listarHistoricoEtapas("cand-1");

    expect(item.aceite).toBe(ACEITE_BANCO_COM_OFICIAIS_ABERTAS);
    // SEM O NÚMERO O LOG NÃO SERVE: confirmar com UMA oficial aberta e com CINCO são decisões
    // diferentes, e é ele que distingue as duas.
    expect(item.aceiteNumero).toBe(3);
    expect(item.posicaoLado).toBe("BANCO");
  });

  it("o autor e o instante vêm junto: sem eles o aceite não responde quem decidiu nem quando", async () => {
    const [item] = await makeDb([COM_ACEITE]).listarHistoricoEtapas("cand-1");
    expect(item.porNome).toBe("Consultor Fulano");
    expect(item.ocorridoEm).toBe("2026-09-08T12:00:00.000Z");
    expect(item.tipo).toBe("DESFECHO");
  });

  /**
   * NULO É O NORMAL DA ESMAGADORA MAIORIA dos eventos, e o campo precisa sair mesmo assim: uma tela
   * que só recebe o campo quando ele está preenchido não consegue dizer "nenhuma guarda foi
   * destravada aqui", só consegue não dizer nada.
   */
  it("evento comum devolve os três campos como nulos, e não como ausentes", async () => {
    const [item] = await makeDb([evento({ etapaDe: "TRIAGEM", etapaPara: "ENTREVISTA_SOULAN" })])
      .listarHistoricoEtapas("cand-1");

    expect(item).toHaveProperty("aceite", null);
    expect(item).toHaveProperty("aceiteNumero", null);
    expect(item).toHaveProperty("posicaoLado", null);
    expect(item.tipo).toBe("MOVIMENTO");
  });

  it("a linha do tempo inteira carrega os campos, e o aceite fica no evento certo", async () => {
    const itens = await makeDb([
      evento({ id: "ev-entrada", etapaDe: null, etapaPara: "CAPTACAO" }),
      COM_ACEITE,
    ]).listarHistoricoEtapas("cand-1");

    expect(itens.map((i) => i.aceite)).toEqual([null, ACEITE_BANCO_COM_OFICIAIS_ABERTAS]);
    expect(itens.map((i) => i.aceiteNumero)).toEqual([null, 3]);
  });

  /**
   * §A.6: O RECORTE É FIRME. O que a régua 8 pede é a trilha da DECISÃO, e a decisão se descreve
   * com uma guarda, um lado e um número. Nada da pessoa entra, e o autor é usuário interno.
   */
  it("§A.6: nada de candidato viaja junto do aceite", async () => {
    const [item] = await makeDb([COM_ACEITE]).listarHistoricoEtapas("cand-1");
    const chaves = Object.keys(item);

    for (const proibida of ["cpf", "candidatoId", "candidatoNome", "email", "telefone", "url"]) {
      expect(chaves).not.toContain(proibida);
    }
    expect(JSON.stringify(item)).not.toMatch(/\d{11}/);
  });
});
