import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { GiDeParaService } from "./gi-depara.service";

/**
 * DE/PARA de código do GI: casa nome->código dos catálogos, e NUNCA inventa (sem correspondência,
 * devolve null e o campo fica vazio). §A.6: código público de catálogo, não PII.
 */

function svc(env: Record<string, string>): GiDeParaService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new GiDeParaService(config);
}

describe("GiDeParaService: fail-closed sem mapa", () => {
  it("sem env: todo codigo e null (nunca inventa)", () => {
    const s = svc({});
    expect(s.codigoCidade("Sao Paulo", "SP")).toBeNull();
    expect(s.codigoBanco("NUBANK")).toBeNull();
  });

  it("env com JSON invalido: ignora, continua null", () => {
    const s = svc({ GI_DEPARA_BANCOS: "{nao é json" });
    expect(s.codigoBanco("NUBANK")).toBeNull();
  });
});

describe("GiDeParaService: casa por nome normalizado (acento/caixa/espaco)", () => {
  it("cidade por 'UF|CIDADE', tolerante a acento e caixa", () => {
    const s = svc({ GI_DEPARA_CIDADES: JSON.stringify({ "SP|SAO PAULO": "7107" }) });
    expect(s.codigoCidade("São Paulo", "sp")).toBe("7107");
    expect(s.codigoCidade("SAO PAULO", "SP")).toBe("7107");
  });

  it("cidade de UF diferente NAO casa (mesmo nome)", () => {
    const s = svc({ GI_DEPARA_CIDADES: JSON.stringify({ "SP|SAO PAULO": "7107" }) });
    expect(s.codigoCidade("Sao Paulo", "RJ")).toBeNull();
  });

  it("banco por nome, tolerante a acento e caixa; codigo numerico vira string", () => {
    const s = svc({ GI_DEPARA_BANCOS: JSON.stringify({ "NU PAGAMENTOS S.A.": 260 }) });
    expect(s.codigoBanco("Nu Pagamentos S.A.")).toBe("260");
    expect(s.codigoBanco("BANCO DO BRASIL")).toBeNull();
  });

  it("nome nulo/vazio: null", () => {
    const s = svc({ GI_DEPARA_BANCOS: JSON.stringify({ NUBANK: "260" }) });
    expect(s.codigoBanco(null)).toBeNull();
    expect(s.codigoCidade(null, "SP")).toBeNull();
  });
});
