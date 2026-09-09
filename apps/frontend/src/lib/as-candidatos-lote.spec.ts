import { describe, expect, it } from "vitest";
import type { AsResultadoEmMassa } from "@ea/shared-types";
import { nomeDoAlvo, resumoDoLote, tomDoResultado } from "./as-candidatos-lote";

/**
 * ─ A LEITURA DO RESULTADO DO LOTE ──────────────────────────────────────────────────────────────
 *
 * O lote é PARCIAL por decisão do diretor, e a tela tem de mostrar as DUAS metades: quantas foram e
 * quais não foram. Estas réguas erram em silêncio (um tom errado desenha recusa como sucesso, um
 * plural errado faz a interface parecer relatório de banco), então são afirmadas aqui.
 */

function resultado(over: Partial<AsResultadoEmMassa> = {}): AsResultadoEmMassa {
  return { aplicadas: 0, falhas: [], ...over };
}

describe("tomDoResultado", () => {
  it("lote inteiro aplicado é sucesso", () => {
    expect(tomDoResultado(resultado({ aplicadas: 3 }))).toBe("ok");
  });

  it("aplicou algumas e recusou outras é PARCIAL, nunca sucesso", () => {
    expect(
      tomDoResultado(resultado({ aplicadas: 2, falhas: [{ alvoId: "a", motivo: "cheia" }] })),
    ).toBe("parcial");
  });

  /*
   * O CASO QUE DÁ O DANO: zero aplicadas com o check verde diria ao consultor que ele entregou
   * posições que não entregou. Ele é um estado PRÓPRIO, e não "parcial com zero".
   */
  it("nada aplicado NÃO é parcial: é recusa inteira", () => {
    expect(
      tomDoResultado(resultado({ aplicadas: 0, falhas: [{ alvoId: "a", motivo: "cheia" }] })),
    ).toBe("nada");
  });
});

describe("resumoDoLote", () => {
  it("diz as duas metades quando houve falha", () => {
    const frase = resumoDoLote(
      resultado({
        aplicadas: 5,
        falhas: [
          { alvoId: "a", motivo: "cheia" },
          { alvoId: "b", motivo: "cheia" },
        ],
      }),
    );
    expect(frase).toContain("5 linhas aplicadas");
    expect(frase).toContain("2 linhas não foram aplicadas");
  });

  it("não deixa a metade das falhas implícita quando não houve nenhuma", () => {
    expect(resumoDoLote(resultado({ aplicadas: 1 }))).toBe("1 linha aplicada. Nenhuma falhou.");
  });

  it("calcula o plural em vez de escrever linha(s)", () => {
    const uma = resumoDoLote(resultado({ aplicadas: 1, falhas: [{ alvoId: "a", motivo: "x" }] }));
    expect(uma).toContain("1 linha aplicada");
    expect(uma).toContain("1 linha não foi aplicada");
    expect(uma).not.toContain("(s)");
  });

  /** §A.11: travessão proibido em qualquer texto que chegue ao usuário. */
  it("nenhuma frase carrega travessão", () => {
    const frase = resumoDoLote(resultado({ aplicadas: 2, falhas: [{ alvoId: "a", motivo: "x" }] }));
    expect(frase).not.toContain("—");
  });
});

describe("nomeDoAlvo", () => {
  it("usa o nome que a tela já tinha em memória", () => {
    expect(nomeDoAlvo("c1", new Map([["c1", "Fulano De Tal"]]))).toBe("Fulano De Tal");
  });

  /*
   * §A.6 e §A.11 juntas: a resposta traz só o id, e o id é técnico. Imprimi-lo seria vazar dado
   * interno para a tela; o vazio é a palavra "não informado", nunca o glifo do travessão.
   */
  it("desconhecido vira 'não informado', nunca o id cru", () => {
    expect(nomeDoAlvo("c9", new Map([["c1", "Fulano"]]))).toBe("não informado");
  });
});
