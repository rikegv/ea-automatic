import "dotenv/config";
import { and, eq, inArray, isNull, sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes, clienteVinculos } from "./schema";
import { tipoServicoDeContrato } from "../domain/vinculo";

/**
 * LIGA O PONTEIRO `admissoes.cliente_vinculo_id` das admissões que JÁ EXISTEM (OST Onda 3, item 7,
 * Bloco 2).
 *
 * QUANDO RODAR: depois de dar a um cliente o SEGUNDO contrato. Enquanto o cliente tem um vínculo só,
 * este script não tem nada a fazer, e é assim de propósito: admissão de cliente de um contrato
 * resolve pelo cliente, exatamente como sempre resolveu, e mexer no ponteiro dela seria mudar o
 * comportamento de 233 clientes para não ganhar nada.
 *
 * RECORTE (a trava que evita reescrever história): SÓ clientes com DOIS OU MAIS vínculos ativos, SÓ
 * admissões com ponteiro nulo, e SÓ quando o tipo de contrato casa com exatamente um vínculo. O que
 * não casar fica como está e é reportado, porque um ponteiro errado aponta para a régua errada, e
 * isso é pior do que ponteiro nenhum.
 *
 * COMO RODAR (em apps/backend):
 *   npx tsx src/db/backfill-cliente-vinculo.ts            # dry-run, não escreve
 *   npx tsx src/db/backfill-cliente-vinculo.ts --aplicar  # aplica, transacional
 *
 * §A.6: só id de admissão, código de cliente e tipo de contrato. Nenhum dado pessoal.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");

  const { sql, db } = createDb(url, 1);
  try {
    // Clientes com 2+ vínculos ativos: o universo onde o ponteiro muda alguma coisa.
    const multi = await db
      .select({
        codCliente: clienteVinculos.codCliente,
        n: drizzleSql<number>`count(*)::int`,
      })
      .from(clienteVinculos)
      .where(eq(clienteVinculos.ativo, true))
      .groupBy(clienteVinculos.codCliente)
      .having(drizzleSql`count(*) >= 2`);

    console.log(`\n[backfill-vinculo] MODO: ${aplicar ? "APLICAR" : "DRY-RUN (não escreve)"}`);
    if (multi.length === 0) {
      console.log("[backfill-vinculo] nenhum cliente com dois ou mais contratos. Nada a fazer.\n");
      return;
    }
    const codigos = multi.map((m) => m.codCliente);
    console.log(`[backfill-vinculo] clientes com 2+ contratos: ${codigos.join(", ")}`);

    const vinculos = await db
      .select({
        id: clienteVinculos.id,
        codCliente: clienteVinculos.codCliente,
        tipoServico: clienteVinculos.tipoServico,
      })
      .from(clienteVinculos)
      .where(and(inArray(clienteVinculos.codCliente, codigos), eq(clienteVinculos.ativo, true)));

    const alvo = await db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        tipoContrato: admissoes.tipoContrato,
      })
      .from(admissoes)
      .where(
        and(inArray(admissoes.codCliente, codigos), isNull(admissoes.clienteVinculoId)),
      );

    const casadas: { id: string; vinculoId: string }[] = [];
    const semCasar: { id: string; motivo: string }[] = [];
    for (const a of alvo) {
      const tipo = tipoServicoDeContrato(a.tipoContrato);
      if (!tipo) {
        semCasar.push({ id: a.id, motivo: `tipo de contrato não reconhecido (${a.tipoContrato ?? "vazio"})` });
        continue;
      }
      const v = vinculos.find((x) => x.codCliente === a.codCliente && x.tipoServico === tipo);
      if (!v) {
        semCasar.push({ id: a.id, motivo: `cliente não tem contrato ${tipo}` });
        continue;
      }
      casadas.push({ id: a.id, vinculoId: v.id });
    }

    console.log(`[backfill-vinculo] admissões sem ponteiro: ${alvo.length}`);
    console.log(`[backfill-vinculo] casadas por (código + tipo): ${casadas.length}`);
    console.log(`[backfill-vinculo] SEM casar (ficam como estão): ${semCasar.length}`);
    for (const s of semCasar.slice(0, 20)) console.log(`   ${s.id}: ${s.motivo}`);

    if (!aplicar) {
      console.log("\nDRY-RUN: nada foi escrito. Rode com --aplicar para gravar.\n");
      return;
    }
    await db.transaction(async (tx) => {
      for (const c of casadas) {
        await tx
          .update(admissoes)
          .set({ clienteVinculoId: c.vinculoId })
          .where(eq(admissoes.id, c.id));
      }
    });
    console.log(`\n[backfill-vinculo] APLICADO: ${casadas.length} admissões apontadas.\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("[backfill-vinculo] FALHOU:", e);
  process.exit(1);
});
