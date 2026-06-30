import { describe, expect, it } from "vitest";
import { normalizarLabel, resolverTipoDocumento } from "./resolver-tipo-documento";

describe("resolverTipoDocumento (Pandapé → catálogo §A.3)", () => {
  it("normaliza acento, caixa e pontuação", () => {
    expect(normalizarLabel("Comprovante de Residência")).toBe("comprovante de residencia");
    expect(normalizarLabel("  PIS/PASEP  ")).toBe("pis pasep");
  });

  it("mapeia rótulos conhecidos ao código do catálogo", () => {
    expect(resolverTipoDocumento("RG")).toBe("RG");
    expect(resolverTipoDocumento("Comprovante de Residência")).toBe("COMPROVANTE_RESIDENCIA");
    expect(resolverTipoDocumento("Atestado de Saúde Ocupacional")).toBe("ASO");
  });

  it("devolve undefined para rótulo não mapeado (chamador pula — não-bloqueio)", () => {
    expect(resolverTipoDocumento("Documento Estranho XYZ")).toBeUndefined();
    expect(resolverTipoDocumento(undefined)).toBeUndefined();
    expect(resolverTipoDocumento("")).toBeUndefined();
  });
});
