import "dotenv/config";
import { createDb } from "./client";

/**
 * Catálogo da carga da base de 03-08-2026 (decisões do diretor).
 *
 * Cadastra o que a base exige e o catálogo ainda não tinha, ANTES da carga. Idempotente: usa
 * ON CONFLICT DO NOTHING e reporta o que criou e o que já existia. Rodar 2x não muda nada.
 *
 * CARGOS NOVOS (decisão do diretor):
 *  - Auxiliar Administrativo II, Assistente de Contas a Pagar, Auxiliar Suporte de Dados
 *  - Trainne (grafia pedida pelo diretor, o time ajusta depois)
 *  - Vendedor I, Vendedor II, Supervisor: o diretor os listou como de/para "usar existentes", mas
 *    NENHUM dos três existe no catálogo (há "Vendedor", "Vendedor de Loja", "Vendedor JR",
 *    "Vendedor PL" e "Supervisora de Caixa", nomes diferentes). Criados com o nome EXATO que ele
 *    escreveu, porque mapear "Vendedor I" e "Vendedor II" para o mesmo "Vendedor" descartaria em
 *    silêncio a distinção I/II que ele pediu. Renomear depois é uma linha; desfazer a fusão não é.
 *
 * CLIENTE NOVO: RAIA CAGC CORIFEU, código 26360.
 *  Das 3 linhas de CORIFEU da base, DUAS resolvem por CNPJ contra cadastros que já existem
 *  (61.585.865/1405-90 = 55889, 61.585.865/0093-70 = 56261). Só a linha cujo COD é 26360 não tem
 *  CNPJ para casar, e é essa que recebe o cadastro novo. Razão social igual à das outras 95 lojas.
 *
 * §A.6: catálogo puro, sem PII.
 */
const CARGOS_NOVOS = [
  "Auxiliar Administrativo II",
  "Assistente de Contas a Pagar",
  "Auxiliar Suporte de Dados",
  "Trainne",
  "Vendedor I",
  "Vendedor II",
  "Supervisor",
];

const CLIENTE_NOVO = {
  codCliente: "26360",
  razaoSocial: "RAIA DROGASIL S/A",
  nomeOperacao: "RAIA CAGC CORIFEU",
};

async function main() {
  const { sql } = createDb(process.env.DATABASE_URL!, 5);
  const criados: string[] = [];
  const jaExistiam: string[] = [];
  try {
    for (const nome of CARGOS_NOVOS) {
      const r = await sql`
        INSERT INTO cargos (nome) VALUES (${nome})
        ON CONFLICT (nome) DO NOTHING
        RETURNING nome`;
      (r.length ? criados : jaExistiam).push(`cargo: ${nome}`);
    }

    const c = await sql`
      INSERT INTO clientes (cod_cliente, razao_social, nome_operacao)
      VALUES (${CLIENTE_NOVO.codCliente}, ${CLIENTE_NOVO.razaoSocial}, ${CLIENTE_NOVO.nomeOperacao})
      ON CONFLICT (cod_cliente) DO NOTHING
      RETURNING cod_cliente`;
    (c.length ? criados : jaExistiam).push(
      `cliente: ${CLIENTE_NOVO.codCliente} ${CLIENTE_NOVO.nomeOperacao}`,
    );

    console.log(`\n===== CATÁLOGO DA CARGA 03-08 =====`);
    console.log(`criados (${criados.length}):`);
    for (const x of criados) console.log(`  + ${x}`);
    console.log(`já existiam (${jaExistiam.length}):`);
    for (const x of jaExistiam) console.log(`  = ${x}`);

    const [{ cargos }] = await sql`SELECT count(*)::int AS cargos FROM cargos`;
    const [{ clientes }] = await sql`SELECT count(*)::int AS clientes FROM clientes`;
    console.log(`\ntotal no catálogo: ${cargos} cargos, ${clientes} clientes`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
