import { describe, expect, it } from "vitest";
import { VAGA_STATUS_SEMENTE, type VagaStatusItem } from "@ea/shared-types";
import { vagaEmProcesso, vagaEncerrada } from "./as-status-vaga";

/**
 * ─ "A VAGA ESTÁ EM PROCESSO?" É A PERGUNTA QUE A ENTREGA VIVA CRIOU (Frente B) ─────────────────
 *
 * O QUE ESTE TESTE PROTEGE, e ele protege duas falhas OPOSTAS, cada uma com um custo próprio:
 *
 *  1. ESTREITO DEMAIS (a régua de ontem, `ehDoPapelDaVaga(status, "ABERTURA")`). A vaga ENTREGUE
 *     abriria a barra de ações SEM PORTA DE SAÍDA: o backend aceita fechar e cancelar a partir dela
 *     (`papelDeVagaEmProcesso`), e a tela não ofereceria nenhum dos dois. Ela ficaria presa até
 *     alguém movê-la à mão de volta para Aberta.
 *  2. LARGO DEMAIS (`!vagaEncerrada`, que é a simplificação tentadora). Passaria a oferecer FECHAR e
 *     CANCELAR no RASCUNHO (que nem publicado foi), no PENDENTE DE REVISÃO (que ninguém conferiu, e
 *     que nem cliente tem) e em qualquer status LIVRE que o diretor venha a criar. Três botões que
 *     só sabem falhar, em três estados que o backend recusa.
 *
 * O TESTE É ESCRITO CONTRA A RÉGUA, E NÃO CONTRA A SEMENTE: o catálogo é dado do diretor, então
 * quem responde é o PAPEL de cada linha, inclusive o de um status que ele invente amanhã.
 */

/** Um "Stand By" do diretor: papel LIVRE, vivo, e que NÃO capta gente nova. */
const STAND_BY: VagaStatusItem = {
  codigo: "STAND_BY",
  rotulo: "Stand By",
  ordem: 7,
  tom: "wn",
  ativo: true,
  papel: "LIVRE",
  encerra: false,
  recebeCandidato: false,
  daTrilha: false,
  movivelManualmente: true,
};

const CATALOGO: VagaStatusItem[] = [...VAGA_STATUS_SEMENTE, STAND_BY];

describe("vagaEmProcesso (os dois papéis vivos: ABERTURA e ENTREGA)", () => {
  it("a ENTREGUE está em processo, que é a mudança inteira da Frente B", () => {
    expect(vagaEmProcesso("ENTREGUE", CATALOGO)).toBe(true);
    // E ela não encerra: os dois flags contam a mesma história, por caminhos diferentes.
    expect(vagaEncerrada("ENTREGUE", CATALOGO)).toBe(false);
  });

  it("a ABERTA continua em processo, e nada da régua antiga se perdeu", () => {
    expect(vagaEmProcesso("ABERTA", CATALOGO)).toBe(true);
  });

  it("os desfechos ficam de fora: vaga encerrada não fecha nem cancela de novo", () => {
    expect(vagaEmProcesso("FECHADA", CATALOGO)).toBe(false);
    expect(vagaEmProcesso("CANCELADA", CATALOGO)).toBe(false);
  });

  /**
   * AQUI MORA A FALHA 2, e é ela que separa esta função de `!vagaEncerrada`. Os três estão VIVOS
   * (não encerram) e mesmo assim não são destino das portas de encerramento: o rascunho publica
   * pela trilha de abertura, a revisão sai pela liberação (que confere o cliente que a varredura
   * não trouxe) e o status do diretor não está no conceito dos quatro estados.
   */
  it("rascunho, revisão e status do diretor NÃO estão em processo, ainda que não encerrem", () => {
    for (const codigo of ["RASCUNHO", "PENDENTE_REVISAO", "STAND_BY"]) {
      expect(vagaEncerrada(codigo, CATALOGO), `${codigo} não encerra`).toBe(false);
      expect(vagaEmProcesso(codigo, CATALOGO), `${codigo} não está em processo`).toBe(false);
    }
  });

  /** Sem a linha do catálogo não há papel, e não oferecer gesto de encerramento é o lado seguro. */
  it("código desconhecido, nulo e indefinido não estão em processo", () => {
    expect(vagaEmProcesso("INVENTADO", CATALOGO)).toBe(false);
    expect(vagaEmProcesso(null, CATALOGO)).toBe(false);
    expect(vagaEmProcesso(undefined, CATALOGO)).toBe(false);
  });

  /**
   * A PROVA DE QUE A RESPOSTA É DO PAPEL, E NÃO DO CÓDIGO: um segundo código de entrega que o
   * diretor crie é lido sem ninguém escrever o nome dele. É o contrário do literal, que mede o NOME
   * da linha quando o que decide é o que ela significa.
   */
  it("um código NOVO de papel ENTREGA é lido sem ninguém escrever o nome dele", () => {
    const entregueParcial: VagaStatusItem = { ...STAND_BY, codigo: "ENTREGUE_PARCIAL", papel: "ENTREGA" };
    expect(vagaEmProcesso("ENTREGUE_PARCIAL", [...CATALOGO, entregueParcial])).toBe(true);
  });
});
