import { describe, expect, it } from "vitest";
import { CANDIDATURA_ETAPAS, CANDIDATURA_SITUACOES, VAGA_STATUS } from "@ea/shared-types";
import { tomDaEtapa, tomDaSituacao, tomDoStatusVaga } from "@/lib/as-candidatos-visual";

/**
 * §A.12: o ícone da pill acompanha o ESTADO REAL e nunca é fixo. Quem escolhe o ícone é a
 * `StatusPill` a partir do TOM, então testar o tom é testar o ícone.
 */
describe("tomDaSituacao (o ícone acompanha o estado real, §A.12)", () => {
  it("ALOCADO é ENTREGA, e por isso é check verde e não a exclamação de trabalho em andamento", () => {
    expect(tomDaSituacao("ALOCADO")).toBe("ok");
  });

  it("quem ocupa posição na vaga é êxito: aprovado, alocado e enviado para admissão", () => {
    expect(tomDaSituacao("APROVADO")).toBe("ok");
    expect(tomDaSituacao("ENVIADO_PARA_ADMISSAO")).toBe("ok");
  });

  it("quem saiu sem êxito é o X vermelho, e os dois motivos de saída pesam igual", () => {
    expect(tomDaSituacao("DESCARTADO")).toBe("dg");
    expect(tomDaSituacao("DESISTIU")).toBe("dg");
  });

  it("só quem segue em seleção fica na exclamação amarela de trabalho em andamento", () => {
    const amarelos = CANDIDATURA_SITUACOES.filter((s) => tomDaSituacao(s) === "wn");
    expect(amarelos).toEqual(["ATIVO"]);
  });

  it("toda situação do catálogo tem tom: nenhuma pill nasce sem cor decidida", () => {
    for (const s of CANDIDATURA_SITUACOES) expect(tomDaSituacao(s)).toBeTruthy();
  });
});

describe("tomDaEtapa e tomDoStatusVaga (o resto do mapa visual segue intacto)", () => {
  it("a etapa é informação, e só a Aprovação fecha em verde", () => {
    for (const e of CANDIDATURA_ETAPAS) {
      expect(tomDaEtapa(e)).toBe(e === "APROVACAO" ? "ok" : "in");
    }
  });

  it("todo status de vaga tem tom", () => {
    for (const s of VAGA_STATUS) expect(tomDoStatusVaga(s)).toBeTruthy();
  });
});
