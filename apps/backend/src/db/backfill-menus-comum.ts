import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { createDb } from "./client";
import { usuarios, usuarioMenus } from "./schema";
import { MENUS_PADRAO_COMUM } from "../domain/menus";

/**
 * BACKFILL do PADRÃO DO COMUM (decisão do diretor, 24/07/2026, Opção B).
 *
 * CONCEDE os 8 menus do grupo OPERAÇÃO (`MENUS_PADRAO_COMUM`, incluindo o Gerador de kit) a TODOS os
 * usuários COMUM ATIVOS, ADICIONANDO o que falta SEM REMOVER o que já têm. É ADITIVO e IDEMPOTENTE:
 *  - `onConflictDoNothing` sobre a PK (usuario_id, menu_codigo): rodar 2x não duplica.
 *  - só INSERT dos códigos de Operação: nunca apaga a Administração concedida pontualmente (ex.: a
 *    consultora de auditoria com Regras + Régua), nem remove nada.
 *
 * Não toca admin (MASTER/SUPER_ADMIN têm bypass no guard). §A.6: só ids e códigos de menu, sem PII.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);
  try {
    const comuns = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.papel, "COMUM"), eq(usuarios.ativo, true)));

    console.log(`[backfill-menus-comum] ${comuns.length} usuário(s) COMUM ativo(s).`);
    console.log(`[backfill-menus-comum] padrão a garantir: ${MENUS_PADRAO_COMUM.join(", ")}`);

    let totalInseridos = 0;
    for (const u of comuns) {
      const antes = new Set(
        (
          await db
            .select({ codigo: usuarioMenus.menuCodigo })
            .from(usuarioMenus)
            .where(eq(usuarioMenus.usuarioId, u.id))
        ).map((r) => r.codigo),
      );
      const faltando = MENUS_PADRAO_COMUM.filter((c) => !antes.has(c));

      if (faltando.length > 0) {
        await db
          .insert(usuarioMenus)
          .values(faltando.map((menuCodigo) => ({ usuarioId: u.id, menuCodigo })))
          .onConflictDoNothing();
        totalInseridos += faltando.length;
      }

      const depois = [...antes, ...faltando].sort();
      console.log(
        `[backfill-menus-comum] usuário ${u.id}: antes=${[...antes].sort().join(",") || "(vazio)"} | ` +
          `adicionados=${faltando.join(",") || "(nenhum)"} | depois=${depois.join(",")}`,
      );
    }

    console.log(
      `[backfill-menus-comum] concluído: ${totalInseridos} linha(s) de menu adicionada(s). Nada removido.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[backfill-menus-comum] falhou:", err);
  process.exit(1);
});
