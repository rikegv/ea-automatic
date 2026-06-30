import { Module } from "@nestjs/common";
import { ReguaModule } from "../regua/regua.module";
import { EsteiraController } from "./esteira.controller";
import { EsteiraService } from "./esteira.service";

@Module({
  imports: [ReguaModule],
  controllers: [EsteiraController],
  providers: [EsteiraService],
})
export class EsteiraModule {}
