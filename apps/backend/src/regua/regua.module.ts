import { Module } from "@nestjs/common";
import { ReguaCompletudeService } from "./regua-completude.service";
import { ReconciliacaoReguaScheduler } from "./reconciliacao-regua.scheduler";

/** Completude da régua obrigatória (§A.3 regra 4). Reusado por Esteira e Auditoria. */
@Module({
  providers: [ReguaCompletudeService, ReconciliacaoReguaScheduler],
  exports: [ReguaCompletudeService],
})
export class ReguaModule {}
