import { describe, expect, it } from "vitest";
import { rotuloParado } from "./parado";

describe("rotuloParado", () => {
  it("singular e plural de horas", () => {
    expect(rotuloParado(1)).toBe("1 hora");
    expect(rotuloParado(14)).toBe("14 horas");
  });

  it("abaixo de 1 hora não inventa número", () => {
    expect(rotuloParado(0)).toBe("menos de 1 hora");
  });

  it("a partir de 48h fala em dias, como a operação fala", () => {
    expect(rotuloParado(48)).toBe("2 dias");
    expect(rotuloParado(75)).toBe("3 dias");
  });

  it("valor inválido não quebra a tela", () => {
    expect(rotuloParado(Number.NaN)).toBe("menos de 1 hora");
  });

  it("sem travessão (§A.11)", () => {
    for (const h of [0, 1, 14, 48, 200]) expect(rotuloParado(h)).not.toContain("—");
  });
});
