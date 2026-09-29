import { Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { EnviarParaGiService } from "./enviar-para-gi.service";

/**
 * PORTAL→GI: o BOTÃO MANUAL do TIME (peça 3, gatilho ponto b). É a segunda porta que dispara o
 * mesmo `EnviarParaGiService` inerte; a primeira é automática, no fechamento da auditoria.
 *
 * STAFF, NÃO O CANDIDATO, e isso é o ponto de segurança da classe: ela NÃO é `@Public()` e não tem
 * `PortalSessaoGuard`. Passa pelo `JwtAuthGuard` global (exige sessão de usuário do EA) e por
 * `@Roles(MASTER, SUPER_ADMIN)`, então COMUM é barrado pelo `RolesGuard` antes mesmo do `MenuGuard`,
 * e o candidato (que não tem JWT nenhum) nunca alcança. Mora sob `gi/`, fora do prefixo `portal/`
 * que a barreira allowlista para a internet: jamais alcançável de fora.
 *
 * A TELA E O MENU DEDICADO SÃO DA PEÇA 3 (§A.14/§A.31: não se constrói a UI da peça 3 agora). O que
 * fecha o acesso hoje é o `@Roles`, que restringe a MASTER/SUPER_ADMIN; a reivindicação por menu
 * entra com a tela da peça 3.
 */
@Controller("gi")
export class EnviarParaGiController {
  constructor(private readonly enviarService: EnviarParaGiService) {}

  /**
   * Dispara o envio manual da admissão ao GI. É o ÚNICO caminho que chega perto do envio real (o
   * automático da auditoria é estruturalmente no-op), e ainda assim trava por `GI_DISPARO_ARMADO`,
   * DESLIGADA nesta entrega: hoje monta o payload e devolve `GI_MONTADO_NAO_DISPARADO` sem criar nada
   * no GI. O `@CurrentUser()` é o autor do disparo, para a trilha do GI da peça 3.
   */
  @Post("admissao/:admissaoId/enviar")
  @Roles("MASTER", "SUPER_ADMIN")
  enviar(@Param("admissaoId", ParseUUIDPipe) admissaoId: string, @CurrentUser() user: AuthUser) {
    return this.enviarService.enviarManual(admissaoId, user.id);
  }
}
