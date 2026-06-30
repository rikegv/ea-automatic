import { Module } from "@nestjs/common";
import { StagingModule } from "../staging/staging.module";
import { KitController } from "./kit.controller";
import { KitService } from "./kit.service";

/** Gerador de kit (F9). AiClientService vem do AiModule global. */
@Module({
  imports: [StagingModule],
  controllers: [KitController],
  providers: [KitService],
})
export class KitModule {}
