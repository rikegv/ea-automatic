import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { inArray } from "drizzle-orm";
import { PandapeApiService } from "../pandape/pandape-api.service";
import { DrizzleModule } from "./drizzle.module";
import { createDb } from "./client";
import { integracaoPandape } from "./schema";

/**
 * LEVANTAMENTO da Fase 2 (LEITURA PURA, nada é gravado nem baixado para staging). Para cada admissão
 * candidata a re-pull, consulta a v3 do Pandapé (`GET /v3/precollaborators/{id}` -> forms[]) e conta
 * quantos formulários e arquivos ainda existem no acervo. Casar sem acervo não recupera nada.
 *
 * §A.6: só conta formulários e arquivos; nunca loga nome de formulário, link nem qualquer PII. O id
 * do pré-colaborador é técnico (não é dado pessoal).
 */
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DrizzleModule], providers: [PandapeApiService] })
class LevantaModule {}

function argOf(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const ids = (argOf("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("Informe --ids=<uuid,...>");

  const { sql, db } = createDb(url, 1);
  const rows = await db
    .select({ admissaoId: integracaoPandape.admissaoId, idPre: integracaoPandape.idPrecollaborator })
    .from(integracaoPandape)
    .where(inArray(integracaoPandape.admissaoId, ids));
  await sql.end({ timeout: 5 });

  const app = await NestFactory.createApplicationContext(LevantaModule, { logger: ["error"] });
  const apiReal = app.get(PandapeApiService);

  let comAcervo = 0;
  let semAcervo = 0;
  let erro = 0;
  let totalArquivos = 0;
  try {
    for (const r of rows) {
      try {
        const forms = await apiReal.getFormulariosDocumentos(String(r.idPre));
        const arquivos = forms.reduce((acc, f) => acc + (f.documents?.length ?? 0), 0);
        if (arquivos > 0) {
          comAcervo += 1;
          totalArquivos += arquivos;
          console.log(`  [${r.admissaoId}] idPre=${r.idPre}: ${forms.length} formulário(s), ${arquivos} arquivo(s)`);
        } else {
          semAcervo += 1;
          console.log(`  [${r.admissaoId}] idPre=${r.idPre}: SEM acervo (0 arquivos)`);
        }
      } catch (e) {
        erro += 1;
        console.log(`  [${r.admissaoId}] idPre=${r.idPre}: ERRO na leitura (${e instanceof Error ? e.message : "erro"})`);
      }
    }
  } finally {
    await app.close();
  }
  console.log(`\nResumo re-pull: ${rows.length} candidata(s). COM acervo=${comAcervo}, SEM acervo=${semAcervo}, erro=${erro}. Total de arquivos disponíveis no Pandapé=${totalArquivos}.`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
