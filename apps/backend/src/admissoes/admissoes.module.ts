import { Module } from "@nestjs/common";
import { PandapeQueueModule } from "../pandape/pandape-queue.module";
import { AdmissoesController } from "./admissoes.controller";
import { AdmissoesService } from "./admissoes.service";
import { ExpurgoService } from "./expurgo.service";

@Module({
  // Só o PRODUTOR da fila (sem ciclo com o PandapeModule): a liberação enfileira o pull de documentos.
  imports: [PandapeQueueModule],
  controllers: [AdmissoesController],
  providers: [AdmissoesService, ExpurgoService],
  // Exporta o service para a sync do Pandapé (Fase 5) reusar a criação por origem PANDAPE.
  exports: [AdmissoesService],
})
export class AdmissoesModule {}
