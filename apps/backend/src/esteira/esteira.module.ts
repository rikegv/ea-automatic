import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { ReguaModule } from "../regua/regua.module";
import { EsteiraController } from "./esteira.controller";
import { EsteiraService } from "./esteira.service";

@Module({
  imports: [ReguaModule, AuditoriaModule],
  controllers: [EsteiraController],
  providers: [EsteiraService],
})
export class EsteiraModule {}
