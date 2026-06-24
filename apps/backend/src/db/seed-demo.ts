import "dotenv/config";
import * as argon2 from "argon2";
import { createDb } from "./client";
import { usuarios } from "./schema";

/**
 * Seed de DESENVOLVIMENTO (não-produção): cria usuários de demonstração para os papéis
 * COMUM e MASTER, de modo que a validação visual exercite os 3 papéis. O seed oficial
 * (seed.ts) cria apenas o admin inicial. Senha dev vem de DEMO_PASSWORD (default abaixo).
 */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Demo!2026";

const DEMO_USERS: Array<{ nome: string; email: string; papel: "COMUM" | "MASTER" }> = [
  { nome: "Consultor Demo", email: "consultor@ea.local", papel: "COMUM" },
  { nome: "Master Demo", email: "master@ea.local", papel: "MASTER" },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");

  const { sql, db } = createDb(url, 1);
  const senhaHash = await argon2.hash(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    await db
      .insert(usuarios)
      .values({ ...u, senhaHash, ativo: true })
      .onConflictDoNothing({ target: usuarios.email });
    console.log(`[seed-demo] ${u.email} (${u.papel})`);
  }
  await sql.end();
  console.log(`[seed-demo] senha dev: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("[seed-demo] falhou:", err);
  process.exit(1);
});
