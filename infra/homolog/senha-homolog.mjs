/**
 * Senha única de homologação para TODOS os usuários clonados.
 *
 * Por que todos, e não só um admin: a homologação existe para testar permissão de menu e a
 * segmentação por área (§A.23), e isso exige entrar como COMUM, como MASTER e como SUPER_ADMIN. O
 * clone preserva papel, área e marcação de menu; só a credencial é trocada.
 *
 * Por que trocar: clonar o hash de produção faria a senha REAL do time abrir a homologação, que tem
 * postura de segurança mais fraca por natureza.
 *
 * §A.6: NENHUMA credencial fica escrita neste arquivo. A conexão é montada a partir de `infra/.env`,
 * que é gitignorado, e a senha de homologação vem de `HML_SENHA`. Este arquivo VAI para o git, e o
 * que vai para o git não carrega segredo.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// argon2 é módulo NATIVO e postgres vive no workspace do backend. Resolvidos a partir do
// package.json do backend em vez de caminho fixo, senão qualquer upgrade do pnpm quebraria o script.
const require = createRequire(path.join(raiz, "apps/backend/package.json"));
const argon2 = require("argon2");
const postgres = require("postgres");

/** Lê `infra/.env` (gitignorado) para montar a conexão sem hardcode de credencial. */
function lerInfraEnv() {
  const texto = readFileSync(path.join(raiz, "infra/.env"), "utf8");
  const env = {};
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const DB_HOMOLOG = "ea_automatic_homolog";
const env = lerInfraEnv();
const url = `postgres://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@127.0.0.1:${env.POSTGRES_PORT ?? 5433}/${DB_HOMOLOG}`;

// Guard: este script NUNCA escreve fora da homologação.
if (!url.endsWith(`/${DB_HOMOLOG}`)) {
  throw new Error(`RECUSADO: este script só escreve em ${DB_HOMOLOG}`);
}

const SENHA = process.env.HML_SENHA;
if (!SENHA) {
  throw new Error("Defina HML_SENHA (a senha única dos usuários de homologação).");
}

const sql = postgres(url, { max: 1 });
const hash = await argon2.hash(SENHA);
const r = await sql`UPDATE usuarios SET senha_hash = ${hash}, senha_temporaria = false`;
console.log(`[homolog] senha aplicada a ${r.count} usuários.`);
await sql.end();
