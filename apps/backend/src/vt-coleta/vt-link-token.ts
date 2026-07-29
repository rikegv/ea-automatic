import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

/**
 * Token do LINK do formulário de VT (§A.17 etapa 2), lado do EMISSOR.
 *
 * O consultor gera um link assinado que o candidato abre num app externo (Firebase). O app verifica
 * o token OFFLINE, só com a CHAVE PÚBLICA: o EA nunca é contatado e nunca fica exposto. Por isso a
 * assinatura é ASSIMÉTRICA (Ed25519 / alg "EdDSA"): a chave PRIVADA vive só no EA e assina; a
 * PÚBLICA vai para o app e apenas verifica.
 *
 * Sem dependência de biblioteca externa: nem `jose` nem `jsonwebtoken` estão instalados no backend,
 * e o `crypto` nativo do Node suporta Ed25519 de ponta a ponta (sign/verify com algoritmo `null`).
 * O formato do token é um JWS compacto no molde de um JWT (`base64url(header).base64url(payload).
 * base64url(assinatura)`), com header `{"alg":"EdDSA","typ":"JWT"}`, o que dá interoperabilidade
 * limpa com um verificador Node do lado Firebase (jose/jsonwebtoken lendo alg EdDSA).
 *
 * §A.6: o token carrega CPF e nome (é a credencial que o app usa), então NUNCA é logado, e o CPF, o
 * nome e o `nascHash` também não. Este arquivo só constrói e confere o token; não loga nada.
 */

/** TTL padrão do link em dias, quando `VT_LINK_TTL_DIAS` não está definido. */
export const VT_LINK_TTL_DIAS_PADRAO = 7;

/** URL base padrão do app externo do VT (Firebase). Sobrescrevível por `VT_LINK_BASE_URL`. */
export const VT_LINK_BASE_URL_PADRAO = "https://vt-online-soulan.web.app/vt";

/** Mensagem única quando o gerador de link não está configurado (chave privada ausente). */
export const VT_LINK_NAO_CONFIGURADO = "gerador de link do VT não configurado";

/** Cabeçalho fixo do JWS. `EdDSA` = Ed25519. */
const HEADER = { alg: "EdDSA", typ: "JWT" } as const;

const DIA_EM_SEGUNDOS = 24 * 60 * 60;

/** Dados de identidade do candidato que alimentam os claims do token. */
export interface DadosTokenVt {
  admissaoId: string;
  nome: string;
  cpf: string;
  /** Data de nascimento como string ISO `yyyy-mm-dd` (formato do `date` do Postgres). */
  dataNascimento: string;
}

/** Claims do token do link de VT (o que o app Firebase lê e confere). */
export interface ClaimsTokenVt {
  /** admissaoId. */
  sub: string;
  nome: string;
  cpf: string;
  /** sha256 hex de `${cpf}|${dataNascimento}`. Prova de posse de CPF + data sem expor a data crua. */
  nascHash: string;
  /** Emitido em (epoch, segundos). */
  iat: number;
  /** Expira em (epoch, segundos). */
  exp: number;
  /** Identificador único do token (uuid). */
  jti: string;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDeJson(obj: unknown): string {
  return base64url(Buffer.from(JSON.stringify(obj), "utf8"));
}

/** sha256 hex de `${cpf}|${dataNascimento}` (data no formato ISO `yyyy-mm-dd`). */
export function nascHashDe(cpf: string, dataNascimento: string): string {
  return createHash("sha256").update(`${cpf}|${dataNascimento}`).digest("hex");
}

/**
 * Importa a chave privada Ed25519 a partir do valor da env `VT_LINK_PRIVATE_KEY`: um PEM PKCS8
 * codificado em base64 (base64 para caber numa linha só do .env). Decodifica, importa e devolve a
 * KeyObject. Retorna `null` quando a env está ausente/vazia (integração INERTE, sem lançar no boot).
 */
export function carregarChavePrivadaVt(privateKeyBase64: string | undefined | null): KeyObject | null {
  const b64 = (privateKeyBase64 ?? "").trim();
  if (!b64) return null;
  const pem = Buffer.from(b64, "base64").toString("utf8");
  return createPrivateKey(pem);
}

/**
 * Assina o token do link de VT. Claims: `sub`=admissaoId, `nome`, `cpf`, `nascHash`, `iat`, `exp`
 * (=`iat` + `ttlDias` dias), `jti` (uuid). alg EdDSA. `agora` é injetável para teste determinístico.
 */
export function gerarTokenVt(
  dados: DadosTokenVt,
  ttlDias: number,
  chavePrivada: KeyObject,
  agora: Date = new Date(),
): string {
  const iat = Math.floor(agora.getTime() / 1000);
  const exp = iat + Math.round(ttlDias * DIA_EM_SEGUNDOS);
  const claims: ClaimsTokenVt = {
    sub: dados.admissaoId,
    nome: dados.nome,
    cpf: dados.cpf,
    nascHash: nascHashDe(dados.cpf, dados.dataNascimento),
    iat,
    exp,
    jti: randomUUID(),
  };
  const entrada = `${b64urlDeJson(HEADER)}.${b64urlDeJson(claims)}`;
  const assinatura = sign(null, Buffer.from(entrada, "utf8"), chavePrivada);
  return `${entrada}.${base64url(assinatura)}`;
}

/**
 * Confere o token com a CHAVE PÚBLICA (SPKI PEM) e devolve os claims. Usado só pelos testes para
 * provar o round-trip; o verificador real é o app Firebase. Lança `Error` se o formato, a assinatura,
 * o alg ou a validade (`exp`) não conferirem. `agora` é injetável para teste.
 */
export function verificarTokenVt(
  token: string,
  chavePublicaPem: string,
  agora: Date = new Date(),
): ClaimsTokenVt {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("token do VT malformado");
  const [headerB64, payloadB64, sigB64] = partes;

  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as {
    alg?: string;
  };
  if (header.alg !== "EdDSA") throw new Error("alg do token do VT inesperado");

  const entrada = `${headerB64}.${payloadB64}`;
  const chavePublica = createPublicKey(chavePublicaPem);
  const ok = verify(null, Buffer.from(entrada, "utf8"), chavePublica, Buffer.from(sigB64, "base64url"));
  if (!ok) throw new Error("assinatura do token do VT inválida");

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ClaimsTokenVt;
  const nowSec = Math.floor(agora.getTime() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) throw new Error("token do VT expirado");
  return claims;
}
