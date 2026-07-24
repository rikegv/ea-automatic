import { describe, expect, it } from "vitest";
import {
  estadoAposFalha,
  familiaPorStatus,
  familiaRetentavel,
  INTERVALOS_RETENTATIVA_MS,
  MAX_RETENTATIVAS,
  MOTIVO_FALHA_IA,
  type FamiliaFalhaIa,
} from "./falha-auditoria";

const TODAS: FamiliaFalhaIa[] = [
  "QUOTA",
  "ENTRADA",
  "CREDENCIAL",
  "INDISPONIBILIDADE",
  "DESCONHECIDA",
];

describe("familiaPorStatus", () => {
  it("429 é QUOTA", () => {
    expect(familiaPorStatus(429)).toBe("QUOTA");
  });

  // O CASO QUE ORIGINOU A OST: 415 estava classificado como indisponibilidade, o que é falso.
  it("415 é ENTRADA, não indisponibilidade (o motor respondeu, o arquivo é que não serve)", () => {
    expect(familiaPorStatus(415)).toBe("ENTRADA");
  });

  it("422 é ENTRADA", () => {
    expect(familiaPorStatus(422)).toBe("ENTRADA");
  });

  it("401 e 403 são CREDENCIAL", () => {
    expect(familiaPorStatus(401)).toBe("CREDENCIAL");
    expect(familiaPorStatus(403)).toBe("CREDENCIAL");
  });

  it("5xx, 408 e 504 são INDISPONIBILIDADE", () => {
    expect(familiaPorStatus(500)).toBe("INDISPONIBILIDADE");
    expect(familiaPorStatus(502)).toBe("INDISPONIBILIDADE");
    expect(familiaPorStatus(503)).toBe("INDISPONIBILIDADE");
    expect(familiaPorStatus(408)).toBe("INDISPONIBILIDADE");
    expect(familiaPorStatus(504)).toBe("INDISPONIBILIDADE");
  });

  it("status inesperado, nulo ou ausente cai em DESCONHECIDA (nunca fica sem família)", () => {
    expect(familiaPorStatus(418)).toBe("DESCONHECIDA");
    expect(familiaPorStatus(null)).toBe("DESCONHECIDA");
    expect(familiaPorStatus(undefined)).toBe("DESCONHECIDA");
  });
});

describe("motivo exibido", () => {
  it("toda família tem motivo, e nenhum sugere processamento em andamento", () => {
    for (const f of TODAS) {
      const texto = MOTIVO_FALHA_IA[f];
      expect(texto.length).toBeGreaterThan(20);
      // O defeito original era exatamente esta frase ficar no lugar após a falha.
      expect(texto.toLowerCase()).not.toContain("aguardando a análise");
    }
  });

  it("nenhum motivo tem travessão (§A.11)", () => {
    for (const f of TODAS) expect(MOTIVO_FALHA_IA[f]).not.toContain("—");
  });

  it("o motivo de ENTRADA manda o consultor pedir reenvio (é a ação que resolve)", () => {
    expect(MOTIVO_FALHA_IA.ENTRADA.toLowerCase()).toContain("reenvio");
  });

  it("o motivo de CREDENCIAL diz para NÃO insistir e escalar, porque não converge sozinho", () => {
    expect(MOTIVO_FALHA_IA.CREDENCIAL.toLowerCase()).toContain("avise a ti");
  });
});

describe("estadoAposFalha", () => {
  it("ENTRADA vira INCONFORME: é veredito, não espera", () => {
    expect(estadoAposFalha("ENTRADA")).toBe("INCONFORME");
  });

  it("falha NOSSA mantém o documento coletado, sem veredito", () => {
    for (const f of TODAS.filter((x) => x !== "ENTRADA")) {
      expect(estadoAposFalha(f)).toBe("AGUARDANDO_AUDITORIA");
    }
  });
});

describe("política de retentativa (Bloco 4)", () => {
  it("retenta só o que é transitório", () => {
    expect(familiaRetentavel("QUOTA")).toBe(true);
    expect(familiaRetentavel("INDISPONIBILIDADE")).toBe(true);
  });

  it("NÃO retenta o determinístico: repetir não converge, só queima IA", () => {
    expect(familiaRetentavel("ENTRADA")).toBe(false);
    expect(familiaRetentavel("CREDENCIAL")).toBe(false);
    expect(familiaRetentavel("DESCONHECIDA")).toBe(false);
  });

  it("são 2 retentativas (3 tentativas no total), com 2s e 6s", () => {
    expect(MAX_RETENTATIVAS).toBe(2);
    expect([...INTERVALOS_RETENTATIVA_MS]).toEqual([2_000, 6_000]);
  });
});
