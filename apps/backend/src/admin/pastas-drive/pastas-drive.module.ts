import { Module } from "@nestjs/common";
import { PastasDriveController } from "./pastas-drive.controller";

/**
 * Gestão da pasta-pai do Drive por tabela (INT-2). O `DrivePastaPaiService` e o `AiClientService`
 * vêm do `AiModule` (global), então este módulo só declara a controller.
 */
@Module({
  controllers: [PastasDriveController],
})
export class PastasDriveModule {}
