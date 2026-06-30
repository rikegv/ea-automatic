import { Global, Module } from "@nestjs/common";
import { AiClientService } from "./ai-client.service";

/** Cliente do ai-service (INT-3). Global: consumido por Auditoria e Kit. */
@Global()
@Module({
  providers: [AiClientService],
  exports: [AiClientService],
})
export class AiModule {}
