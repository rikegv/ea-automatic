import { Module } from "@nestjs/common";
import { GiModule } from "../gi/gi.module";
import { PandapeArquivosModule } from "../pandape/pandape-arquivos.module";
import { ReguaModule } from "../regua/regua.module";
import { StagingModule } from "../staging/staging.module";
import { AuditoriaController } from "./auditoria.controller";
import { AuditoriaService } from "./auditoria.service";
import { ReconciliacaoAuditoriaScheduler } from "./reconciliacao-auditoria.scheduler";

/**
 * Auditoria documental (F2). AiClientService vem do AiModule global.
 *
 * `PandapeArquivosModule` é a FOLHA do Pandapé (cliente da API + re-baixa por tipo), importada porque
 * o arquivamento no Drive re-baixa os anexos que a staging perdeu para o TTL. Importar o
 * `PandapeModule` inteiro fecharia ciclo: ele já importa este módulo aqui.
 */
@Module({
  // `GiModule` entra pelo GATILHO da peça 3 (INERTE): ao fechar a régua obrigatória, a Auditoria
  // chama `EnviarParaGiService.enviar` (no-op sem GI configurado). O módulo exporta só esse serviço.
  imports: [ReguaModule, StagingModule, PandapeArquivosModule, GiModule],
  controllers: [AuditoriaController],
  // `ReconciliacaoAuditoriaScheduler` é a rede de segurança no processo (padrão da casa): reusa
  // `AuditoriaService` (choke-point do avanço) e `ReguaCompletudeService` (que vem do `ReguaModule`
  // já importado). Kill-switch `AUDITORIA_RECONCILIACAO=off`. NÃO exportado: nada externo o consome
  // (o backfill o alcança por `app.get` no contexto standalone).
  providers: [AuditoriaService, ReconciliacaoAuditoriaScheduler],
  // Exporta o service para o pull de docs do Pandapé (Fase 5) reusar a F2 incremental.
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
