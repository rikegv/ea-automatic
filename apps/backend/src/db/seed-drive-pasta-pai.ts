import "dotenv/config";
import { createDb } from "./client";
import { drivePastaPai } from "./schema";
import { montarLinhasSeed } from "./drive-pasta-pai-seed-linhas";

/**
 * SEED da tabela `drive_pasta_pai` (INT-2): importa TODOS os mapeamentos de pasta-pai que hoje vivem
 * no fallback em código (`drive-routing`) MAIS qualquer override presente no `.env`
 * (`DRIVE_FOPAG_*_FOLDER_ID` / `DRIVE_CONTRATO_*_FOLDER_ID`), para nenhum se perder ao tirar o
 * roteamento do `.env`. Idempotente por `onConflictDoNothing` sobre o unique (escopo + chave):
 * rodar de novo não duplica nem sobrescreve o que o admin já ajustou pela tela. A montagem das linhas
 * (com a precedência env > fallback) é a lógica pura de `drive-pasta-pai-seed-linhas`, testável sem
 * banco. §A.6: `folder_id` é identificador do Drive, não é PII nem segredo.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const linhas = montarLinhasSeed(process.env);
  // Universo esperado de pares (escopo + chave), para a prova de "nenhum se perde".
  const esperados = new Set(linhas.map((l) => `${l.escopo}:${l.chave}`));
  const doEnv = linhas.filter((l) => l.origem === "env");
  const doFallback = linhas.filter((l) => l.origem === "fallback");

  const { sql, db } = createDb(url, 1);
  try {
    let inseridos = 0;
    for (const l of linhas) {
      const res = await db
        .insert(drivePastaPai)
        .values({ escopo: l.escopo, chave: l.chave, folderId: l.folderId, rotulo: l.rotulo, ativo: true })
        .onConflictDoNothing()
        .returning({ id: drivePastaPai.id });
      if (res.length > 0) inseridos += 1;
    }

    // Prova: todo par esperado existe na tabela após o seed (idempotente, não perde nenhum).
    const presentes = await db
      .select({ escopo: drivePastaPai.escopo, chave: drivePastaPai.chave })
      .from(drivePastaPai);
    const presentesSet = new Set(presentes.map((r) => `${r.escopo}:${r.chave}`));
    const faltando = [...esperados].filter((e) => !presentesSet.has(e));
    if (faltando.length > 0) {
      throw new Error(`[seed-drive-pasta-pai] mapeamentos ausentes após o seed: ${faltando.join(", ")}`);
    }

    console.log(
      `[seed-drive-pasta-pai] ${esperados.size} mapeamento(s) esperado(s) ` +
        `(${doEnv.length} do .env + ${doFallback.length} do fallback); ${inseridos} novo(s) inserido(s), ` +
        `restante já presente. Nenhum perdido.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[seed-drive-pasta-pai] falhou:", err);
  process.exit(1);
});
