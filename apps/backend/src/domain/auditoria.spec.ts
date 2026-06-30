import { describe, expect, it } from "vitest";
import { AUDITORIA_STATUS } from "@ea/shared-types";
import { estadoDocumentoDeAuditoria, limitarMotivo } from "./auditoria";

describe("estadoDocumentoDeAuditoria (veredito IA → estado_documento, §A.3 regra 7)", () => {
  it("mapeia cada veredito ao estado persistido", () => {
    expect(estadoDocumentoDeAuditoria("VALIDADO")).toBe("ENTREGUE");
    expect(estadoDocumentoDeAuditoria("INCONFORME")).toBe("INCONFORME");
    expect(estadoDocumentoDeAuditoria("PENDENTE")).toBe("PENDENTE");
  });

  it("cobre todos os AuditoriaStatus do contrato congelado", () => {
    for (const s of AUDITORIA_STATUS) {
      const estado = estadoDocumentoDeAuditoria(s);
      expect(["ENTREGUE", "INCONFORME", "PENDENTE"]).toContain(estado);
    }
  });
});

describe("limitarMotivo (cap da observacao — §A.6)", () => {
  it("trunca em 500 caracteres por padrão", () => {
    expect(limitarMotivo("a".repeat(600)).length).toBe(500);
  });

  it("trata nulo/indefinido como string vazia", () => {
    expect(limitarMotivo(null)).toBe("");
    expect(limitarMotivo(undefined)).toBe("");
  });
});
