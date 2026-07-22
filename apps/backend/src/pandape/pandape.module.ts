import { Module } from "@nestjs/common";
import { AdmissoesModule } from "../admissoes/admissoes.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { InternalTokenGuard } from "./internal-token.guard";
import { PandapeApiService } from "./pandape-api.service";
import { PandapeController } from "./pandape.controller";
import { PandapeQueueModule } from "./pandape-queue.module";
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
    InternalTokenGuard,
    PandapeWebhookGuard,
  ],
})
export class PandapeModule {}
