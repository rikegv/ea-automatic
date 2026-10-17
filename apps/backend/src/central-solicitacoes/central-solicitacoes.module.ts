import { Module } from "@nestjs/common";
import { StagingModule } from "../staging/staging.module";
import { NotificacoesController } from "./notificacoes.controller";
import { NotificacoesService } from "./notificacoes.service";
import { SolicitacoesController } from "./solicitacoes.controller";
import { SolicitacoesGestaoController } from "./solicitacoes-gestao.controller";
import { SolicitacoesService } from "./solicitacoes.service";

/**
 * CENTRAL DE SOLICITAÇÕES (OST Central de Solicitações): abertura de pedidos de funcionalidade/bug,
 * thread, gestão do ciclo de status pelo SUPER_ADMIN e notificações na plataforma.
 *
 * `StagingModule` entra pela staging efêmera do print (§A.6): a imagem passa por disco temporário,
 * sobe ao Drive e é descartada. `AiClientService` (o arquivador do Drive) vem do `AiModule` GLOBAL,
 * então não é importado aqui, assim como a Auditoria o consome.
 */
@Module({
  imports: [StagingModule],
  controllers: [SolicitacoesController, SolicitacoesGestaoController, NotificacoesController],
  providers: [SolicitacoesService, NotificacoesService],
})
export class CentralSolicitacoesModule {}
