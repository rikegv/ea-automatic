import "dotenv/config";
import { sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { csvIds, listaIds } from "../ai/drive-duplicatas";

/**
 * BAIXA O SINAL "PASTA DUPLICADA NO DRIVE" EM LOTE (decisão do diretor, OST do Drive).
 *
 * O QUE ELE DECIDIU. Conviver com as pastas duplicadas por enquanto: NÃO vai apagá-las agora, assume
 * a remoção manual daqui pra frente e não quer o aviso aceso no meio tempo. Este runner existe porque
 * a decisão foi tomada de uma vez, sobre o acervo inteiro; a tela do Diagnóstico continua sendo o
 * caminho normal, um alvo por vez (o botão "Zerar sinal"), e é ela que resolve o caso a caso.
 *
 * O QUE FAZ: move os ids de `drive_duplicatas` para `drive_duplicatas_baixadas` (a memória de "não
 * acenda estas de novo enquanto existirem") e registra a baixa em `candidato_alteracoes_log`.
 *
 * O QUE NÃO FAZ: **não apaga, não move e não renomeia NADA no Drive** (§A.6, contrato do módulo). As
 * pastas continuam exatamente onde estão. O que sai é o AVISO, não a pasta.
 *
 * O AUTOR DO LOG É O DIRETOR, e tem de ser: a trilha responde "quem decidiu", e a decisão é dele, por
 * escrito. A fábrica só executa. Por isso o e-mail do autor é OBRIGATÓRIO e conferido no banco, em
 * vez de um usuário genérico de sistema, que apagaria justamente a informação que a trilha existe
 * para guardar.
 *
 * SECO POR PADRÃO: sem `--aplicar` ele só imprime o que faria. Idempotente: rodar de novo não acha
 * mais nada aceso e não duplica log.
 *
 * COMO RODAR (na pasta apps/backend):
 *   npx tsx src/db/zera-sinal-duplicatas.ts diretor@empresa.com.br             # simulação
 *   npx tsx src/db/zera-sinal-duplicatas.ts diretor@empresa.com.br --aplicar   # grava
 */
async function main() {
  const email = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  if (!email || email.startsWith("--")) {
    console.error(
      "Informe o e-mail de quem está decidindo a baixa. Ex.: npx tsx src/db/zera-sinal-duplicatas.ts diretor@empresa.com.br",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  const [autor] = (await db.execute(drizzleSql`
    SELECT id, papel FROM usuarios WHERE lower(email) = lower(${email}) LIMIT 1
  `)) as unknown as Array<{ id: string; papel: string }>;
  if (!autor) {
    console.error(`Usuário ${email} não encontrado: sem autor não há trilha, e sem trilha não grava.`);
    await sql.end({ timeout: 5 });
    process.exit(1);
  }

  // §A.6: id de admissão e de pasta, contagens. Nome de candidato NÃO entra no relatório.
  const linhas = (await db.execute(drizzleSql`
    SELECT id, drive_duplicatas, drive_duplicatas_baixadas
      FROM admissoes
     WHERE drive_duplicatas IS NOT NULL AND drive_duplicatas <> ''
     ORDER BY atualizado_em DESC
  `)) as unknown as Array<{
    id: string;
    drive_duplicatas: string;
    drive_duplicatas_baixadas: string | null;
  }>;

  if (linhas.length === 0) {
    console.log("Nenhum sinal de pasta duplicada aceso: nada a baixar.");
    await sql.end({ timeout: 5 });
    return;
  }

  let pastas = 0;
  for (const linha of linhas) {
    const acesas = listaIds(linha.drive_duplicatas);
    pastas += acesas.length;
    console.log(`  admissão ${linha.id}: baixa ${acesas.length} pasta(s) -> ${acesas.join(", ")}`);
    if (!aplicar) continue;

    const baixadas = csvIds([
      ...new Set([...listaIds(linha.drive_duplicatas_baixadas), ...acesas]),
    ]);
    await db.execute(drizzleSql`
      UPDATE admissoes
         SET drive_duplicatas = NULL,
             drive_duplicatas_baixadas = ${baixadas},
             atualizado_em = now()
       WHERE id = ${linha.id}
    `);
    await db.execute(drizzleSql`
      INSERT INTO candidato_alteracoes_log (admissao_id, campo, valor_anterior, valor_novo, autor_id)
      VALUES (${linha.id}, 'drive_duplicatas', ${linha.drive_duplicatas}, NULL, ${autor.id})
    `);
  }

  console.log(
    aplicar
      ? `\nAplicado: sinal baixado em ${linhas.length} admissão(ões), ${pastas} pasta(s) no total, ` +
          `registrado como ${email}.`
      : `\nSIMULAÇÃO (nada gravado): ${linhas.length} admissão(ões), ${pastas} pasta(s). Use --aplicar.`,
  );
  console.log(
    "As pastas continuam TODAS no Drive: nada foi apagado (§A.6). O que saiu foi o aviso, e ele não " +
      "volta sozinho enquanto elas existirem; duplicata nova acende normalmente.",
  );
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
