import "dotenv/config";
import * as argon2 from "argon2";
import { inArray } from "drizzle-orm";
import { createDb } from "./client";
import {
  cargos,
  clientes,
  reguaDocumental,
  tiposDocumento,
  usuarios,
} from "./schema";

/**
 * Seed de DESENVOLVIMENTO (não-produção): usuários de demonstração (papéis COMUM e MASTER) e
 * dados-base do wizard (clientes, cargos, régua) para a validação visual exercitar a Nova Admissão.
 * O seed oficial (seed.ts) cria o admin inicial, os 21 tipos de documento e os status por frente.
 * Senha dev vem de DEMO_PASSWORD (default abaixo). NUNCA roda em produção (guard no topo do main).
 */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Demo!2026";

const DEMO_USERS: Array<{ nome: string; email: string; papel: "COMUM" | "MASTER" }> = [
  { nome: "Consultor Demo", email: "consultor@ea.local", papel: "COMUM" },
  { nome: "Master Demo", email: "master@ea.local", papel: "MASTER" },
];

const DEMO_CLIENTES = [
  {
    codCliente: "1001",
    cnpj: "12.345.678/0001-90",
    razaoSocial: "Soulan Serviços Especializados LTDA",
    nomeOperacao: "Soulan Serviços",
  },
  {
    codCliente: "1002",
    cnpj: "98.765.432/0001-10",
    razaoSocial: "Soulan Logística e Transportes LTDA",
    nomeOperacao: "Soulan Logística",
  },
];

const DEMO_CARGOS = ["Auxiliar de Limpeza", "Motorista", "Analista Administrativo"];

type Exigencia = "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";

// Réguas de demonstração por par (cod_cliente + nome do cargo). `codigo` resolve o tipo de
// documento já seedado em seed.ts. Mix realista de exigências (coração da auditoria — §A.3).
const DEMO_REGUAS: Array<{
  codCliente: string;
  cargoNome: string;
  itens: Array<{ codigo: string; exigencia: Exigencia }>;
}> = [
  {
    codCliente: "1001",
    cargoNome: "Auxiliar de Limpeza",
    itens: [
      { codigo: "RG", exigencia: "OBRIGATORIO" },
      { codigo: "CPF", exigencia: "OBRIGATORIO" },
      { codigo: "CTPS", exigencia: "OBRIGATORIO" },
      { codigo: "COMPROVANTE_RESIDENCIA", exigencia: "OBRIGATORIO" },
      { codigo: "ASO", exigencia: "OBRIGATORIO" },
      { codigo: "DADOS_BANCARIOS", exigencia: "OBRIGATORIO" },
      { codigo: "RESERVISTA", exigencia: "FACULTATIVO" },
      { codigo: "CNH", exigencia: "FACULTATIVO" },
      { codigo: "TITULO_ELEITOR", exigencia: "NAO_OBRIGATORIO" },
      { codigo: "CERTIDAO_CASAMENTO", exigencia: "NAO_OBRIGATORIO" },
    ],
  },
  {
    codCliente: "1001",
    cargoNome: "Motorista",
    itens: [
      { codigo: "RG", exigencia: "OBRIGATORIO" },
      { codigo: "CPF", exigencia: "OBRIGATORIO" },
      { codigo: "CTPS", exigencia: "OBRIGATORIO" },
      { codigo: "CNH", exigencia: "OBRIGATORIO" },
      { codigo: "COMPROVANTE_RESIDENCIA", exigencia: "OBRIGATORIO" },
      { codigo: "ASO", exigencia: "OBRIGATORIO" },
      { codigo: "DADOS_BANCARIOS", exigencia: "OBRIGATORIO" },
      { codigo: "ANTECEDENTES", exigencia: "FACULTATIVO" },
      { codigo: "RESERVISTA", exigencia: "FACULTATIVO" },
      { codigo: "TITULO_ELEITOR", exigencia: "NAO_OBRIGATORIO" },
    ],
  },
];

async function main(): Promise<void> {
  // Guard de produção (§A.6): o seed de demonstração nunca roda nem loga senha dev em produção.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[seed-demo] BLOQUEADO: seed de demonstração não roda em produção (NODE_ENV=production).",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");

  const { sql, db } = createDb(url, 1);

  // 1) Usuários de demonstração.
  const senhaHash = await argon2.hash(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    await db
      .insert(usuarios)
      .values({ ...u, senhaHash, ativo: true })
      .onConflictDoNothing({ target: usuarios.email });
    console.log(`[seed-demo] usuário ${u.email} (${u.papel})`);
  }

  // 2) Clientes de demonstração.
  await db.insert(clientes).values(DEMO_CLIENTES).onConflictDoNothing({
    target: clientes.codCliente,
  });
  console.log(`[seed-demo] clientes: ${DEMO_CLIENTES.length}`);

  // 3) Cargos de demonstração.
  await db
    .insert(cargos)
    .values(DEMO_CARGOS.map((nome) => ({ nome })))
    .onConflictDoNothing({ target: cargos.nome });
  console.log(`[seed-demo] cargos: ${DEMO_CARGOS.length}`);

  // 4) Régua: resolve tipoDocumentoId por código e cargoId por nome.
  const tdRows = await db
    .select({ id: tiposDocumento.id, codigo: tiposDocumento.codigo })
    .from(tiposDocumento);
  const tdIdByCodigo = new Map(tdRows.map((t) => [t.codigo, t.id]));
  if (tdRows.length === 0) {
    console.warn(
      "[seed-demo] tipos_documento vazio — rode `pnpm --filter @ea/backend db:seed` antes (régua pulada).",
    );
  }

  const cargoRows = await db
    .select({ id: cargos.id, nome: cargos.nome })
    .from(cargos)
    .where(inArray(cargos.nome, DEMO_CARGOS));
  const cargoIdByNome = new Map(cargoRows.map((c) => [c.nome, c.id]));

  let reguaInseridos = 0;
  for (const regua of DEMO_REGUAS) {
    const cargoId = cargoIdByNome.get(regua.cargoNome);
    if (!cargoId) {
      console.warn(`[seed-demo] cargo "${regua.cargoNome}" não encontrado — régua pulada.`);
      continue;
    }
    const valores = regua.itens
      .map((item) => {
        const tipoDocumentoId = tdIdByCodigo.get(item.codigo);
        if (!tipoDocumentoId) return null;
        return {
          codCliente: regua.codCliente,
          cargoId,
          tipoDocumentoId,
          exigencia: item.exigencia,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (valores.length === 0) continue;
    await db
      .insert(reguaDocumental)
      .values(valores)
      .onConflictDoNothing({
        target: [
          reguaDocumental.codCliente,
          reguaDocumental.cargoId,
          reguaDocumental.tipoDocumentoId,
        ],
      });
    reguaInseridos += valores.length;
    console.log(
      `[seed-demo] régua ${regua.codCliente} + "${regua.cargoNome}": ${valores.length} itens`,
    );
  }

  await sql.end();
  console.log(
    `[seed-demo] concluído — ${DEMO_CLIENTES.length} clientes, ${DEMO_CARGOS.length} cargos, ${reguaInseridos} itens de régua.`,
  );
  console.log(`[seed-demo] senha dev: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("[seed-demo] falhou:", err);
  process.exit(1);
});
