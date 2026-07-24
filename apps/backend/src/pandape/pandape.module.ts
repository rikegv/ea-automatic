import { Module } from "@nestjs/common";
import { AdmissoesModule } from "../admissoes/admissoes.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { InternalTokenGuard } from "./internal-token.guard";
import { PandapeApiService } from "./pandape-api.service";
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
  imports: [AdmissoesModule, AuditoriaModule, PandapeQueueModule],
  controllers: [PandapeController, PandapeWebhookController],
  providers: [
    PandapeApiService,
    PandapeSyncService,
    PandapeSchedulerService,
    InternalTokenGuard,
    PandapeWebhookGuard,
  ],
  // Exporta o sync para a REAUDITORIA (OST A / Bloco 5) reusar o download por tipo e o registro das
  // marcas de arquivo, sem duplicar o cliente da API. Exporta o scheduler para a TELA DE DIAGNÓSTICO
  // ler o estado (Bloco 4) e para o controle ligar/desligar e disparar ciclo (Bloco 5).
  exports: [PandapeSyncService, PandapeApiService, PandapeSchedulerService],
})
export class PandapeModule {}
