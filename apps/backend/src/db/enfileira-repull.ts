import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { PandapeQueueModule } from "../pandape/pandape-queue.module";
import { PandapeQueueService } from "../pandape/pandape-queue.service";

/**
 * Enfileira UM re-pull de documentos (Fase 2 item 2) na fila BullMQ do próprio pull, para o worker
 * do backend processar com espaçamento e backoff sob o teto. NÃO baixa nem audita nada aqui: só
 * produz o job. O consumo é do worker já rodando no serviço de produção.
 *
 * Uma admissão por invocação, de propósito: o chamador enfileira uma, espera terminar, confere quota
 * e só então enfileira a próxima. Isso dá o controle de "parar se a quota apertar" que o worker
 * autônomo não daria sozinho.
 *
 * §A.6: só id de admissão e idPreCollaborator (técnicos), nada de PII.
 */
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PandapeQueueModule] })
class EnfileiraModule {}

function argOf(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
}

async function main(): Promise<void> {
  const admissaoId = argOf("id");
  const idPre = argOf("idpre");
  if (!admissaoId || !idPre) throw new Error("Informe --id=<uuid> e --idpre=<idPreCollaborator>");

  const app = await NestFactory.createApplicationContext(EnfileiraModule, { logger: ["warn", "error"] });
  try {
    const fila = app.get(PandapeQueueService);
    // `reprocessar: true` reavalia o acervo; `jobIdSufixo` força um job NOVO (o jobId estável
    // `pull-<admissao>` já consta concluído no histórico e seria descartado calado).
    const ok = await fila.enfileirarPullDocumentos(admissaoId, idPre, {
      reprocessar: true,
      jobIdSufixo: "date-bug-repull",
    });
    console.log(ok ? `ENFILEIRADO: ${admissaoId} (idPre=${idPre})` : `FALHA ao enfileirar ${admissaoId}`);
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
