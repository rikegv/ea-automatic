import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { PandapeModule } from "../pandape/pandape.module";
import { PandapeQueueModule } from "../pandape/pandape-queue.module";
import { ReauditoriaModule } from "../reauditoria/reauditoria.module";
import { DiagnosticoController } from "./diagnostico.controller";
import { DiagnosticoService } from "./diagnostico.service";

/**
 * Tela de diagnóstico (OST). Importa os módulos cujos serviços a tela reusa: Auditoria (pós-veredito
 * de arquivamento e AiClientService global), Pandapé (API + fila) e Reauditoria (reauditar por alvo).
 * AiClientService vem do AiModule global.
 */
@Module({
  imports: [AuditoriaModule, PandapeModule, PandapeQueueModule, ReauditoriaModule],
  controllers: [DiagnosticoController],
  providers: [DiagnosticoService],
})
export class DiagnosticoModule {}
