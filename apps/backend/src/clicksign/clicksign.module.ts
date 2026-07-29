import { Module } from "@nestjs/common";
import { InternalTokenGuard } from "../pandape/internal-token.guard";
import { KitModule } from "../kit/kit.module";
import { StagingModule } from "../staging/staging.module";
import { AssinanteEmpresaModule } from "./assinante-empresa.module";
import { ClicksignApiService } from "./clicksign-api.service";
import { ClicksignController } from "./clicksign.controller";
import { ClicksignGestaoService } from "./clicksign-gestao.service";
import { ClicksignQueueModule } from "./clicksign-queue.module";
import { ClicksignSchedulerService } from "./clicksign-scheduler.service";
import { ClicksignSyncService } from "./clicksign-sync.service";

/**
 * Módulo da assinatura Clicksign (INT-4 / F9). Desacoplado do núcleo (§A.1): reusa KitService
 * (regeneração no reenvio), AiClientService (arquivamento no Drive — AiModule é global) e a staging.
 * INERTE sem CLICKSIGN_API_TOKEN. Importa o ClicksignQueueModule (produtor da fila) — o mesmo que o
 * KitModule importa para enfileirar `criar-envelope`, quebrando o ciclo KitModule ↔ ClicksignModule.
 * Reusa o InternalTokenGuard da Fase 5 (registrado como provider local).
 *
 * Exporta o scheduler para a TELA DE DIAGNÓSTICO ler o estado e ligar/desligar/rodar-agora, no mesmo
 * padrão do VtColetaModule.
 */
@Module({
  imports: [ClicksignQueueModule, KitModule, StagingModule, AssinanteEmpresaModule],
  controllers: [ClicksignController],
  providers: [
    ClicksignApiService,
    ClicksignSyncService,
    ClicksignSchedulerService,
    ClicksignGestaoService,
    InternalTokenGuard,
  ],
  exports: [ClicksignSchedulerService],
})
export class ClicksignModule {}
