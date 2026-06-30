import { Module } from "@nestjs/common";
import { StagingPurgeService } from "./staging-purge.service";
import { StagingService } from "./staging.service";

/** Staging efêmera dos binários + expurgo por TTL (§A.6). Reusado por Auditoria e Kit. */
@Module({
  providers: [StagingService, StagingPurgeService],
  exports: [StagingService],
})
export class StagingModule {}
