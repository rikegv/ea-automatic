import { Module } from "@nestjs/common";
import { PandapeArquivosModule } from "../pandape/pandape-arquivos.module";
import { ReguaModule } from "../regua/regua.module";
import { StagingModule } from "../staging/staging.module";
import { AuditoriaController } from "./auditoria.controller";
import { AuditoriaService } from "./auditoria.service";

/**
 * Auditoria documental (F2). AiClientService vem do AiModule global.
 *
 * `PandapeArquivosModule` é a FOLHA do Pandapé (cliente da API + re-baixa por tipo), importada porque
 * o arquivamento no Drive re-baixa os anexos que a staging perdeu para o TTL. Importar o
 * `PandapeModule` inteiro fecharia ciclo: ele já importa este módulo aqui.
 */
@Module({
  imports: [ReguaModule, StagingModule, PandapeArquivosModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  // Exporta o service para o pull de docs do Pandapé (Fase 5) reusar a F2 incremental.
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
