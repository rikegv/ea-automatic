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

/**
 * A LISTA AUTORITATIVA DOS PARES (EMPRESA, FILIAL) do GI. Validar os dois campos em separado não pega
 * `1|37`, numericamente válido nos dois e inexistente no fornecedor, então o par é conferido como par.
 *
 * §A.6: empresa e filial são código público de catálogo, não PII.
 */
describe("GiDeParaService: pares (empresa, filial), fail-closed sem a lista", () => {
  it("SEM a env, NENHUM par e conhecido: tudo recusa", () => {
    const s = svc({});
    expect(s.parEmpresaFilialConhecido(1, 4)).toBe(false);
    expect(s.parEmpresaFilialConhecido(1, 0)).toBe(false);
  });

  it("JSON invalido: ignora a lista e continua recusando tudo", () => {
    const s = svc({ GI_PARES_EMPRESA_FILIAL: "{nao é json" });
    expect(s.parEmpresaFilialConhecido(1, 4)).toBe(false);
  });

  it("forma LISTA de 'empresa|filial'", () => {
    const s = svc({ GI_PARES_EMPRESA_FILIAL: JSON.stringify(["1|4", "2|4", "43|0"]) });
    expect(s.parEmpresaFilialConhecido(1, 4)).toBe(true);
    expect(s.parEmpresaFilialConhecido(2, 4)).toBe(true);
    // FILIAL 0 E LEGITIMA no GI (existe para todas as 47 empresas), e 2 vinculos do EA a usam.
    expect(s.parEmpresaFilialConhecido(43, 0)).toBe(true);
  });

  it("forma LISTA de duplas", () => {
    const s = svc({ GI_PARES_EMPRESA_FILIAL: JSON.stringify([[1, 4], [1, 0]]) });
    expect(s.parEmpresaFilialConhecido(1, 4)).toBe(true);
    expect(s.parEmpresaFilialConhecido(1, 0)).toBe(true);
  });

  it("forma OBJETO filiais-por-empresa (como a medicao sai)", () => {
    const s = svc({ GI_PARES_EMPRESA_FILIAL: JSON.stringify({ "1": [0, 2, 4, 5], "2": [4] }) });
    expect(s.parEmpresaFilialConhecido(1, 5)).toBe(true);
    expect(s.parEmpresaFilialConhecido(2, 4)).toBe(true);
    expect(s.parEmpresaFilialConhecido(2, 5)).toBe(false);
  });

  it("par FORA da lista recusa, mesmo com os dois numeros validos (o caso `1|37`)", () => {
    const s = svc({ GI_PARES_EMPRESA_FILIAL: JSON.stringify(["1|4"]) });
    expect(s.parEmpresaFilialConhecido(1, 37)).toBe(false);
    expect(s.parEmpresaFilialConhecido(37, 4)).toBe(false);
  });

  it("empresa 0 nao entra na lista nem quando declarada: empresa 0 nao existe no GI", () => {
    const s = svc({ GI_PARES_EMPRESA_FILIAL: JSON.stringify(["0|0", "0|4"]) });
    expect(s.parEmpresaFilialConhecido(0, 0)).toBe(false);
    expect(s.parEmpresaFilialConhecido(0, 4)).toBe(false);
  });

  it("par malformado e DESCARTADO, e o resto da lista continua valendo", () => {
    const s = svc({
      GI_PARES_EMPRESA_FILIAL: JSON.stringify(["1|4", "x|4", "1|y", "1", "", "99999|4", "1|04"]),
    });
    expect(s.parEmpresaFilialConhecido(1, 4)).toBe(true);
    expect(s.parEmpresaFilialConhecido(99999, 4)).toBe(false); // estoura o int16
    expect(s.parEmpresaFilialConhecido(1, 4.5)).toBe(false);
  });
});
