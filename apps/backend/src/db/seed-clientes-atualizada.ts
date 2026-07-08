import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { sql as drizzleSql, notInArray } from "drizzle-orm";
import { createDb } from "./client";
import { clientes, clienteVinculos } from "./schema";

/**
 * Carga/reconciliação da base ATUALIZADA de clientes (OST estrutural — Fase 2).
 * Fonte: src/db/data/clientes-carga-atualizada-07-07.csv (gerada da planilha do diretor).
 *
 * Idempotente e SEM exclusão:
 *  - `clientes`: UPSERT por `cod_cliente`. Em cliente EXISTENTE, atualiza SÓ os campos da base
 *    (razão social, cnpj do cliente, região, descrição da região) — **preserva** nome_operacao,
 *    os *_padrao (benefícios/escala/endereço) já editados, empresa_grupo e o flag `ativo` (não
 *    reativa quem o admin inativou). Cliente NOVO é inserido.
 *  - `cliente_vinculos`: UPSERT por (cod_cliente, empresa_codigo, filial). `tipo_servico` derivado do
 *    código "Empresa" (1,3=TEMPORARIO · 2=TERCEIRO · 4=ESTAGIO · 5,6=INTERNO · >6=FOPAG). `is_fopag`
 *    quando >6. `entidade_id` fica NULL (CNPJ por filial é insumo PENDENTE do diretor — não inventar).
 *  - Reporta os clientes que estão no EA e SOMEM da base nova → **mantidos** (nunca excluídos) e
 *    listados para o diretor decidir.
 *
 * Não loga CNPJ/razão de forma sensível além do necessário para a reconciliação (§A.6).
 */
const CSV_PATH = join(__dirname, "data", "clientes-carga-atualizada-07-07.csv");

type LinhaCsv = {
  cod_cliente: string;
  nome_cliente: string;
  cnpj_cliente: string;
  empresa: string;
  filial: string;
  regiao: string;
  descricao_regiao: string;
};

type TipoServico = "TEMPORARIO" | "TERCEIRO" | "ESTAGIO" | "INTERNO" | "FOPAG";

/** Código "Empresa" da base → tipo de serviço (regra do diretor). >6 = FOPAG. */
export function tipoServicoDeEmpresa(empresaCodigo: string): TipoServico {
  const n = Number.parseInt(empresaCodigo, 10);
  if (n === 1 || n === 3) return "TEMPORARIO";
  if (n === 2) return "TERCEIRO";
  if (n === 4) return "ESTAGIO";
  if (n === 5 || n === 6) return "INTERNO";
  return "FOPAG"; // > 6 (ou fora da faixa 1–6)
}

function nz(v: string | undefined | null): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const linhas = parse(readFileSync(CSV_PATH, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as LinhaCsv[];

  const clientesValores = linhas.map((l) => ({
    codCliente: l.cod_cliente.trim(),
    razaoSocial: l.nome_cliente.trim(),
    cnpj: nz(l.cnpj_cliente),
    regiao: nz(l.regiao),
    descricaoRegiao: nz(l.descricao_regiao),
  }));

  const { sql, db } = createDb(url, 1);

  // 1) UPSERT clientes — em existente, atualiza SÓ os campos da base (preserva o resto).
  const resClientes = await db
    .insert(clientes)
    .values(clientesValores)
    .onConflictDoUpdate({
      target: clientes.codCliente,
      set: {
        razaoSocial: drizzleSql`excluded.razao_social`,
        cnpj: drizzleSql`excluded.cnpj`,
        regiao: drizzleSql`excluded.regiao`,
        descricaoRegiao: drizzleSql`excluded.descricao_regiao`,
        atualizadoEm: drizzleSql`now()`,
      },
    })
    .returning({ inserido: drizzleSql<boolean>`(xmax = 0)` });

  const inseridos = resClientes.filter((r) => r.inserido).length;
  const atualizados = resClientes.length - inseridos;

  // 2) UPSERT vínculos (empresa+filial+tipo). entidade_id NULL (CNPJ por filial pendente).
  const vinculosValores = linhas.map((l) => {
    const tipo = tipoServicoDeEmpresa(l.empresa);
    return {
      codCliente: l.cod_cliente.trim(),
      empresaCodigo: l.empresa.trim(),
      tipoServico: tipo,
      filial: nz(l.filial),
      isFopag: tipo === "FOPAG",
    };
  });

  await db
    .insert(clienteVinculos)
    .values(vinculosValores)
    .onConflictDoUpdate({
      target: [clienteVinculos.codCliente, clienteVinculos.empresaCodigo, clienteVinculos.filial],
      set: {
        tipoServico: drizzleSql`excluded.tipo_servico`,
        isFopag: drizzleSql`excluded.is_fopag`,
        ativo: drizzleSql`true`,
        atualizadoEm: drizzleSql`now()`,
      },
    });

  // 3) Reconciliação: clientes no EA que SOMEM da base nova → mantidos, listados.
  const codsBase = clientesValores.map((c) => c.codCliente);
  const somem = await db
    .select({ cod: clientes.codCliente, razao: clientes.razaoSocial, ativo: clientes.ativo })
    .from(clientes)
    .where(notInArray(clientes.codCliente, codsBase))
    .orderBy(clientes.codCliente);

  // 4) Contagem de vínculos por tipo de serviço.
  const porTipo = await db
    .select({ tipo: clienteVinculos.tipoServico, n: drizzleSql<number>`count(*)::int` })
    .from(clienteVinculos)
    .groupBy(clienteVinculos.tipoServico);

  await sql.end();

  console.log(
    `[seed-clientes-atualizada] clientes: ${resClientes.length} processados ` +
      `(${inseridos} novos, ${atualizados} atualizados).`,
  );
  console.log(`[seed-clientes-atualizada] vínculos por tipo de serviço:`);
  for (const r of porTipo.sort((a, b) => b.n - a.n)) console.log(`   ${r.tipo}: ${r.n}`);
  console.log(
    `[seed-clientes-atualizada] clientes no EA AUSENTES da base nova (${somem.length}) — ` +
      `MANTIDOS (nunca excluídos); decisão do diretor:`,
  );
  for (const s of somem) {
    console.log(`   ${s.cod} — ${s.razao}${s.ativo ? "" : " (já inativo)"}`);
  }
}

// Só executa quando rodado como script (tsx src/db/seed-clientes-atualizada.ts); NÃO ao ser
// importado (ex.: pelo spec de `tipoServicoDeEmpresa`), evitando abrir conexão no teste.
if ((process.argv[1] ?? "").includes("seed-clientes-atualizada")) {
  main().catch((err) => {
    console.error("[seed-clientes-atualizada] falhou:", err);
    process.exit(1);
  });
}
