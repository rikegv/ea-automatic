import { Module, forwardRef } from "@nestjs/common";
import { PandapeQueueModule } from "../pandape/pandape-queue.module";
import { PortalModule } from "../portal/portal.module";
import { ReguaModule } from "../regua/regua.module";
import { AdmissoesController } from "./admissoes.controller";
import { AdmissoesService } from "./admissoes.service";
import { ExpurgoService } from "./expurgo.service";

@Module({
  // Só o PRODUTOR da fila (sem ciclo com o PandapeModule): a liberação enfileira o pull de documentos.
  // ReguaModule: a contagem de documentos obrigatórios pendentes do relatório exportável vem da
  // MESMA régua que a Esteira usa, em vez de uma consulta nova (§A.19). O módulo não importa nada,
  // então não há ciclo.
  // PortalModule: a liberação individual entrega o link de acesso ao prontuário (`PortalEnvioService`).
  // O ciclo deixou de ser inexistente: a porta de e-mail do portal passou a reusar
  // `AdmissoesService.corrigirCpf` (ponte do CPF pendente), então PortalModule importa este módulo de
  // volta. `forwardRef` dos dois lados declara o ciclo em vez de quebrar o boot.
  imports: [PandapeQueueModule, ReguaModule, forwardRef(() => PortalModule)],
  controllers: [AdmissoesController],
  providers: [AdmissoesService, ExpurgoService],
  // Exporta o service para a sync do Pandapé (Fase 5) reusar a criação por origem PANDAPE.
  exports: [AdmissoesService],
})
export class AdmissoesModule {}
