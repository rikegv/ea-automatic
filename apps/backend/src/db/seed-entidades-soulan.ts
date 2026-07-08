import "dotenv/config";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { clienteVinculos, entidadeFiliais, entidadesSoulan } from "./schema";

/**
 * Match cliente ↔ empresa Soulan — REGRA FINAL (refina a anterior). O CNPJ de Temporário (empresa
 * 1,3) e Terceiro (empresa 2) depende de EMPRESA + FILIAL (a filial VOLTA a contar); Interno (5,6) e
 * FOPAG (>6) mantêm o que já estava.
 *
 * Empresa → entidade / regra de CNPJ:
 *   1,3 = Temporário → SOULAN CONSULTORIA E MAO DE OBRA TEMPORARIA LTDA — CNPJ POR FILIAL
 *   2   = Terceiro   → SOULAN ADMINISTRACAO E ASSESSORIA EM RECURSOS HUMANOS LTDA — CNPJ POR FILIAL
 *   4   = Estágio    → SOULAN CENTRAL DE ESTAGIOS LTDA, CNPJ FIXO 02.489.512/0001-99 (independe de filial)
 *   5   = Interno    → SOULAN ADMINISTRACAO..., CNPJ FIXO 59.051.086/0001-24 (independe de filial)
 *   6   = Interno    → NEAT SOLUCOES...,        CNPJ FIXO 11.063.100/0001-83
 *   >6  = FOPAG      → CNPJ do PRÓPRIO cliente (clientes.cnpj); entidade_id NULL
 *
 * O CNPJ por filial mora em `entidade_filiais` (entidade + filial → CNPJ); a view
 * `vw_vinculo_empresa_cnpj` resolve Temporário/Terceiro por (entidade_id, filial) e Interno pelo CNPJ
 * fixo da entidade. Idempotente (reset + re-set), reversível. §A.6: só CNPJs públicos das entidades
 * Soulan são logados; nunca CNPJ de cliente.
 */

type EntKey = "CONSULTORIA" | "ADMINISTRACAO" | "NEAT" | "CENTRAL_ESTAGIOS";

/** Entidades Soulan. `cnpj` = representativo (matriz) da entidade; o CNPJ efetivo de Temp/Terc é por filial. */
const ENTIDADES: Record<EntKey, { nome: string; cnpj: string }> = {
  CONSULTORIA: { nome: "SOULAN CONSULTORIA E MAO DE OBRA TEMPORARIA LTDA", cnpj: "59.749.705/0001-59" },
  ADMINISTRACAO: {
    nome: "SOULAN ADMINISTRACAO E ASSESSORIA EM RECURSOS HUMANOS LTDA",
    cnpj: "59.051.086/0001-24",
  },
  NEAT: { nome: "NEAT SOLUCOES E TECNOLOGIA PARA RH LTDA", cnpj: "11.063.100/0001-83" },
  CENTRAL_ESTAGIOS: { nome: "SOULAN CENTRAL DE ESTAGIOS LTDA", cnpj: "02.489.512/0001-99" },
};

/** Código "Empresa" da base → entidade Soulan. >6 (FOPAG) fica de fora (usa CNPJ do próprio cliente). */
const EMPRESA_ENTIDADE: Record<string, EntKey> = {
  "1": "CONSULTORIA",
  "3": "CONSULTORIA",
  "2": "ADMINISTRACAO",
  "4": "CENTRAL_ESTAGIOS",
  "5": "ADMINISTRACAO",
  "6": "NEAT",
};

/** CNPJ por (entidade, filial) — SÓ Temporário/Terceiro. Interno e Estágio usam o CNPJ FIXO da entidade. */
const CNPJ_POR_FILIAL: Record<EntKey, Record<string, string>> = {
  CONSULTORIA: {
    "1": "59.749.705/0002-30",
    "2": "59.749.705/0001-59",
    "4": "59.749.705/0004-00",
    "5": "59.749.705/0006-63",
    "7": "59.749.705/0007-44",
  },
  ADMINISTRACAO: {
    "1": "59.051.086/0001-24",
    "2": "59.051.086/0001-24",
    "4": "59.051.086/0002-05",
  },
  NEAT: {},
  CENTRAL_ESTAGIOS: {},
};

const raizDe = (cnpj: string): string => cnpj.replace(/\D/g, "").slice(0, 8);

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  // ── 1) UPSERT entidades_soulan (nome sem unique → select-or-insert). ──
  const idPorEnt = new Map<EntKey, string>();
  for (const [key, { nome, cnpj }] of Object.entries(ENTIDADES) as [EntKey, { nome: string; cnpj: string }][]) {
    const raiz = raizDe(cnpj);
    const [ex] = await db.select().from(entidadesSoulan).where(eq(entidadesSoulan.nome, nome));
    if (ex) {
      await db
        .update(entidadesSoulan)
        .set({ cnpj, cnpjRaiz: raiz, atualizadoEm: new Date() })
        .where(eq(entidadesSoulan.id, ex.id));
      idPorEnt.set(key, ex.id);
    } else {
      const [novo] = await db
        .insert(entidadesSoulan)
        .values({ nome, cnpj, cnpjRaiz: raiz })
        .returning({ id: entidadesSoulan.id });
      idPorEnt.set(key, novo.id);
    }
  }

  // ── 2) Reset e repopular entidade_filiais (entidade + filial → CNPJ) para Temporário/Terceiro. ──
  await db.delete(entidadeFiliais);
  for (const [key, filiais] of Object.entries(CNPJ_POR_FILIAL) as [EntKey, Record<string, string>][]) {
    const entidadeId = idPorEnt.get(key);
    if (!entidadeId) continue;
    const rows = Object.entries(filiais).map(([filial, cnpj]) => ({ entidadeId, filial, cnpj }));
    if (rows.length > 0) await db.insert(entidadeFiliais).values(rows);
  }

  // ── 3) Reprocessar entidade_id do zero: setar por empresa (1,3→CONSULTORIA; 2,5→ADMIN; 6→NEAT). ──
  await db.update(clienteVinculos).set({ entidadeId: null, atualizadoEm: new Date() });
  const vinculos = await db.select().from(clienteVinculos);
  for (const v of vinculos) {
    const key = EMPRESA_ENTIDADE[v.empresaCodigo];
    if (!key) continue; // Estágio (4) e FOPAG (>6) ficam sem entidade — resolvido por outra via ou pendente.
    const entidadeId = idPorEnt.get(key);
    if (!entidadeId) continue;
    await db
      .update(clienteVinculos)
      .set({ entidadeId, atualizadoEm: new Date() })
      .where(eq(clienteVinculos.id, v.id));
  }

  // ── 4) Relatório derivado do banco: resolvidos por tipo pela MESMA regra da view. ──
  //  Temp/Terc: casou entidade_filiais(entidade,filial). Interno: CNPJ fixo da entidade. FOPAG: cliente.
  const porTipo = await db.execute(drizzleSql`
    SELECT v.tipo_servico AS tipo,
           count(*)::int AS total,
           count(*) FILTER (WHERE
             v.is_fopag
             OR (v.tipo_servico IN ('INTERNO','ESTAGIO') AND e.cnpj IS NOT NULL)
             OR (v.tipo_servico IN ('TEMPORARIO','TERCEIRO') AND ef.cnpj IS NOT NULL)
           )::int AS resolvidos
    FROM cliente_vinculos v
    LEFT JOIN entidades_soulan e  ON e.id = v.entidade_id
    LEFT JOIN entidade_filiais ef ON ef.entidade_id = v.entidade_id AND ef.filial = v.filial
    GROUP BY v.tipo_servico
  `);
  const linhas = porTipo as unknown as { tipo: string; total: number; resolvidos: number }[];

  await sql.end();

  console.log("=== SEED entidades-soulan (regra empresa + FILIAL p/ Temp/Terc) ===");
  console.log(`entidades_soulan: ${idPorEnt.size} (CONSULTORIA, ADMINISTRACAO, NEAT, CENTRAL_ESTAGIOS).`);
  const nFiliais = Object.values(CNPJ_POR_FILIAL).reduce((a, f) => a + Object.keys(f).length, 0);
  console.log(`entidade_filiais: ${nFiliais} mapeamentos (empresa+filial → CNPJ).`);
  const totalResolvido = linhas.reduce((a, l) => a + l.resolvidos, 0);
  const total = linhas.reduce((a, l) => a + l.total, 0);
  console.log(`CNPJ RESOLVIDO: ${totalResolvido}/${total}`);
  console.log("Por tipo (resolvidos/total):");
  for (const l of linhas.sort((a, b) => b.total - a.total)) {
    const gap = l.resolvidos < l.total ? `  ← ${l.total - l.resolvidos} sem CNPJ` : "";
    console.log(`   ${l.tipo}: ${l.resolvidos}/${l.total}${gap}`);
  }
}

if ((process.argv[1] ?? "").includes("seed-entidades-soulan")) {
  main().catch((err) => {
    console.error("[seed-entidades-soulan] falhou:", err);
    process.exit(1);
  });
}
