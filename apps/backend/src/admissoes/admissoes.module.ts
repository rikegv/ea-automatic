import { Module } from "@nestjs/common";
import { AdmissoesController } from "./admissoes.controller";
import { AdmissoesService } from "./admissoes.service";
import { ExpurgoService } from "./expurgo.service";

@Module({
  controllers: [AdmissoesController],
  providers: [AdmissoesService, ExpurgoService],
  // Exporta o service para a sync do Pandapé (Fase 5) reusar a criação por origem PANDAPE.
  exports: [AdmissoesService],
})
export class AdmissoesModule {}
