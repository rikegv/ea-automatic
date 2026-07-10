import "dotenv/config";
import { sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";

/**
 * Régua PADRÃO para TODOS os clientes (OST). Substitui QUALQUER régua existente por um conjunto
 * fixo de documentos OBRIGATÓRIOS, aplicado a todo par (cliente x cargo). Idempotente: apaga toda a
 * régua e recria do zero, então rodar N vezes dá o mesmo resultado. Loga só contagens (§A.6: sem
 * dado pessoal; cod_cliente é chave de negócio).
 *
 * Documentos obrigatórios da régua padrão (códigos em tipos_documento):
 *   RG · CPF · COMPROVANTE_RESIDENCIA · DADOS_BANCARIOS · CTPS · RESERVISTA · COMPROVANTE_ESCOLARIDADE
 *
 * O RESERVISTA é marcado OBRIGATORIO aqui, mas é CONDICIONAL na completude: só conta como pendência
 * para candidatos do sexo MASCULINO (regra-completude.service). Para mulheres não vira pendência.
 */
const CODIGOS_PADRAO = [
  "RG",
  "CPF",
  "COMPROVANTE_RESIDENCIA",
  "DADOS_BANCARIOS",
  "CTPS",
  "RESERVISTA",
  "COMPROVANTE_ESCOLARIDADE",
];

type Contagem = { clientes_com_regua: number; pares: number; linhas: number };

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  // Lista IN segura (constantes próprias) via sql.join → in ($1, $2, ...).
  const codigosIn = drizzleSql.join(
    CODIGOS_PADRAO.map((c) => drizzleSql`${c}`),
    drizzleSql`, `,
  );

  // Confere que os 7 tipos existem antes de tocar em nada.
  const tipos = (await db.execute(
    drizzleSql`select codigo from tipos_documento where codigo in (${codigosIn})`,
  )) as unknown as { codigo: string }[];
  const encontrados = new Set(tipos.map((t) => t.codigo));
  const faltando = CODIGOS_PADRAO.filter((c) => !encontrados.has(c));
  if (faltando.length) {
    await sql.end();
    throw new Error(`Tipos de documento ausentes no catálogo: ${faltando.join(", ")}`);
  }

  const contar = async (): Promise<Contagem> => {
    const rows = (await db.execute(drizzleSql`select
      (select count(distinct cod_cliente) from regua_documental)::int as clientes_com_regua,
      (select count(distinct (cod_cliente, cargo_id)) from regua_documental)::int as pares,
      (select count(*) from regua_documental)::int as linhas`)) as unknown as Contagem[];
    return rows[0];
  };

  const totRows = (await db.execute(
    drizzleSql`select (select count(*) from clientes)::int as clientes, (select count(*) from cargos)::int as cargos`,
  )) as unknown as { clientes: number; cargos: number }[];
  const tot = totRows[0];

  const antes = await contar();

  // Substitui QUALQUER régua existente (o diretor está ciente da sobrescrita).
  await db.execute(drizzleSql`delete from regua_documental`);

  // Insere o padrão para todo par (cliente x cargo) x (7 tipos), OBRIGATORIO. Uma única query.
  await db.execute(drizzleSql`
    insert into regua_documental (cod_cliente, cargo_id, tipo_documento_id, exigencia)
    select c.cod_cliente, cg.id, t.id, 'OBRIGATORIO'::exigencia_documento
    from clientes c
    cross join cargos cg
    cross join (select id from tipos_documento where codigo in (${codigosIn})) t
  `);

  const depois = await contar();
  const sobrescritos = antes.clientes_com_regua;
  const criados = tot.clientes - antes.clientes_com_regua;

  console.log("[regua-padrao] Régua padrão aplicada a TODOS os clientes.");
  console.log(`  Documentos obrigatórios (${CODIGOS_PADRAO.length}): ${CODIGOS_PADRAO.join(", ")}`);
  console.log(`  Clientes: ${tot.clientes} | Cargos: ${tot.cargos}`);
  console.log(`  Clientes que TINHAM régua (sobrescritos): ${sobrescritos}`);
  console.log(`  Clientes que NAO tinham régua (criados):   ${criados}`);
  console.log(`  Antes:  ${antes.clientes_com_regua} clientes, ${antes.pares} pares, ${antes.linhas} linhas`);
  console.log(`  Depois: ${depois.clientes_com_regua} clientes, ${depois.pares} pares, ${depois.linhas} linhas`);
  console.log(`  (RESERVISTA é condicional: só vira pendência para sexo masculino.)`);

  await sql.end();
}

main().catch((err) => {
  console.error("[regua-padrao] falhou:", err);
  process.exit(1);
});
