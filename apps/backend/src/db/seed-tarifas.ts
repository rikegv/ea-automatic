import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { count, sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { tarifasTransporte } from "./schema";

/**
 * Seed da tabela inicial de tarifas de transporte (fundação do VT Online, §A.17).
 * Fonte: src/db/data/tarifas-transporte-inicial.csv (planilha do diretor, vigência jan/2026,
 * tarifa comum). São tarifas públicas de transporte, sem dado pessoal (§A.6).
 *
 * Idempotente: UPSERT por (cidade + tipo_transporte), a chave de negócio. Rodar 2x não duplica e
 * não sobrescreve o `ativo` (não reativa o que o admin inativou pela tela). Em tarifa já existente,
 * atualiza valor/observação para o valor da fonte, que é o comportamento de recarga esperado.
 *
 * Manutenção contínua é pela tela /admin/tarifas; este seed só faz o bootstrap.
 * Gratuidade (Guararema, Santa Isabel) entra como valor 0.00: é tarifa real de valor zero, não
 * ausência de tarifa.
 */
const CSV_PATH = join(__dirname, "data", "tarifas-transporte-inicial.csv");

type LinhaCsv = {
  cidade_sistema: string;
  tipo_transporte: string;
  valor_rs: string;
  observacao: string;
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const linhas: LinhaCsv[] = parse(readFileSync(CSV_PATH, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  const values = linhas.map((l) => {
    const valor = Number(String(l.valor_rs).replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error(
        `Valor inválido para ${l.cidade_sistema} / ${l.tipo_transporte}: ${l.valor_rs}`,
      );
    }
    return {
      cidade: l.cidade_sistema,
      tipoTransporte: l.tipo_transporte,
      valor: valor.toFixed(2),
      observacao: l.observacao?.trim() ? l.observacao.trim() : null,
    };
  });

  const { sql, db } = createDb(url, 1);
  try {
    await db
      .insert(tarifasTransporte)
      .values(values)
      .onConflictDoUpdate({
        target: [tarifasTransporte.cidade, tarifasTransporte.tipoTransporte],
        set: {
          valor: drizzleSql`excluded.valor`,
          observacao: drizzleSql`excluded.observacao`,
          atualizadoEm: new Date(),
        },
      });

    const [{ total }] = await db.select({ total: count() }).from(tarifasTransporte);
    console.log(`[seed-tarifas] ${values.length} tarifas na fonte | ${total} na tabela.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
