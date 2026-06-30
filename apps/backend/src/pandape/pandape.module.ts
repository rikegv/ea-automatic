import { Module } from "@nestjs/common";
import { AdmissoesModule } from "../admissoes/admissoes.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { InternalTokenGuard } from "./internal-token.guard";
import { PandapeApiService } from "./pandape-api.service";
import { PandapeController } from "./pandape.controller";
import { PandapeQueueService } from "./pandape-queue.service";
import { PandapeSyncService } from "./pandape-sync.service";

/**
 * Módulo da integração Pandapé (Fase 5 / INT-1). Desacoplado do núcleo (§A.1): reusa
 * `AdmissoesService` (criação por origem PANDAPE) e `AuditoriaService` (pull de docs / F2). DRIZZLE
 * é global. A fila/worker (BullMQ) sobem nos providers de lifecycle. INERTE sem PANDAPE_API_TOKEN.
 */
@Module({
  imports: [AdmissoesModule, AuditoriaModule],
  controllers: [PandapeController],
  providers: [
    PandapeApiService,
    PandapeQueueService,
    PandapeSyncService,
    InternalTokenGuard,
  ],
})
export class PandapeModule {}
