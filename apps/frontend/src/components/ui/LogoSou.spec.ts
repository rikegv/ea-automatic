import { describe, expect, it } from "vitest";
import { marcasDoAcesso } from "./LogoSou";

/**
 * A RÉGUA DO LOGO POR ACESSO (troca de identidade, decisão do diretor).
 *
 * O QUE ESTES TESTES TRAVAM: a ORDEM da régua, que é onde ela erra em silêncio. O `/auth/me` devolve
 * `areas: ["ADM", "AS"]` CHUMBADO para o super admin, porque ele está acima da segmentação de área.
 * Se alguém reordenar os testes dentro da função e olhar as áreas antes do papel, o super admin
 * passa a ver o lockup duplo, que é exatamente o que a régua não quer, e nenhuma tela quebra: ela só
 * mostra a marca errada para a pessoa errada.
 */

describe("marcasDoAcesso", () => {
  it("super admin vê SOUOperações, mesmo com as duas áreas", () => {
    expect(marcasDoAcesso(true, ["ADM", "AS"])).toEqual(["operacoes"]);
  });

  it("as duas áreas viram o lockup duplo, com o Talent primeiro", () => {
    expect(marcasDoAcesso(false, ["ADM", "AS"])).toEqual(["talent", "adm"]);
  });

  it("a ordem em que as áreas chegam não muda a ordem das marcas", () => {
    expect(marcasDoAcesso(false, ["AS", "ADM"])).toEqual(["talent", "adm"]);
  });

  it("só A&S vê SOU Talent", () => {
    expect(marcasDoAcesso(false, ["AS"])).toEqual(["talent"]);
  });

  it("só admissão vê SOU Adm", () => {
    expect(marcasDoAcesso(false, ["ADM"])).toEqual(["adm"]);
  });

  /**
   * SEM ÁREA NÃO FICA SEM MARCA, e o caso é real: existe conta ativa sem área na base. O padrão é a
   * marca guarda-chuva, que serve a qualquer pessoa e nunca deixa a barra com um buraco.
   */
  it("sem área nenhuma cai no SOUOperações", () => {
    expect(marcasDoAcesso(false, [])).toEqual(["operacoes"]);
  });

  it("área desconhecida é tratada como ausência, não como erro", () => {
    expect(marcasDoAcesso(false, ["FINANCEIRO"])).toEqual(["operacoes"]);
  });
});
