import { describe, expect, it } from "vitest";
import {
  ALTURA_CONFORTAVEL,
  calcularPosicaoPopover,
  FOLGA_DO_GATILHO,
  MARGEM_DA_JANELA,
} from "./popover-posicao";

const JANELA = { largura: 1440, altura: 900 };

/** Um gatilho de seletor de 240px de largura e 38px de altura, na posição vertical pedida. */
function gatilho(top: number, left = 200, width = 240) {
  return { top, bottom: top + 38, left, width };
}

describe("calcularPosicaoPopover", () => {
  it("no meio da tela, abre para BAIXO como sempre abriu", () => {
    const p = calcularPosicaoPopover(gatilho(300), JANELA);
    expect(p.paraCima).toBe(false);
    expect(p.top).toBe(300 + 38 + FOLGA_DO_GATILHO);
    expect(p.bottom).toBeUndefined();
  });

  it("O BUG 14: o menu NUNCA passa da borda de baixo da janela", () => {
    // Gatilho no rodapé: sobravam 62px de tela e o menu pedia 240px, então 178px ficavam fora.
    const p = calcularPosicaoPopover(gatilho(800), JANELA);
    const fimDoMenu = (p.top ?? 0) + p.alturaMax;
    expect(fimDoMenu).toBeLessThanOrEqual(JANELA.altura);
  });

  it("no rodapé, INVERTE para cima, porque lá em cima há mais espaço", () => {
    const p = calcularPosicaoPopover(gatilho(800), JANELA);
    expect(p.paraCima).toBe(true);
    expect(p.bottom).toBe(JANELA.altura - 800 + FOLGA_DO_GATILHO);
    expect(p.top).toBeUndefined();
    // Invertido, ele tem a tela inteira acima do gatilho para crescer.
    expect(p.alturaMax).toBeGreaterThan(ALTURA_CONFORTAVEL);
  });

  it("invertido, também não passa da borda de CIMA", () => {
    const p = calcularPosicaoPopover(gatilho(800), JANELA);
    const topoDoMenu = JANELA.altura - (p.bottom ?? 0) - p.alturaMax;
    expect(topoDoMenu).toBeGreaterThanOrEqual(0);
  });

  it("NÃO inverte quando o espaço de baixo é confortável, mesmo com mais espaço acima", () => {
    // 600px de topo: sobram ~256px abaixo, acima há 586px. Cabe embaixo, então não mexe.
    const p = calcularPosicaoPopover(gatilho(600), JANELA);
    expect(p.paraCima).toBe(false);
    expect(p.alturaMax).toBeGreaterThanOrEqual(ALTURA_CONFORTAVEL);
  });

  it("no TOPO da tela não inverte, porque acima não há espaço nenhum", () => {
    const p = calcularPosicaoPopover(gatilho(4), JANELA);
    expect(p.paraCima).toBe(false);
  });

  it("janela baixinha: aperta nos dois lados e ainda devolve lista rolável, nunca altura negativa", () => {
    const p = calcularPosicaoPopover(gatilho(120), { largura: 1440, altura: 200 });
    expect(p.alturaMax).toBeGreaterThan(0);
  });

  it("gatilho encostado na direita: o menu é puxado para dentro da janela", () => {
    const p = calcularPosicaoPopover(gatilho(300, 1380, 240), JANELA);
    expect(p.left + p.largura).toBeLessThanOrEqual(JANELA.largura - MARGEM_DA_JANELA);
  });

  it("gatilho encostado na esquerda: respeita a margem e não fica negativo", () => {
    const p = calcularPosicaoPopover(gatilho(300, -20, 240), JANELA);
    expect(p.left).toBeGreaterThanOrEqual(MARGEM_DA_JANELA);
  });

  it("o teto de largura impede o menu largo (menuFit) de vazar pela direita", () => {
    const p = calcularPosicaoPopover(gatilho(300, 1100, 240), JANELA);
    expect(p.left + p.larguraMax).toBeLessThanOrEqual(JANELA.largura);
  });
});
