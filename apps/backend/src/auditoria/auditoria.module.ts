import { Module } from "@nestjs/common";
import { ReguaModule } from "../regua/regua.module";
import { StagingModule } from "../staging/staging.module";
import { AuditoriaController } from "./auditoria.controller";
import { AuditoriaService } from "./auditoria.service";

/** Auditoria documental (F2). AiClientService vem do AiModule global. */
@Module({
  imports: [ReguaModule, StagingModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  // Exporta o service para o pull de docs do Pandapé (Fase 5) reusar a F2 incremental.
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
