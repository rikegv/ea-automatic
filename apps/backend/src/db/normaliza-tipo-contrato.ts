import "dotenv/config";
import { and, eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes } from "./schema";
import { canonicoDe } from "../domain/tipo-contrato";

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
 * O MAPA MORA EM `domain/tipo-contrato.ts` desde o incidente de 06/08/2026: o DTO da API precisa dele
 * para validar a entrada e não pode importar este script, que abre conexão com o banco. Aqui ficam só
 * os reexports, para os importadores existentes (e a linha de comando) seguirem funcionando iguais.
 */
export {
  TIPOS_CANONICOS,
  MAPA_GRAFIAS,
  canonicoDe,
  type TipoContratoCanonico,
} from "../domain/tipo-contrato";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");
  /**
   * `--vivas` restringe a escrita às admissões EM ANDAMENTO (EM_ADMISSAO/BANCO_AGUARDAR). Nasceu do
   * incidente de 06/08/2026: o que trava operação é a admissão viva que ainda vai passar pela
   * assinatura, e o diretor decidiu não reescrever o histórico junto. Sem a flag, o comportamento é
   * o de sempre (a base inteira).
   */
  const soVivas = process.argv.includes("--vivas");

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

    console.log(
      `\n[normaliza-tipo-contrato] MODO: ${aplicar ? "APLICAR" : "DRY-RUN (não escreve)"}` +
        `${soVivas ? " | RECORTE: só admissões VIVAS (EM_ADMISSAO/BANCO_AGUARDAR)" : ""}`,
    );
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
        const alvo = soVivas
          ? and(
              eq(admissoes.tipoContrato, l.tipo as string),
              inArray(admissoes.farolGlobal, ["EM_ADMISSAO", "BANCO_AGUARDAR"]),
            )
          : eq(admissoes.tipoContrato, l.tipo as string);
        const r = await tx
          .update(admissoes)
          .set({ tipoContrato: l.destino as string })
          .where(alvo);
        escritas += soVivas ? l.vivas : l.total;
        void r;
      }
    });
    console.log(
      `\n[normaliza-tipo-contrato] APLICADO: ${escritas} admissões normalizadas` +
        `${soVivas ? " (só as vivas; o histórico ficou como estava)" : ""}.\n`,
    );
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
