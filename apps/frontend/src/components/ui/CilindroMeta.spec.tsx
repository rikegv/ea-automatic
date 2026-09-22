// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CilindroMeta, larguraDoCilindro, percentualDoCilindro } from "./CilindroMeta";

/**
 * §A.26: A EXTRAÇÃO NÃO PODE MUDAR UM PIXEL DA CENTRAL DE VAGAS, que é código validado.
 *
 * O cilindro nasceu como função local daquela tela e virou peça compartilhada com o Gerenciador Do
 * Portal. Estes testes afirmam o que a Central de Vagas desenhava ANTES da extração: o rótulo
 * padrão da barra cheia, o piso de 6%, a barra ausente no zero, a meta zero sem barra e a meta nula
 * com "não informado". Se alguém "melhorar" o componente para o portal, a Central de Vagas quebra
 * AQUI, e não na tela do diretor.
 */

describe("CilindroMeta, o desenho que a Central de Vagas já tinha", () => {
  it("o rótulo PADRÃO da barra cheia é Meta Atingida (a Central de Vagas não passa a prop)", () => {
    const html = renderToStaticMarkup(<CilindroMeta rotulo="Oficiais" meta={4} feitas={4} />);
    expect(html).toContain("Meta Atingida");
    // Verde do sistema na barra cheia, e não o accent.
    expect(html).toContain("var(--ok)");
  });

  it("quem chama pode trocar o rótulo da barra cheia sem tocar na Central de Vagas", () => {
    const html = renderToStaticMarkup(
      <CilindroMeta rotulo="Aceitos" meta={3} feitas={3} rotuloCheia="Régua Completa" />,
    );
    expect(html).toContain("Régua Completa");
    expect(html).not.toContain("Meta Atingida");
  });

  it('meta nula mostra "não informado" e NÃO desenha barra (§A.11)', () => {
    const html = renderToStaticMarkup(<CilindroMeta rotulo="Banco" meta={null} feitas={0} />);
    expect(html).toContain("não informado");
    expect(html).not.toContain("progressbar");
  });

  it("meta zero desenha o trilho e nenhum preenchimento: não é meta cumprida nem pendente", () => {
    const html = renderToStaticMarkup(<CilindroMeta rotulo="Banco" meta={0} feitas={0} />);
    expect(html).toContain("progressbar");
    expect(html).toContain("0 / 0");
    expect(html).not.toContain("Meta Atingida");
    expect(html).not.toContain("width:0%");
  });

  it("o `title` é de quem chama: o componente não inventa frase nenhuma", () => {
    const html = renderToStaticMarkup(
      <CilindroMeta rotulo="Oficiais" meta={10} feitas={2} title="frase da tela" />,
    );
    expect(html).toContain('title="frase da tela"');
  });

  it("o número fica na linha do rótulo, tabular, e a barra tem 14px de altura", () => {
    const html = renderToStaticMarkup(<CilindroMeta rotulo="Oficiais" meta={10} feitas={2} />);
    expect(html).toContain("2 / 10");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("h-[14px]");
  });
});

describe("a conta da barra", () => {
  it("piso de 6%: 1 de 40 não vira lasca invisível", () => {
    expect(larguraDoCilindro(40, 1)).toBe(6);
    expect(percentualDoCilindro(40, 1)).toBe(3);
  });

  it("zero NÃO desenha nada: barra vazia é barra vazia", () => {
    expect(larguraDoCilindro(10, 0)).toBe(0);
  });

  it("passar da meta não estoura os 100%", () => {
    expect(larguraDoCilindro(4, 9)).toBe(100);
    expect(percentualDoCilindro(4, 9)).toBe(100);
  });

  it("meta zero não divide por zero", () => {
    expect(larguraDoCilindro(0, 0)).toBe(0);
    expect(percentualDoCilindro(0, 0)).toBe(0);
  });
});
