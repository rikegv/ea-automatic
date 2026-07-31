import "dotenv/config";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes } from "./schema";

/**
 * NORMALIZA A GRAFIA DE `admissoes.tipo_contrato` (OST Onda 3, item 7, Bloco 1).
 *
 * POR QUE EXISTE. O campo é varchar LIVRE e a base acumulou 13 grafias para 6 contratos: "TEMP." e
 * "Temporário" são a mesma coisa escrita diferente, e o mesmo vale para TERC./Terceirizado,
 * FOPAG/Fopag, ESTA./Estágio e APREN./Jovem Aprendiz. Enquanto for assim, NADA que resolva por tipo
 * de contrato funciona de verdade: o vínculo do cliente (item 7), a pasta-pai do Drive (que já casa
 * por tipo normalizado, e por isso ignora "TEMP." hoje) e as dashboards contam a mesma coisa duas
 * vezes.
 *
 * DRY-RUN POR PADRÃO (decisão do diretor): é dado histórico de 2.397 admissões, então o script MOSTRA
 * o de/para por grafia e não escreve nada. Só `--aplicar` grava, e dentro de UMA transação.
 *
 * NÃO INVENTA TIPO. Grafia fora do mapa NÃO é convertida: aparece no relatório como pendente de
 * decisão. `NULL` continua `NULL` (a admissão realmente não tem tipo, e isso é pendência da régua,
 * não erro de grafia).
 *
 * COMO RODAR (em apps/backend):
 *   npx tsx src/db/normaliza-tipo-contrato.ts            # dry-run, não escreve
 *   npx tsx src/db/normaliza-tipo-contrato.ts --aplicar  # aplica, transacional
 *
 * §A.6: opera só sobre o tipo de contrato e contagens. Nenhum dado pessoal é lido ou logado.
 */

/**
 * A lista canônica é a MESMA do wizard (§A.22 W5): Temporário, Terceirizado, Estágio, Interno,
 * Fopag e Jovem Aprendiz. É a grafia que a tela oferece hoje, então normalizar para ela é fazer o
 * histórico falar a língua que o sistema já fala.
 */
export const TIPOS_CANONICOS = [
  "Temporário",
  "Terceirizado",
  "Estágio",
  "Interno",
  "Fopag",
  "Jovem Aprendiz",
] as const;
export type TipoContratoCanonico = (typeof TIPOS_CANONICOS)[number];

/**
 * De/para das grafias ENCONTRADAS na base. Só entram as inequívocas: a abreviação da carga e a forma
 * canônica que a tela já grava (esta última fica no mapa de propósito, para o script ser idempotente
 * e para o relatório mostrar o total real por tipo).
 *
 * FORA DO MAPA, deliberadamente:
 *  - `NULL` (57 admissões): não tem tipo, e inventar um seria pior que a ausência.
 *  - "ESTA. FOPAG" (5 admissões, todas concluídas): mistura DOIS conceitos (estágio e a folha Fopag)
 *    e só o diretor decide para qual dos dois vai.
 */
export const MAPA_GRAFIAS: Record<string, TipoContratoCanonico> = {
  "TEMP.": "Temporário",
  Temporário: "Temporário",
  "TERC.": "Terceirizado",
  Terceirizado: "Terceirizado",
  "ESTA.": "Estágio",
  Estágio: "Estágio",
  "INTER.": "Interno",
  Interno: "Interno",
  FOPAG: "Fopag",
  Fopag: "Fopag",
  "APREN.": "Jovem Aprendiz",
  "Jovem Aprendiz": "Jovem Aprendiz",
};

/** A grafia tem destino canônico? `null` = fora do mapa, não converte. */
export function canonicoDe(grafia: string | null): TipoContratoCanonico | null {
  if (grafia === null) return null;
  return MAPA_GRAFIAS[grafia] ?? null;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");

  const { sql, db } = createDb(url, 1);
  try {
    const linhas = await db
      .select({
        tipo: admissoes.tipoContrato,
        total: drizzleSql<number>`count(*)::int`,
        vivas: drizzleSql<number>`count(*) filter (where ${admissoes.farolGlobal} in ('EM_ADMISSAO','BANCO_AGUARDAR'))::int`,
      })
      .from(admissoes)
      .groupBy(admissoes.tipoContrato)
      .orderBy(drizzleSql`count(*) desc`);

    const converte = linhas
      .map((l) => ({ ...l, destino: canonicoDe(l.tipo) }))
      .filter((l) => l.destino !== null && l.destino !== l.tipo);
    const jaCanonicas = linhas.filter((l) => l.tipo !== null && canonicoDe(l.tipo) === l.tipo);
    const foraDoMapa = linhas.filter((l) => l.tipo !== null && canonicoDe(l.tipo) === null);
    const semTipo = linhas.find((l) => l.tipo === null);

    const totalBase = linhas.reduce((s, l) => s + l.total, 0);
    const totalConvertidas = converte.reduce((s, l) => s + l.total, 0);

    console.log(`\n[normaliza-tipo-contrato] MODO: ${aplicar ? "APLICAR" : "DRY-RUN (não escreve)"}`);
    console.log(`[normaliza-tipo-contrato] admissões na base: ${totalBase}\n`);

    console.log("CONVERTE (grafia -> canônico):");
    if (converte.length === 0) console.log("   nada a converter (base já normalizada).");
    for (const l of converte) {
      console.log(
        `   ${String(l.tipo).padEnd(16)} -> ${String(l.destino).padEnd(16)} ${String(l.total).padStart(5)} admissões  (${l.vivas} vivas)`,
      );
    }

    console.log("\nJÁ CANÔNICAS (não mexe):");
    for (const l of jaCanonicas) {
      console.log(`   ${String(l.tipo).padEnd(16)} ${String(l.total).padStart(5)} admissões  (${l.vivas} vivas)`);
    }

    console.log("\nNÃO CONVERTE, decisão do diretor:");
    if (semTipo) {
      console.log(
        `   ${"<sem tipo>".padEnd(16)} ${String(semTipo.total).padStart(5)} admissões  (${semTipo.vivas} vivas) ` +
          `-> permanece NULL (não inventar tipo; segue como pendência da régua)`,
      );
    }
    for (const l of foraDoMapa) {
      console.log(
        `   ${String(l.tipo).padEnd(16)} ${String(l.total).padStart(5)} admissões  (${l.vivas} vivas) ` +
          `-> grafia ambígua, fora do mapa`,
      );
    }

    console.log(
      `\nRESUMO: ${totalConvertidas} admissões seriam convertidas; ` +
        `${jaCanonicas.reduce((s, l) => s + l.total, 0)} já estão canônicas; ` +
        `${(semTipo?.total ?? 0) + foraDoMapa.reduce((s, l) => s + l.total, 0)} ficam como estão.`,
    );

    if (!aplicar) {
      console.log("\nDRY-RUN: nada foi escrito. Rode com --aplicar para gravar.\n");
      return;
    }

    // UMA transação: ou a base inteira fica normalizada, ou nada muda.
    let escritas = 0;
    await db.transaction(async (tx) => {
      for (const l of converte) {
        const r = await tx
          .update(admissoes)
          .set({ tipoContrato: l.destino as string })
          .where(eq(admissoes.tipoContrato, l.tipo as string));
        escritas += l.total;
        void r;
      }
    });
    console.log(`\n[normaliza-tipo-contrato] APLICADO: ${escritas} admissões normalizadas.\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Só executa quando chamado como script (o mapa é importável pelos testes sem tocar o banco).
if (process.argv[1]?.includes("normaliza-tipo-contrato")) {
  main().catch((e) => {
    console.error("[normaliza-tipo-contrato] FALHOU:", e);
    process.exit(1);
  });
}
