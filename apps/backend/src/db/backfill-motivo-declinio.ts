import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createDb } from "./client";

/**
 * Backfill do MOTIVO DE DECLÍNIO (Fase 2) sobre as admissões de declínio já carregadas.
 *
 * Fonte: CSV `backfill_motivos.csv` (gerado por extrai_motivos.py no scratchpad) com a chave LIMPA
 * (cpf, codCliente, cargoId, dataAdmissao) + o motivo canônico já resolvido pelo DE/PARA aprovado na
 * Fase 1 (texto após a última vírgula -> motivo canônico; branco/ruído fica sem motivo).
 *
 * Casa por (candidato_cpf + cod_cliente + cargo_id + data_admissao) contra admissões com farol de
 * declínio (DECLINOU/RESCISAO, que englobam as origens DECLINOU/RESCISÃO/CANCELADA), e grava
 * `motivo_declinio_id` (resolvido pelo nome na tabela `motivos_declinio`).
 *
 * IDEMPOTENTE: só atualiza quando o valor difere (`IS DISTINCT FROM`); rodar 2x não muda nada nem
 * sobrescreve errado. §A.6: nenhum CPF/PII em log, apenas contagens.
 * Uso: BACKFILL_MOTIVOS_CSV=<caminho> DATABASE_URL=... tsx apps/backend/src/db/backfill-motivo-declinio.ts
 */
const CSV = process.env.BACKFILL_MOTIVOS_CSV ?? "";
const DRY = process.env.BACKFILL_DRY === "1";

type Row = { cpf: string; codCliente: string; cargoId: string; dataAdmissao: string; motivo: string };

async function main() {
  if (!CSV) throw new Error("BACKFILL_MOTIVOS_CSV não definido");
  const rows: Row[] = parse(readFileSync(CSV, "utf8"), { columns: true, skip_empty_lines: true });
  const { sql } = createDb(process.env.DATABASE_URL!, 5);

  // Mapa nome do motivo -> id (catálogo já populado com os 25).
  const motivos = await sql<{ id: string; nome: string }[]>`SELECT id, nome FROM motivos_declinio`;
  const idPorNome = new Map(motivos.map((m) => [m.nome, m.id]));

  let atualizados = 0;
  let jaCorretos = 0;
  let semMatch = 0;
  let motivoInexistente = 0;

  for (const r of rows) {
    const motivoId = idPorNome.get(r.motivo);
    if (!motivoId) {
      motivoInexistente++;
      continue;
    }
    if (DRY) continue;
    const res = await sql`
      UPDATE admissoes
      SET motivo_declinio_id = ${motivoId}, atualizado_em = now()
      WHERE candidato_cpf = ${r.cpf}
        AND cod_cliente = ${r.codCliente}
        AND cargo_id = ${r.cargoId}
        AND data_admissao = ${r.dataAdmissao}
        AND farol_global IN ('DECLINOU', 'RESCISAO')
        AND motivo_declinio_id IS DISTINCT FROM ${motivoId}
      RETURNING id`;
    if (res.length > 0) {
      atualizados += res.length;
    } else {
      // 0 linhas: ou já estava correto, ou não achou a admissão. Distingue com um SELECT.
      const [{ existe }] = await sql<{ existe: number }[]>`
        SELECT count(*)::int AS existe FROM admissoes
        WHERE candidato_cpf = ${r.cpf} AND cod_cliente = ${r.codCliente}
          AND cargo_id = ${r.cargoId} AND data_admissao = ${r.dataAdmissao}
          AND farol_global IN ('DECLINOU', 'RESCISAO')`;
      if (existe > 0) jaCorretos++;
      else semMatch++;
    }
  }

  const [{ comMotivo, total }] = await sql<{ comMotivo: number; total: number }[]>`
    SELECT count(*) FILTER (WHERE motivo_declinio_id IS NOT NULL)::int AS "comMotivo",
           count(*)::int AS total
    FROM admissoes WHERE farol_global IN ('DECLINOU', 'RESCISAO')`;

  console.log(
    `[backfill]${DRY ? " (DRY)" : ""} linhas CSV: ${rows.length} | atualizados: ${atualizados} | ` +
      `já corretos: ${jaCorretos} | sem match: ${semMatch} | motivo inexistente: ${motivoInexistente}`,
  );
  console.log(`[backfill] declínios no banco: ${total} | com motivo agora: ${comMotivo} | sem motivo: ${total - comMotivo}`);
  await sql.end();
}

main().catch((e) => {
  console.error("[backfill] ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
