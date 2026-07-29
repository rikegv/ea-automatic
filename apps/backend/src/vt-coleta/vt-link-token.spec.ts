import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { montarLinkVt } from "./vt-link.service";
import {
  carregarChavePrivadaVt,
  gerarTokenVt,
  nascHashDe,
  verificarTokenVt,
  VT_LINK_BASE_URL_PADRAO,
  type DadosTokenVt,
} from "./vt-link-token";

/**
 * Round-trip do token do link de VT com um par Ed25519 descartável (gerado no teste). Prova a
 * interop assinar-no-EA / verificar-com-a-pública, os claims e o cálculo do `nascHash`. NÃO depende
 * de nenhuma env nem de chave real configurada.
 */
describe("token do link de VT (Ed25519 / EdDSA)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicaPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privadaBase64 = Buffer.from(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    "utf8",
  ).toString("base64");

  const dados: DadosTokenVt = {
    admissaoId: "11111111-1111-1111-1111-111111111111",
    nome: "Fulano de Tal",
    cpf: "12345678901",
    dataNascimento: "1990-05-17",
  };

  it("assina e verifica com a chave pública (round-trip) e devolve os claims", () => {
    const chavePrivada = carregarChavePrivadaVt(privadaBase64);
    expect(chavePrivada).not.toBeNull();

    const agora = new Date("2026-07-24T12:00:00.000Z");
    const ttlDias = 7;
    const token = gerarTokenVt(dados, ttlDias, chavePrivada!, agora);

    // Formato JWT-shaped: header.payload.assinatura.
    expect(token.split(".")).toHaveLength(3);

    const claims = verificarTokenVt(token, publicaPem, agora);
    expect(claims.sub).toBe(dados.admissaoId);
    expect(claims.nome).toBe(dados.nome);
    expect(claims.cpf).toBe(dados.cpf);
    expect(typeof claims.jti).toBe("string");
    expect(claims.jti.length).toBeGreaterThan(0);

    // nascHash = sha256(`${cpf}|${dob}`).
    const esperado = createHash("sha256").update(`${dados.cpf}|${dados.dataNascimento}`).digest("hex");
    expect(claims.nascHash).toBe(esperado);
    expect(claims.nascHash).toBe(nascHashDe(dados.cpf, dados.dataNascimento));

    // exp ~ iat + ttl dias.
    const iat = Math.floor(agora.getTime() / 1000);
    expect(claims.iat).toBe(iat);
    expect(claims.exp).toBe(iat + ttlDias * 24 * 60 * 60);
  });

  it("recusa um token expirado", () => {
    const chavePrivada = carregarChavePrivadaVt(privadaBase64)!;
    const emitido = new Date("2026-07-01T00:00:00.000Z");
    const token = gerarTokenVt(dados, 1, chavePrivada, emitido);
    const depois = new Date("2026-07-03T00:00:00.000Z"); // > iat + 1 dia
    expect(() => verificarTokenVt(token, publicaPem, depois)).toThrow(/expirado/);
  });

  it("recusa um token adulterado (assinatura não confere)", () => {
    const chavePrivada = carregarChavePrivadaVt(privadaBase64)!;
    const token = gerarTokenVt(dados, 7, chavePrivada);
    const [h, , s] = token.split(".");
    const payloadForjado = Buffer.from(
      JSON.stringify({ ...dados, sub: "outra-admissao", exp: 9_999_999_999, iat: 1, jti: "x", nascHash: "y" }),
      "utf8",
    ).toString("base64url");
    const adulterado = `${h}.${payloadForjado}.${s}`;
    expect(() => verificarTokenVt(adulterado, publicaPem)).toThrow();
  });

  it("carregarChavePrivadaVt devolve null quando a env está ausente ou vazia", () => {
    expect(carregarChavePrivadaVt(undefined)).toBeNull();
    expect(carregarChavePrivadaVt("")).toBeNull();
    expect(carregarChavePrivadaVt("   ")).toBeNull();
  });

  it("monta o link com o token na query `t`", () => {
    const chavePrivada = carregarChavePrivadaVt(privadaBase64)!;
    const token = gerarTokenVt(dados, 7, chavePrivada);
    const link = montarLinkVt(VT_LINK_BASE_URL_PADRAO, token);
    expect(link).toBe(`${VT_LINK_BASE_URL_PADRAO}?t=${token}`);
    expect(link.startsWith("https://vt-online-soulan.web.app/vt?t=")).toBe(true);
  });
});
