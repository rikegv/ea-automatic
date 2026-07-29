import { describe, expect, it } from "vitest";
import { planejarSelecaoDeMenus } from "./menus";

/**
 * SALVAMENTO DA TELA DE PERMISSÃO: preservar o que a tela não conhecia.
 *
 * O defeito era concreto e mordeu duas vezes. A tela mandava a lista inteira e o backend apagava
 * tudo antes de regravar, então quem tinha a página aberta quando um menu novo entrou no sistema
 * REMOVIA esse menu ao salvar, sem ver e sem querer. Foi assim que o `assinaturas` sumiu de 4 dos 5
 * COMUM em 28/07, e depois o `assinante-empresa`.
 *
 * A régua nova: a tela declara o catálogo que exibiu, e só dentro dele existe remoção.
 */

describe("planejarSelecaoDeMenus: menu novo sobrevive a uma página desatualizada", () => {
  it("PRESERVA o menu que a tela não conhecia (o bug que já mordeu duas vezes)", () => {
    // A página carregou antes de `assinaturas` existir; o usuário já tinha ganhado o menu.
    const plano = planejarSelecaoDeMenus({
      atuais: ["inicio", "esteira", "assinaturas"],
      selecionados: ["inicio", "esteira"],
      conhecidos: ["inicio", "esteira", "gerenciador"],
    });
    expect(plano.remover).toEqual([]);
    expect(plano.preservados).toEqual(["assinaturas"]);
  });

  it("REMOVE o que a tela conhecia e o admin desmarcou (desmarcar continua funcionando)", () => {
    const plano = planejarSelecaoDeMenus({
      atuais: ["inicio", "esteira", "gerenciador"],
      selecionados: ["inicio"],
      conhecidos: ["inicio", "esteira", "gerenciador"],
    });
    expect(plano.remover.sort()).toEqual(["esteira", "gerenciador"]);
    expect(plano.preservados).toEqual([]);
  });

  it("INSERE só o que falta (não regrava o que já existe)", () => {
    const plano = planejarSelecaoDeMenus({
      atuais: ["inicio"],
      selecionados: ["inicio", "esteira"],
      conhecidos: ["inicio", "esteira"],
    });
    expect(plano.inserir).toEqual(["esteira"]);
    expect(plano.remover).toEqual([]);
  });

  it("salvar sem mudar nada não gera escrita nenhuma", () => {
    const plano = planejarSelecaoDeMenus({
      atuais: ["inicio", "esteira"],
      selecionados: ["esteira", "inicio"],
      conhecidos: ["inicio", "esteira", "gerenciador"],
    });
    expect(plano.inserir).toEqual([]);
    expect(plano.remover).toEqual([]);
  });

  it("marcado fora do escopo entra assim mesmo (pedido explícito de quem salvou)", () => {
    const plano = planejarSelecaoDeMenus({
      atuais: [],
      selecionados: ["assinante-empresa"],
      conhecidos: ["inicio"],
    });
    expect(plano.inserir).toEqual(["assinante-empresa"]);
  });

  it("escopo vazio nunca remove nada (a tela sem catálogo não tem autoridade)", () => {
    const plano = planejarSelecaoDeMenus({
      atuais: ["inicio", "esteira", "assinaturas"],
      selecionados: [],
      conhecidos: [],
    });
    expect(plano.remover).toEqual([]);
    expect(plano.preservados.sort()).toEqual(["assinaturas", "esteira", "inicio"]);
  });

  /**
   * O caso real de 28/07, reproduzido: a página tinha o catálogo SEM `assinaturas`, o admin salvou
   * mexendo em outra coisa, e o menu recém-concedido evaporou. Com a régua nova, ele fica.
   */
  it("reproduz o incidente do menu `assinaturas` e mostra que agora ele sobrevive", () => {
    const catalogoAntigo = ["inicio", "nova", "esteira", "gerenciador", "analise"];
    const plano = planejarSelecaoDeMenus({
      atuais: [...catalogoAntigo, "assinaturas"],
      selecionados: catalogoAntigo,
      conhecidos: catalogoAntigo,
    });
    expect(plano.remover).toEqual([]);
    expect(plano.preservados).toEqual(["assinaturas"]);
  });
});
