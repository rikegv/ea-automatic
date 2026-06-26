import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { clientes } from "./schema";

/**
 * Carga oficial dos clientes do Grupo Soulan (Fase 1B). Idempotente: UPSERT por `codCliente`
 * (chave de negócio — §A.3). Roda quantas vezes for preciso sem duplicar. Não loga dado sensível
 * (CNPJ/razão social) — só contagens (§A.6).
 *
 * Fonte: src/db/data/clientes-carga-1b.csv (10 colunas, cabeçalho na 1ª linha).
 */
const CSV_PATH = join(__dirname, "data", "clientes-carga-1b.csv");

type LinhaCsv = {
  cod_cliente: string;
  nome_operacao: string;
  razao_social: string;
  cnpj: string;
  empresa_grupo: string;
  regiao: string;
  descricao_regiao: string;
  beneficios_padrao: string;
  escala_padrao: string;
  endereco_padrao: string;
};

/** String vazia/whitespace → null; caso contrário, trim. */
function nullable(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const conteudo = readFileSync(CSV_PATH, "utf8");
  const linhas = parse(conteudo, {
    columns: true,
    skip_empty_lines: true,
    trim: false,
    bom: true,
  }) as LinhaCsv[];

  const valores = linhas.map((l) => ({
    codCliente: l.cod_cliente.trim(),
    cnpj: nullable(l.cnpj),
    razaoSocial: l.razao_social.trim(),
    nomeOperacao: nullable(l.nome_operacao),
    empresaGrupo: nullable(l.empresa_grupo),
    regiao: nullable(l.regiao),
    descricaoRegiao: nullable(l.descricao_regiao),
    beneficiosPadrao: nullable(l.beneficios_padrao),
    escalaPadrao: nullable(l.escala_padrao),
    enderecoPadrao: nullable(l.endereco_padrao),
  }));

  const { sql, db } = createDb(url, 1);

  // UPSERT por codCliente: atualiza TODOS os campos da carga + atualizadoEm. Idempotente.
  // `inserted` (xmax = 0) distingue inserção de atualização para a contagem.
  const resultado = await db
    .insert(clientes)
    .values(valores)
    .onConflictDoUpdate({
      target: clientes.codCliente,
      set: {
        cnpj: drizzleSql`excluded.cnpj`,
        razaoSocial: drizzleSql`excluded.razao_social`,
        nomeOperacao: drizzleSql`excluded.nome_operacao`,
        empresaGrupo: drizzleSql`excluded.empresa_grupo`,
        regiao: drizzleSql`excluded.regiao`,
        descricaoRegiao: drizzleSql`excluded.descricao_regiao`,
        beneficiosPadrao: drizzleSql`excluded.beneficios_padrao`,
        escalaPadrao: drizzleSql`excluded.escala_padrao`,
        enderecoPadrao: drizzleSql`excluded.endereco_padrao`,
        atualizadoEm: drizzleSql`now()`,
      },
    })
    .returning({ inserido: drizzleSql<boolean>`(xmax = 0)` });

  const inseridos = resultado.filter((r) => r.inserido).length;
  const atualizados = resultado.length - inseridos;

  await sql.end();
  console.log(
    `[seed-clientes] carga concluída — ${resultado.length} linhas processadas ` +
      `(${inseridos} inseridos, ${atualizados} atualizados).`,
  );
}

main().catch((err) => {
  console.error("[seed-clientes] falhou:", err);
  process.exit(1);
});
