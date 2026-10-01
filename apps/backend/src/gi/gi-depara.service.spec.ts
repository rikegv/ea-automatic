import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { GiDeParaService } from "./gi-depara.service";

/**
 * DE/PARA de código do GI: casa nome->código do catálogo de municípios, e NUNCA inventa (sem
 * correspondência, devolve null e o campo fica vazio). §A.6: código público de catálogo, não PII.
 *
 * O DE/PARA DE BANCO SAIU (01/10/2026): `codigoBcoFolha`/`codigoBcoPagar` são a conta pagadora da
 * EMPRESA e deixaram de ser enviados, então o `codigoBanco` e o `GI_DEPARA_BANCOS` ficaram sem
 * consumidor. Os casos deste spec que o cobriam saíram com ele; a cidade continua integralmente
 * coberta, inclusive o fail-closed sem env e o JSON inválido.
 */

function svc(env: Record<string, string>): GiDeParaService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new GiDeParaService(config);
}

describe("GiDeParaService: fail-closed sem mapa", () => {
  it("sem env: todo codigo e null (nunca inventa)", () => {
    const s = svc({});
    expect(s.codigoCidade("Sao Paulo", "SP")).toBeNull();
  });

  it("env com JSON invalido: ignora, continua null", () => {
    const s = svc({ GI_DEPARA_CIDADES: "{nao é json" });
    expect(s.codigoCidade("Sao Paulo", "SP")).toBeNull();
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

  it("codigo numerico no mapa vira string", () => {
    const s = svc({ GI_DEPARA_CIDADES: JSON.stringify({ "SP|SAO PAULO": 7107 }) });
    expect(s.codigoCidade("Sao Paulo", "SP")).toBe("7107");
  });

  it("nome/UF nulo ou vazio: null", () => {
    const s = svc({ GI_DEPARA_CIDADES: JSON.stringify({ "SP|SAO PAULO": "7107" }) });
    expect(s.codigoCidade(null, "SP")).toBeNull();
    expect(s.codigoCidade("Sao Paulo", null)).toBeNull();
  });
});
