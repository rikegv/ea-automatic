import { describe, expect, it } from "vitest";
import {
  FAROL_PAUSADA,
  FAROL_SELECT_OPTIONS,
  farolPill,
  valorSeletorFarol,
} from "./farol";

/**
 * "ADMISSÃO PAUSADA" NO SELETOR DE STATUS (OST da pausa, correção do diretor).
 *
 * O ponto técnico que estes testes protegem: a pausa é MAIS UM VALOR no seletor para quem opera, e
 * continua sendo uma FLAG PARALELA no banco. Os dois só convivem porque o seletor é apresentação:
 * o que ele exibe é DERIVADO (`valorSeletorFarol`) e o que ele grava é TRADUZIDO (o modal chama a
 * rota de pausa/retomada, nunca grava "PAUSADA" em `farol_global`).
 *
 * Se alguém um dia mandar "PAUSADA" como farol de verdade, o farol volta a mentir ao retomar, que é
 * exatamente o que a flag existe para evitar. Daí o teste de que PAUSADA NÃO é um farol do enum.
 */

describe("FAROL_SELECT_OPTIONS: a pausa é mais uma opção do MESMO seletor", () => {
  const valores = FAROL_SELECT_OPTIONS.map((o) => o.value);

  it("inclui 'Admissão Pausada' junto dos demais status", () => {
    expect(valores).toContain(FAROL_PAUSADA);
    const opt = FAROL_SELECT_OPTIONS.find((o) => o.value === FAROL_PAUSADA);
    expect(opt?.label).toBe("Admissão Pausada");
  });

  it("fica logo depois de 'Em Admissão' (é de lá que se pausa)", () => {
    expect(valores[valores.indexOf("EM_ADMISSAO") + 1]).toBe(FAROL_PAUSADA);
  });

  it("mantém os status que já existiam, sem perder nenhum", () => {
    for (const f of ["EM_ADMISSAO", "BANCO_AGUARDAR", "ADMISSAO_CONCLUIDA", "DECLINOU", "RESCISAO"]) {
      expect(valores, f).toContain(f);
    }
  });

  it("segue excluindo os estados de SISTEMA da Liberação (não são escolha manual)", () => {
    expect(valores).not.toContain("AGUARDANDO_LIBERACAO");
    expect(valores).not.toContain("LIBERACAO_RECUSADA");
  });

  it("PAUSADA não é um farol do enum: nenhum rótulo oficial responde por ele", () => {
    // `farolPill` trata a pausa como caso à parte, de propósito. Se um dia "PAUSADA" virar valor de
    // `farol_global`, este teste continua passando, mas o de `valorSeletorFarol` abaixo é que
    // guarda a semântica: a exibição vem da FLAG, não do farol.
    expect(farolPill(FAROL_PAUSADA)).toEqual({ tone: "wn", label: "Admissão Pausada" });
  });
});

describe("valorSeletorFarol: o que o seletor MOSTRA", () => {
  it("pausada mostra 'Pausada', qualquer que seja o farol real por baixo", () => {
    expect(valorSeletorFarol("EM_ADMISSAO", "2026-07-27T12:00:00Z")).toBe(FAROL_PAUSADA);
    // Mesmo que a derivação tenha levado o farol a BANCO_AGUARDAR DURANTE a pausa (auditoria e exame
    // fecharam), o seletor segue dizendo "Pausada": o farol real não foi perdido, só não é o que
    // está em exibição.
    expect(valorSeletorFarol("BANCO_AGUARDAR", "2026-07-27T12:00:00Z")).toBe(FAROL_PAUSADA);
  });

  it("não pausada mostra o farol real", () => {
    expect(valorSeletorFarol("EM_ADMISSAO", null)).toBe("EM_ADMISSAO");
    expect(valorSeletorFarol("BANCO_AGUARDAR", undefined)).toBe("BANCO_AGUARDAR");
    expect(valorSeletorFarol("DECLINOU", null)).toBe("DECLINOU");
  });

  it("retomar devolve o farol REAL ao seletor, sem precisar restaurar nada", () => {
    // É a prova de mesa do "volta de onde parou": mesma admissão, só a flag muda.
    const farolReal = "BANCO_AGUARDAR";
    expect(valorSeletorFarol(farolReal, "2026-07-27T12:00:00Z")).toBe(FAROL_PAUSADA);
    expect(valorSeletorFarol(farolReal, null)).toBe(farolReal);
  });
});
