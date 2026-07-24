import { describe, expect, it } from "vitest";
import {
  auditoriaParada,
  horasParado,
  LIMIAR_AUDITORIA_PARADA_MS,
  resumirParados,
} from "./auditoria-parada";

const AGORA = new Date("2026-07-23T12:00:00Z");
const hAtras = (h: number) => new Date(AGORA.getTime() - h * 60 * 60 * 1000);

describe("horasParado", () => {
  it("conta horas inteiras para baixo", () => {
    expect(horasParado(hAtras(14), AGORA)).toBe(14);
    expect(horasParado(hAtras(0.5), AGORA)).toBe(0);
  });

  it("sem data e data no futuro devolvem 0, sem quebrar", () => {
    expect(horasParado(null, AGORA)).toBe(0);
    expect(horasParado(new Date(AGORA.getTime() + 60_000), AGORA)).toBe(0);
  });
});

describe("auditoriaParada", () => {
  it("o limiar é 6h", () => {
    expect(LIMIAR_AUDITORIA_PARADA_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("AGUARDANDO_AUDITORIA além do limiar está parado", () => {
    expect(auditoriaParada({ estado: "AGUARDANDO_AUDITORIA", atualizadoEm: hAtras(14) }, AGORA)).toBe(
      true,
    );
  });

  it("AGUARDANDO_AUDITORIA recente NÃO está parado (auditoria normal leva segundos)", () => {
    expect(auditoriaParada({ estado: "AGUARDANDO_AUDITORIA", atualizadoEm: hAtras(1) }, AGORA)).toBe(
      false,
    );
  });

  it("exatamente no limiar já conta", () => {
    expect(auditoriaParada({ estado: "AGUARDANDO_AUDITORIA", atualizadoEm: hAtras(6) }, AGORA)).toBe(
      true,
    );
  });

  // Documento PENDENTE antigo é ausência legítima (candidato não mandou), não anomalia.
  it("outros estados nunca marcam, por mais antigos que sejam", () => {
    for (const estado of ["PENDENTE", "ENTREGUE", "INCONFORME", null, undefined]) {
      expect(auditoriaParada({ estado, atualizadoEm: hAtras(500) }, AGORA)).toBe(false);
    }
  });

  it("sem carimbo não marca (não se inventa antiguidade)", () => {
    expect(auditoriaParada({ estado: "AGUARDANDO_AUDITORIA", atualizadoEm: null }, AGORA)).toBe(false);
  });
});

describe("resumirParados (embrião da tela de diagnóstico)", () => {
  it("conta os parados e devolve as horas do mais antigo", () => {
    const r = resumirParados(
      [
        { estado: "AGUARDANDO_AUDITORIA", atualizadoEm: hAtras(14) },
        { estado: "AGUARDANDO_AUDITORIA", atualizadoEm: hAtras(30) },
        { estado: "AGUARDANDO_AUDITORIA", atualizadoEm: hAtras(2) }, // abaixo do limiar
        { estado: "INCONFORME", atualizadoEm: hAtras(900) },
      ],
      AGORA,
    );
    expect(r).toEqual({ total: 2, maisAntigoHoras: 30 });
  });

  it("base saudável devolve zero, sem caso especial no chamador", () => {
    expect(resumirParados([], AGORA)).toEqual({ total: 0, maisAntigoHoras: 0 });
  });
});
