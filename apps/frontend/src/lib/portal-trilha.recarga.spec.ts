import { describe, expect, it } from "vitest";
import { deveRecarregarAoVoltar } from "./portal-trilha";

/**
 * A RECARGA DA TRILHA QUANDO A ABA VOLTA A FICAR VISÍVEL, medida onde ela pode atropelar alguém.
 * O que o teste protege, em uma linha cada:
 *  1. o caso que originou o ajuste: o candidato volta do formulário do VT e a casa se atualiza;
 *  2. a recarga NÃO acontece fora da trilha (identificação, termo, o que reunir, conclusão);
 *  3. a recarga NUNCA passa por cima de um envio em andamento nem de uma leitura já em voo;
 *  4. a aba que fica ESCONDIDA não lê nada, que é a metade do `visibilitychange` que importa.
 */
const VOLTANDO = {
  tela: "TRILHA",
  terminou: false,
  temSessao: true,
  envioEmAndamento: false,
  jaCarregando: false,
  visivel: true,
};

describe("deveRecarregarAoVoltar", () => {
  it("o candidato volta do formulário do VT para a trilha: relê", () => {
    expect(deveRecarregarAoVoltar(VOLTANDO)).toBe(true);
  });

  it("a aba foi ESCONDIDA, não mostrada: não lê nada", () => {
    expect(deveRecarregarAoVoltar({ ...VOLTANDO, visivel: false })).toBe(false);
  });

  it("fora da trilha não recarrega, porque não há trilha na frente dele", () => {
    for (const tela of ["BOAS_VINDAS", "REUNIR", "COMO_FUNCIONA"]) {
      expect(deveRecarregarAoVoltar({ ...VOLTANDO, tela })).toBe(false);
    }
  });

  it("a conclusão é terminal: o placar já foi dado", () => {
    expect(deveRecarregarAoVoltar({ ...VOLTANDO, terminou: true })).toBe(false);
  });

  it("sem sessão não pede nada: pediria só para colher um 401", () => {
    expect(deveRecarregarAoVoltar({ ...VOLTANDO, temSessao: false })).toBe(false);
  });

  it("envio em andamento GANHA da recarga, e o próprio envio relê ao terminar", () => {
    expect(deveRecarregarAoVoltar({ ...VOLTANDO, envioEmAndamento: true })).toBe(false);
  });

  it("leitura já em voo: uma de cada vez, sem duas respostas se atropelando", () => {
    expect(deveRecarregarAoVoltar({ ...VOLTANDO, jaCarregando: true })).toBe(false);
  });
});
