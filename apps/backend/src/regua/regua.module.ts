import { Module } from "@nestjs/common";
import { ReguaCompletudeService } from "./regua-completude.service";

/** Completude da régua obrigatória (§A.3 regra 4). Reusado por Esteira e Auditoria. */
@Module({
  providers: [ReguaCompletudeService],
  exports: [ReguaCompletudeService],
})
export class ReguaModule {}
