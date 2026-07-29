import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { ClicksignModule } from "../clicksign/clicksign.module";
import { PandapeModule } from "../pandape/pandape.module";
import { PandapeQueueModule } from "../pandape/pandape-queue.module";
import { ReauditoriaModule } from "../reauditoria/reauditoria.module";
import { VtColetaModule } from "../vt-coleta/vt-coleta.module";
import { DiagnosticoController } from "./diagnostico.controller";
import { DiagnosticoService } from "./diagnostico.service";

/**
 * Tela de diagnóstico (OST). Importa os módulos cujos serviços a tela reusa: Auditoria (pós-veredito
 * de arquivamento e AiClientService global), Pandapé (API + fila) e Reauditoria (reauditar por alvo).
 * AiClientService vem do AiModule global. O ClicksignModule entra pelo scheduler da assinatura
 * (estado + liga/desliga + rodar-agora), no mesmo papel do VtColetaModule.
 */
@Module({
  imports: [
    AuditoriaModule,
    ClicksignModule,
    PandapeModule,
    PandapeQueueModule,
    ReauditoriaModule,
    VtColetaModule,
  ],
  controllers: [DiagnosticoController],
  providers: [DiagnosticoService],
})
export class DiagnosticoModule {}
