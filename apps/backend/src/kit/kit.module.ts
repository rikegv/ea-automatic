import { Module } from "@nestjs/common";
import { ClicksignQueueModule } from "../clicksign/clicksign-queue.module";
import { StagingModule } from "../staging/staging.module";
import { KitController } from "./kit.controller";
import { KitService } from "./kit.service";

/**
 * Gerador de kit (F9). AiClientService vem do AiModule global. Importa o ClicksignQueueModule
 * (produtor) para enfileirar `criar-envelope` ao gerar o kit — sem acoplar ao ClicksignModule
 * (evita ciclo). Exporta KitService para o ClicksignModule (regeneração no reenvio).
 */
@Module({
  imports: [StagingModule, ClicksignQueueModule],
  controllers: [KitController],
  providers: [KitService],
  exports: [KitService],
})
export class KitModule {}
