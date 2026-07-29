import { Module } from "@nestjs/common";
import { AdmissoesModule } from "../admissoes/admissoes.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { InternalTokenGuard } from "./internal-token.guard";
import { PandapeArquivosModule } from "./pandape-arquivos.module";
import { PandapeController } from "./pandape.controller";
import { PandapeQueueModule } from "./pandape-queue.module";
import { PandapeSchedulerService } from "./pandape-scheduler.service";
import { PandapeSyncService } from "./pandape-sync.service";
import { PandapeWebhookController } from "./pandape-webhook.controller";
import { PandapeWebhookGuard } from "./pandape-webhook.guard";

/**
 * Módulo da integração Pandapé (Fase 5 / INT-1). Desacoplado do núcleo (§A.1): reusa
 * `AdmissoesService` (criação por origem PANDAPE) e `AuditoriaService` (pull de docs / F2). DRIZZLE
 * é global. A fila/worker (BullMQ) sobem nos providers de lifecycle. INERTE sem PANDAPE_API_TOKEN.
 */
@Module({
  // `PandapeArquivosModule` é a FOLHA que carrega o `PandapeApiService` (uma instância só, um cache
  // de token só) e a re-baixa por tipo. Ele é importado também pela Auditoria, que precisa re-baixar
  // no arquivamento sem fechar ciclo com este módulo.
  imports: [AdmissoesModule, AuditoriaModule, PandapeQueueModule, PandapeArquivosModule],
  controllers: [PandapeController, PandapeWebhookController],
  providers: [
    PandapeSyncService,
    PandapeSchedulerService,
    InternalTokenGuard,
    PandapeWebhookGuard,
  ],
  // Exporta o sync para a REAUDITORIA (OST A / Bloco 5) reusar o download por tipo e o registro das
  // marcas de arquivo, sem duplicar o cliente da API. Exporta o scheduler para a TELA DE DIAGNÓSTICO
  // ler o estado (Bloco 4) e para o controle ligar/desligar e disparar ciclo (Bloco 5).
  exports: [PandapeSyncService, PandapeArquivosModule, PandapeSchedulerService],
})
export class PandapeModule {}
