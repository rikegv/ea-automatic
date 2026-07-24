import "dotenv/config";
import { sql as fragmento } from "drizzle-orm";
import { createDb } from "./client";
import { menus, usuarios, usuarioMenus } from "./schema";
import { MENUS, codigosGrandfather } from "../domain/menus";

/**
 * SEED do catálogo de MENUS + GRANDFATHER da migração (OST permissão de menu, Bloco 5).
 *
 * 1) CONVERGE a tabela `menus` a partir do registro em código (`domain/menus`), no MESMO padrão do
 *    `frente_status_catalogo`: `onConflictDoUpdate` alinha rótulo, rota, grupo e ordem; a chave
 *    (`codigo`) nunca é tocada. O seed é o único escritor desta tabela, então rodar de novo só
 *    realinha. Menu novo aparece na tela de configuração rodando isto, sem deploy da tela.
 *
 * 2) MIGRAÇÃO SEM RUPTURA. O ponto crítico: ninguém pode perder acesso do dia para a noite. A regra
 *    de migração é GRANDFATHER por DADO: todo usuário ATIVO que ainda não tem NENHUMA linha em
 *    `usuario_menus` recebe TODOS os menus. Assim, no instante do deploy, cada usuário enxerga
 *    exatamente o que enxerga hoje, e o diretor vai restringindo um a um pela tela.
 *
 *    Por que "quem ainda não tem nenhuma linha": torna o seed IDEMPOTENTE e não destrutivo. Rodar de
 *    novo NÃO reverte quem o diretor já configurou (esse já tem linhas), só cobre quem nunca foi
 *    tocado. Usuário NOVO criado depois do deploy nasce sem menu e é configurado na própria criação
 *    (least privilege), então o grandfather não se aplica a ele.
 *
 *    MASTER/SUPER_ADMIN não dependem disto (bypass no guard), mas recebem as linhas mesmo assim, por
 *    uniformidade e para a tela de configuração deles aparecer coerente.
 *
 * §A.6: só ids e códigos de menu, nada de PII.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);
  try {
    // 1) Catálogo de menus (converge).
    await db
      .insert(menus)
      .values(MENUS.map(({ codigo, rotulo, href, grupo, ordem }) => ({
        codigo,
        rotulo,
        href,
        grupo,
        ordem,
        ativo: true,
      })))
      .onConflictDoUpdate({
        target: menus.codigo,
        set: {
          rotulo: fragmento`excluded.rotulo`,
          href: fragmento`excluded.href`,
          grupo: fragmento`excluded.grupo`,
          ordem: fragmento`excluded.ordem`,
          ativo: fragmento`true`,
        },
      });
    console.log(`[seed-menus] catálogo: ${MENUS.length} menus convergidos.`);

    // 2) Grandfather SENSÍVEL AO PAPEL: cada usuário ATIVO sem NENHUMA linha recebe EXATAMENTE o que
    //    o papel dele enxergava hoje. COMUM → menus de operação (sem Administração, sem Gerador de
    //    kit); admin → todos. Dar "todos" a um COMUM seria escalonar privilégio.
    const ativos = await db
      .select({ id: usuarios.id, papel: usuarios.papel })
      .from(usuarios)
      .where(fragmento`${usuarios.ativo} = true`);
    const jaConfig = await db
      .selectDistinct({ id: usuarioMenus.usuarioId })
      .from(usuarioMenus);
    const configurados = new Set(jaConfig.map((r) => r.id));
    const alvo = ativos.filter((u) => !configurados.has(u.id));

    let linhas = 0;
    for (const u of alvo) {
      const codigos = codigosGrandfather(u.papel);
      await db
        .insert(usuarioMenus)
        .values(codigos.map((menuCodigo) => ({ usuarioId: u.id, menuCodigo })))
        .onConflictDoNothing();
      linhas += codigos.length;
    }
    console.log(
      `[seed-menus] grandfather: ${alvo.length} usuário(s) sem configuração receberam os menus do ` +
        `próprio papel (${linhas} linhas); ${configurados.size} já configurado(s) preservado(s).`,
    );
    console.log("[seed-menus] concluído.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[seed-menus] falhou:", err);
  process.exit(1);
});
