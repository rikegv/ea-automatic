import "dotenv/config";
import { createDb } from "./client";
import { aplicarRegrasImportacao } from "./regras-esteira-import";

/**
 * Runner ONE-TIME da correção da carga Frente 1 já existente (OST regras permanentes de importação,
 * Fase 1). Apenas invoca `aplicarRegrasImportacao` (a rotina permanente, ver regras-esteira-import.ts)
 * sobre as admissões já carregadas. Idempotente e transacional. §A.6: só contagens, sem CPF/PII.
 *
 * A partir da Fase 3, toda importação futura (carga-*.ts) chama a MESMA rotina automaticamente ao
 * final, então este runner serve só para re-aplicar manualmente sobre uma base já importada.
 * Uso: DATABASE_URL=... tsx apps/backend/src/db/corrige-frente1.ts   (CORRIGE_DRY=1 para simular)
 */
const DRY = process.env.CORRIGE_DRY === "1";

async function main() {
  const { sql } = createDb(process.env.DATABASE_URL!, 5);

  const [{ concluidas }] = await sql`
    SELECT count(*)::int AS concluidas FROM admissoes WHERE farol_global = 'ADMISSAO_CONCLUIDA'`;
  const [{ declinios }] = await sql`
    SELECT count(*)::int AS declinios FROM admissoes WHERE farol_global IN ('DECLINOU', 'RESCISAO')`;
  console.log(`[corrige] alvo: concluídas=${concluidas} declínios=${declinios}${DRY ? " (DRY-RUN)" : ""}`);

  if (!DRY) {
    await aplicarRegrasImportacao(sql);
    console.log("[corrige] regras de importação aplicadas com sucesso.");
  }

  await sql.end();
}

main().catch((e) => {
  console.error("[corrige] ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
