import { Module } from "@nestjs/common";
import { ClicksignQueueService } from "./clicksign-queue.service";

/**
 * Módulo enxuto do PRODUTOR da fila Clicksign. Isolar o produtor aqui quebra o ciclo
 * KitModule ↔ ClicksignModule: o KitModule importa só este (para enfileirar `criar-envelope`),
 * enquanto o ClicksignModule (worker + controller) importa o KitModule.
 */
@Module({
  providers: [ClicksignQueueService],
  exports: [ClicksignQueueService],
})
export class ClicksignQueueModule {}
