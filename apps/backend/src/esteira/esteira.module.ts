import { Module } from "@nestjs/common";
import { EsteiraController } from "./esteira.controller";
import { EsteiraService } from "./esteira.service";

@Module({
  controllers: [EsteiraController],
  providers: [EsteiraService],
})
export class EsteiraModule {}
