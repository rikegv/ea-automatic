import { Module } from "@nestjs/common";
import { SalaEsperaController } from "./sala-espera.controller";
import { SalaEsperaService } from "./sala-espera.service";

@Module({
  controllers: [SalaEsperaController],
  providers: [SalaEsperaService],
  exports: [SalaEsperaService],
})
export class SalaEsperaModule {}
