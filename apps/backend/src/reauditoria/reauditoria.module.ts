import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { PandapeModule } from "../pandape/pandape.module";
import { ReguaModule } from "../regua/regua.module";
import { StagingModule } from "../staging/staging.module";
import { DocumentoArquivoService } from "./documento-arquivo.service";
import { ReauditoriaController } from "./reauditoria.controller";
import { ReauditoriaService } from "./reauditoria.service";
import { ValidacaoHumanaService } from "./validacao-humana.service";

/**
 * Reauditoria por documento (OST A / Bloco 5). Módulo PRÓPRIO por causa da direção das dependências:
 * `PandapeModule` já importa `AuditoriaModule` (o pull reusa a F2), então colocar a reauditoria em
 * qualquer um dos dois fecharia um ciclo. Aqui ela importa os dois e ninguém a importa de volta.
 */
@Module({
  imports: [AuditoriaModule, PandapeModule, StagingModule, ReguaModule],
  controllers: [ReauditoriaController],
  providers: [ReauditoriaService, ValidacaoHumanaService, DocumentoArquivoService],
  exports: [ReauditoriaService],
})
export class ReauditoriaModule {}
