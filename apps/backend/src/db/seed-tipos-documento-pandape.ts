import "dotenv/config";
import { sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";

/**
 * Tipos de documento novos exigidos pelo de/para do Pandapé (§A.9, decisão do diretor). Idempotente:
 * UPSERT por `codigo` (unique), então rodar N vezes não duplica e não renomeia à toa.
 *
 * Ambos nascem **ATIVOS** e **NÃO obrigatórios** na régua: entrar no catálogo é só dar destino ao
 * arquivo que a coleta vai trazer; quem decide exigência é a régua por (cliente + cargo), documento
 * por documento, na tela `/admin/regua`. Nenhuma régua existente é tocada aqui.
 *
 * ARMAZENAMENTO (confirmado antes de gravar): o destino físico no Drive é resolvido por
 * `resolveSubpasta` (`ai/drive-routing.ts`), que só desvia ASO, FORMULARIO_VT, CARTAO_TRANSPORTE e
 * TERMO_BANCO; todo o resto cai no default **DOCUMENTOS_PESSOAIS**. Como o FOTO_3X4 também cai no
 * default, o FOTO_CRACHA fica **no mesmo local físico do FOTO_3X4** sem precisar de código novo:
 * tipo separado no catálogo, mesma subpasta do prontuário.
 *
 * Loga só contagens e códigos (§A.6: sem PII).
 */
const TIPOS_NOVOS = [
  { codigo: "FOTO_CRACHA", nome: "Foto para Crachá" },
  {
    codigo: "FREQUENCIA_ESCOLAR_DEPENDENTES",
    nome: "Comprovante de Frequência Escolar de Dependentes",
  },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  const antes = (await db.execute(
    drizzleSql`select count(*)::int as n from tipos_documento`,
  )) as unknown as { n: number }[];

  for (const t of TIPOS_NOVOS) {
    await db.execute(drizzleSql`
      insert into tipos_documento (codigo, nome, ativo)
      values (${t.codigo}, ${t.nome}, true)
      on conflict (codigo) do update set nome = excluded.nome
    `);
    console.log(`[tipos-pandape] ok: ${t.codigo}`);
  }

  const depois = (await db.execute(
    drizzleSql`select count(*)::int as n from tipos_documento`,
  )) as unknown as { n: number }[];

  console.log(`[tipos-pandape] catálogo: ${antes[0].n} -> ${depois[0].n} tipos.`);
  console.log("[tipos-pandape] ambos ATIVOS e NÃO obrigatórios; régua existente intocada.");

  await sql.end();
}

main().catch((err) => {
  console.error("[tipos-pandape] falhou:", err);
  process.exit(1);
});
