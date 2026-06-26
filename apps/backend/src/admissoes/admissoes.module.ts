import { Module } from "@nestjs/common";
import { AdmissoesController } from "./admissoes.controller";
import { AdmissoesService } from "./admissoes.service";
import { ExpurgoService } from "./expurgo.service";

@Module({
  controllers: [AdmissoesController],
  providers: [AdmissoesService, ExpurgoService],
})
export class AdmissoesModule {}
