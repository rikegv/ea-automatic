import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EnviarParaGiController } from "./enviar-para-gi.controller";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import { GiApiService } from "./gi-api.service";
import { GiDeParaService } from "./gi-depara.service";
import { GiLeitorService } from "./gi-leitor.service";

/**
 * PORTAL→GI (peça 2 + a peça 3 CONSTRUÍDA, com o disparo DESARMADO).
 *
 * O MÓDULO SOBE FECHADO: sem `GI_API_URL` + os quatro campos da credencial de 2 etapas
 * (`GI_ID_CLIENTE_WEB`, `GI_CHAVE_ACESSO`, `GI_LOGIN`, `GI_SENHA`), `GiApiService.configurado()` diz
 * não, `EnviarParaGiService` é no-op e nada aqui toca a rede no boot.
 *
 * Providers da peça 3:
 *  - `GiApiService`  — cliente HTTP do GI (auth de 2 etapas, token ~2h em memória, UA de navegador).
 *  - `GiLeitorService` — monta o `PessoaParaGi` (join `candidatos` + `admissao_dados_gi`) + idempotência.
 *  - `GiDeParaService` — de/para de código de cidade/banco (fail-closed: sem correspondência, nulo).
 *
 * `EnviarParaGiService` é EXPORTADO porque o gatilho AUTOMÁTICO mora na auditoria: o fechamento da
 * régua obrigatória chama `enviar()`, que é ESTRUTURALMENTE no-op (nunca envia). O botão do time
 * (`EnviarParaGiController`) chama `enviarManual()`, a única porta de envio real, ainda assim travada
 * por `GI_DISPARO_ARMADO` (DESLIGADA nesta entrega).
 *
 * O EXPURGO dos dados do GI (B3) NÃO mora aqui: ele foi ao `ExpurgoService` de `admissoes`, junto do
 * TTL do CPF de substituição, porque é a mesma rotina de minimização por TTL (um sweep, duas purgas).
 */
@Module({
  imports: [ConfigModule],
  controllers: [EnviarParaGiController],
  providers: [EnviarParaGiService, GiApiService, GiLeitorService, GiDeParaService],
  exports: [EnviarParaGiService],
})
export class GiModule {}
