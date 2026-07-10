import "dotenv/config";
import { count, eq } from "drizzle-orm";
import { createDb } from "./client";
import { kitRegraDocumento, kitTipo } from "./schema";

/**
 * Kits iniciais do Gerador de Kit (OST). Ponto de partida: o diretor ajusta depois pelo painel
 * /admin/kit-regras. Idempotente e NÃO destrutivo: cria o kit por nome se não existir; só popula os
 * documentos de um kit quando ele está VAZIO (nunca sobrescreve o que o diretor editou). Loga só
 * contagens (§A.6). Sem travessão (§A.11).
 *
 * Todos os kits têm os mesmos documentos BASE; só o CONTRATO (posição 2) varia por kit. O KIT FOPAG
 * não tem contrato (o funcionário é do próprio cliente).
 */
const BASE_ANTES = ["REGISTRO DE EMPREGADO"];
const BASE_DEPOIS = [
  "ACORDO PARA COMPENSAÇÃO DE HORAS DE TRABALHO",
  "AUTORIZAÇÃO DE CRÉDITOS EM CONTA BANCÁRIA",
  "DECLARAÇÃO DE DEPENDENTES",
  "FICHA DE SALÁRIO FAMÍLIA",
  "TERMO DE RESPONSABILIDADE",
  "AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ",
  "MANUAL",
  "MANUAL DE PROCEDIMENTOS MARCAÇÕES DE PONTO",
];

const KITS: { nome: string; contrato: string | null }[] = [
  { nome: "KIT TEMPORÁRIO", contrato: "CONTRATO DE TRABALHO TEMPORÁRIO" },
  { nome: "KIT TERCEIRO", contrato: "CONTRATO DE TRABALHO POR PRAZO INDETERMINADO" },
  { nome: "KIT INTERNO", contrato: "CONTRATO DE EXPERIÊNCIA" },
  { nome: "KIT ESTÁGIO", contrato: "TERMO DE COMPROMISSO DE ESTÁGIO" },
  { nome: "KIT FOPAG", contrato: null },
];

function documentosDoKit(contrato: string | null): string[] {
  return [...BASE_ANTES, ...(contrato ? [contrato] : []), ...BASE_DEPOIS];
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  let kitsCriados = 0;
  let kitsExistentes = 0;
  let docsInseridos = 0;
  let kitsPulados = 0;

  for (const [i, k] of KITS.entries()) {
    const inserido = await db
      .insert(kitTipo)
      .values({ nome: k.nome, ordem: i + 1, ativo: true })
      .onConflictDoNothing({ target: kitTipo.nome })
      .returning({ id: kitTipo.id });
    let kitId: string;
    if (inserido.length) {
      kitId = inserido[0].id;
      kitsCriados++;
    } else {
      const existente = await db.query.kitTipo.findFirst({ where: eq(kitTipo.nome, k.nome) });
      kitId = existente!.id;
      kitsExistentes++;
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(kitRegraDocumento)
      .where(eq(kitRegraDocumento.kitTipoId, kitId));

    if (Number(total) === 0) {
      const docs = documentosDoKit(k.contrato);
      await db
        .insert(kitRegraDocumento)
        .values(
          docs.map((titulo, idx) => ({ kitTipoId: kitId, titulo, ordem: idx + 1, ativo: true })),
        );
      docsInseridos += docs.length;
    } else {
      kitsPulados++;
    }
  }

  console.log("[seed-kit] Kits iniciais do Gerador de Kit.");
  console.log(`  Kits criados: ${kitsCriados} | já existentes: ${kitsExistentes}`);
  console.log(
    `  Documentos inseridos: ${docsInseridos} | kits com docs preservados: ${kitsPulados}`,
  );
  for (const k of KITS) {
    console.log(`  ${k.nome}: ${documentosDoKit(k.contrato).length} documentos base`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("[seed-kit] falhou:", err);
  process.exit(1);
});
