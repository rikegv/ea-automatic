import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { ReguaModule } from "../regua/regua.module";
import { EsteiraController } from "./esteira.controller";
import { EsteiraService } from "./esteira.service";
import { ExameSchedulerService } from "./exame-scheduler.service";

@Module({
  imports: [ReguaModule, AuditoriaModule],
  controllers: [EsteiraController],
  providers: [EsteiraService, ExameSchedulerService],
  // Exporta o scheduler para o Diagnóstico ler o estado e disparar o ciclo (molde dos outros três).
  exports: [ExameSchedulerService],
})
export class EsteiraModule {}
