import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes } from "./schema";
import { idDaPastaUrl, urlDaPasta } from "../ai/drive-routing";

/**
 * LIGA CADA ADMISSÃO À SUA PASTA MAIS COMPLETA e sinaliza as extras (OST da duplicação, item 6).
 *
 * POR QUE UM PLANO EM ARQUIVO, e não uma varredura automática. Quem enxerga o Drive é o ai-service,
 * e a escolha da pasta certa depende de CONTAR arquivo por pasta. O diretor exigiu conferir a lista
 * ANTES de qualquer vinculação, então o levantamento é feito à parte, revisado por ele, e este
 * runner só APLICA o que foi aprovado. Nada é decidido aqui.
 *
 * O QUE FAZ, por linha do plano: grava `drive_pasta_url` apontando para a pasta escolhida e
 * `drive_duplicatas` com as extras, que é o que acende o sinal "Pasta duplicada no Drive" no
 * Diagnóstico. Limpa `drive_falha_motivo`, porque a admissão deixa de estar sem prontuário.
 *
 * O QUE NÃO FAZ: não apaga, não move e não renomeia NADA no Drive (§A.6, contrato do módulo). A
 * remoção da pasta extra é manual, do diretor, e é justamente o que o sinal passa a cobrar.
 *
 * SECO POR PADRÃO: sem `--aplicar` ele só imprime o que faria. Idempotente: rodar de novo sobre o
 * mesmo plano deixa tudo no mesmo estado.
 *
 * COMO RODAR (na pasta apps/backend):
 *   npx tsx src/db/liga-pastas-duplicadas.ts plano.json              # simulação
 *   npx tsx src/db/liga-pastas-duplicadas.ts plano.json --aplicar    # grava
 *
 * FORMATO do plano: { "plano": [ { admissaoId, candidato, pastaEscolhida, extras: [{id}] } ] }
 */

interface LinhaPlano {
  candidato?: string;
  admissaoId: string;
  pastaEscolhida: string;
  extras?: { id: string }[];
}

async function main() {
  const caminho = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  if (!caminho) {
    console.error("Informe o arquivo do plano. Ex.: npx tsx src/db/liga-pastas-duplicadas.ts plano.json");
    process.exit(1);
  }

  const conteudo = JSON.parse(readFileSync(caminho, "utf8")) as { plano: LinhaPlano[] };
  const linhas = conteudo.plano ?? [];
  if (linhas.length === 0) {
    console.log("Plano vazio: nada a fazer.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);
  let gravadas = 0;
  let puladas = 0;

  for (const linha of linhas) {
    // A pasta escolhida tem de ser um id plausível: id inventado viraria link quebrado na admissão.
    const escolhida = idDaPastaUrl(linha.pastaEscolhida);
    if (!escolhida) {
      console.log(`  PULADA ${linha.candidato ?? linha.admissaoId}: pasta escolhida inválida.`);
      puladas++;
      continue;
    }
    const extras = (linha.extras ?? [])
      .map((e) => idDaPastaUrl(e.id))
      .filter((id): id is string => Boolean(id));

    const [atual] = await db
      .select({ id: admissoes.id, url: admissoes.drivePastaUrl })
      .from(admissoes)
      .where(eq(admissoes.id, linha.admissaoId));
    if (!atual) {
      console.log(`  PULADA ${linha.candidato ?? linha.admissaoId}: admissão não encontrada.`);
      puladas++;
      continue;
    }

    const url = urlDaPasta(escolhida);
    const mudou = atual.url !== url;
    console.log(
      `  ${linha.candidato ?? linha.admissaoId}: ${mudou ? "REAPONTA" : "mantém"} -> ${escolhida}` +
        (extras.length ? ` | sinaliza ${extras.length} extra(s)` : ""),
    );

    if (aplicar) {
      await db
        .update(admissoes)
        .set({
          drivePastaUrl: url,
          driveDuplicatas: extras.length ? extras.join(",") : null,
          driveFalhaMotivo: null,
          driveFalhaEm: null,
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, linha.admissaoId));
      gravadas++;
    }
  }

  console.log(
    aplicar
      ? `\nAplicado: ${gravadas} admissão(ões) vinculada(s), ${puladas} pulada(s).`
      : `\nSIMULAÇÃO (nada gravado): ${linhas.length - puladas} seria(m) vinculada(s). Use --aplicar.`,
  );
  console.log(
    "As pastas extras continuam no Drive: a remoção é manual, pelo diretor, e o sinal " +
      '"Pasta duplicada no Drive" no Diagnóstico é quem cobra.',
  );
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
