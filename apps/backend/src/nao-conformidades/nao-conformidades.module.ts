import { Module } from "@nestjs/common";
import { NaoConformidadesController } from "./nao-conformidades.controller";
import { NaoConformidadesService } from "./nao-conformidades.service";

@Module({
  controllers: [NaoConformidadesController],
  providers: [NaoConformidadesService],
})
export class NaoConformidadesModule {}
