import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { VtColetaController } from "./vt-coleta.controller";
import { VtColetaQueueModule } from "./vt-coleta-queue.module";
import { VtColetaSchedulerService } from "./vt-coleta-scheduler.service";
import { VtColetaService } from "./vt-coleta.service";
import { VtLinkService } from "./vt-link.service";
import { SolicitacaoVtService } from "./solicitacao-vt.service";
import { OrfaoVtService } from "./orfao-vt.service";

/**
 * Coleta de formulário de VT (§A.17 etapa 3 / GCS). Desacoplado do núcleo (§A.1): reusa
 * `AuditoriaService` (pós-veredito da baixa) e `AiClientService` (global: lista/baixa do bucket do
 * GCS e arquiva no Drive). A fila/worker (BullMQ) sobem nos providers de lifecycle. INERTE sem
 * `VT_COLETA_GCS_BUCKET`.
 *
 * Exporta o scheduler para a TELA DE DIAGNÓSTICO ler o estado e ligar/desligar/rodar-agora.
 */
@Module({
  imports: [AuditoriaModule, VtColetaQueueModule],
  controllers: [VtColetaController],
  providers: [VtColetaService, VtColetaSchedulerService, VtLinkService, SolicitacaoVtService, OrfaoVtService],
  // `SolicitacaoVtService` sai daqui para a tela de Benefícios (o botão "Solicitar novo VT") e para
  // a coleta fechar o pedido quando a resposta chega.
  exports: [VtColetaSchedulerService, SolicitacaoVtService, OrfaoVtService],
})
export class VtColetaModule {}
