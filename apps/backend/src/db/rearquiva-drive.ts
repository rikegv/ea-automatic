import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { eq, isNull } from "drizzle-orm";
import { AiModule } from "../ai/ai.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { DrizzleModule } from "./drizzle.module";
import { createDb } from "./client";
import { admissoes } from "./schema";
import type { AuthUser } from "../auth/auth.types";

/**
 * REENVIA AO DRIVE as admissões cuja régua FECHOU mas que ficaram sem pasta (OST produção, Bloco 1).
 *
 * POR QUE EXISTE. O envio ao Drive só dispara no PÓS-VEREDITO, ou seja, quando algum documento muda
 * de estado. Se ele falha (foi o caso real: o Google recusou um upload no meio do lote), a admissão
 * fica com a régua completa, a frente concluída na tela e o prontuário vazio, e só volta a tentar
 * quando alguém mexer em algum documento daquela admissão. Este runner faz a tentativa acontecer sem
 * depender de alguém clicar.
 *
 * NÃO É EDIÇÃO MANUAL DE DADO: sobe o contexto do Nest e chama `aplicarPosVeredito`, exatamente o
 * mesmo método do fluxo vivo. Quem decide se arquiva, o que arquiva e o que gravar é o código de
 * produção; o runner só escolhe em QUAIS admissões ele roda.
 *
 * ALVO: admissões com `drive_pasta_url` nulo. O próprio `aplicarPosVeredito` descarta as que não
 * fecharam a régua (não arquiva) e as que já têm link real (não re-arquiva), então rodar sobre um
 * conjunto maior é seguro e idempotente.
 *
 * Uso:  pnpm db:rearquiva-drive [--aplicar] [--admissao=<uuid>]
 * Sem `--aplicar` só lista o que tentaria. §A.6: log por id de admissão, nunca nome ou CPF.
 */

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DrizzleModule, AiModule, AuditoriaModule] })
class RearquivaModule {}

/** Autor do evento: o pós-veredito registra quem disparou. Aqui é o próprio sistema. */
const USER_SISTEMA: AuthUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "sistema@ea.local",
  papel: "SUPER_ADMIN",
  senhaTemporaria: false,
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");
  const alvo = process.argv.find((a) => a.startsWith("--admissao="))?.split("=")[1];

  const { sql, db } = createDb(url, 1);
  let candidatas: Array<{ id: string }> = [];
  try {
    // Sem pasta = nunca teve prontuário criado. O placeholder de MOCK também volta a ser tentado,
    // porque `precisaArquivarDrive` já o trata como "não arquivado" (self-heal do link fictício).
    candidatas = alvo
      ? await db.select({ id: admissoes.id }).from(admissoes).where(eq(admissoes.id, alvo))
      : await db
          .select({ id: admissoes.id })
          .from(admissoes)
          .where(isNull(admissoes.drivePastaUrl));
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(`Admissões candidatas (sem pasta do Drive): ${candidatas.length}`);
  if (candidatas.length === 0 || !aplicar) {
    console.log(aplicar ? "Nada a fazer." : "Simulação. Rode com --aplicar para tentar o envio.");
    return;
  }

  // `log` incluído de propósito: é o nível em que o `AuditoriaService` reporta o resultado do envio
  // ("enviados=N, ignorados por já existirem=M, pasta reutilizada=..."), que é justamente a prova
  // que se quer ver ao destravar uma admissão à mão.
  const app = await NestFactory.createApplicationContext(RearquivaModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const auditoria = app.get(AuditoriaService);
    let arquivadas = 0;
    let semAcao = 0;
    let falhas = 0;
    for (const a of candidatas) {
      try {
        const pos = await auditoria.aplicarPosVeredito(a.id, USER_SISTEMA);
        if (pos.arquivado) {
          arquivadas += 1;
          console.log(`  [arquivada] admissão ${a.id}`);
        } else if (pos.avisoDrive) {
          falhas += 1;
          console.log(`  [falhou de novo] admissão ${a.id}`);
        } else {
          semAcao += 1;
        }
      } catch (e) {
        falhas += 1;
        console.log(`  [erro] admissão ${a.id}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    console.log(
      `\nResumo: ${arquivadas} arquivada(s), ${falhas} com falha, ` +
        `${semAcao} sem ação (régua ainda aberta ou nada na staging).`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
