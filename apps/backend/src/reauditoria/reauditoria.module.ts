import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { PandapeModule } from "../pandape/pandape.module";
import { PortalModule } from "../portal/portal.module";
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
  // PortalModule: o descarte de documento (`DocumentoArquivoService`) move o marco de reabertura do
  // Portal pela porta única `PortalPendenciasService` (frente Auditoria -> Portal, item 1). Importação
  // direta e sem ciclo: nada no grafo do Portal/Admissões volta a importar a Reauditoria (só a
  // `app.module` e a `diagnostico.module` a importam).
  imports: [AuditoriaModule, PandapeModule, StagingModule, ReguaModule, PortalModule],
  controllers: [ReauditoriaController],
  providers: [ReauditoriaService, ValidacaoHumanaService, DocumentoArquivoService],
  exports: [ReauditoriaService],
})
export class ReauditoriaModule {}
