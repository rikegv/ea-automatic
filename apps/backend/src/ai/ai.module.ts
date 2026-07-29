import { Global, Module } from "@nestjs/common";
import { AiClientService } from "./ai-client.service";
import { DrivePastaPaiService } from "./drive-pasta-pai.service";

/**
 * Cliente do ai-service (INT-3) + resolução da pasta-pai do Drive por tabela (INT-2). Global: o
 * `AiClientService` é consumido por Auditoria/Kit/Clicksign/VT, e o `DrivePastaPaiService` pelos
 * mesmos arquivamentos (Auditoria, Clicksign) e pelo Diagnóstico, sem cada módulo reimportar.
 */
@Global()
@Module({
  providers: [AiClientService, DrivePastaPaiService],
  exports: [AiClientService, DrivePastaPaiService],
})
export class AiModule {}
