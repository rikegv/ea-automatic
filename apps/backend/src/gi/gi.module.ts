import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EnviarParaGiController } from "./enviar-para-gi.controller";
import { EnviarParaGiService } from "./enviar-para-gi.service";

/**
 * PORTAL→GI (peça 2 + o gatilho preparado da peça 3, INERTE).
 *
 * O MÓDULO SOBE INERTE: sem `GI_API_URL`/`GI_API_TOKEN`, o `EnviarParaGiService` é no-op e nada aqui
 * lança no boot.
 *
 * `EnviarParaGiService` é EXPORTADO porque o gatilho ponto (a) mora na auditoria: o fechamento da
 * régua obrigatória (`AuditoriaService.aplicarPosVeredito`) chama o envio inerte. O ponto (b) é o
 * `EnviarParaGiController` (botão do time), que vive aqui.
 *
 * O EXPURGO dos dados do GI (B3) NÃO mora aqui: ele foi ao `ExpurgoService` de `admissoes`, junto do
 * TTL do CPF de substituição, porque é a mesma rotina de minimização por TTL (um sweep, duas purgas).
 */
@Module({
  imports: [ConfigModule],
  controllers: [EnviarParaGiController],
  providers: [EnviarParaGiService],
  exports: [EnviarParaGiService],
})
export class GiModule {}
