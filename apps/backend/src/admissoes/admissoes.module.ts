import { Module } from "@nestjs/common";
import { AdmissoesController } from "./admissoes.controller";
import { AdmissoesService } from "./admissoes.service";

@Module({
  controllers: [AdmissoesController],
  providers: [AdmissoesService],
})
export class AdmissoesModule {}
