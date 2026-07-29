import { generateKeyPairSync } from "node:crypto";

/**
 * Geração do par de chaves Ed25519 do LINK do formulário de VT (§A.17).
 *
 * A chave PRIVADA fica só no EA (`VT_LINK_PRIVATE_KEY`, em base64 do PEM PKCS8 para caber numa linha
 * do .env) e assina o token; a chave PÚBLICA vai para o app externo (Firebase), que verifica o token
 * OFFLINE. Emitido em SPKI PEM e também em JWK (formatos que um verificador Node lê direto).
 *
 * Só imprime no stdout: NÃO escreve em disco, NÃO toca em nenhum .env. Rodar por conta do
 * coordenador. §A.6: nenhum dado pessoal aqui, só material de chave.
 *
 * Como rodar (a partir de apps/backend):
 *   pnpm exec tsx scripts/gen-vt-link-keys.ts
 */

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const privadaPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicaPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privadaBase64 = Buffer.from(privadaPem, "utf8").toString("base64");
const publicaJwk = publicKey.export({ format: "jwk" });

const sep = "=".repeat(72);

console.log(sep);
console.log("EA :: VT_LINK_PRIVATE_KEY (cole no apps/backend/.env, base64 do PEM PKCS8)");
console.log(sep);
console.log(`VT_LINK_PRIVATE_KEY=${privadaBase64}`);
console.log("");
console.log(sep);
console.log("APP FIREBASE :: chave publica em SPKI PEM (entregar ao verificador)");
console.log(sep);
console.log(publicaPem.trim());
console.log("");
console.log(sep);
console.log("APP FIREBASE :: chave publica em JWK (alternativa para o verificador)");
console.log(sep);
console.log(JSON.stringify({ ...publicaJwk, alg: "EdDSA", use: "sig" }, null, 2));
