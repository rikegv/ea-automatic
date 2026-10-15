import { Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { EnviarParaGiService } from "./enviar-para-gi.service";

/**
 * PORTAL→GI: o BOTÃO MANUAL do TIME (peça 3, gatilho ponto b). É a segunda porta que dispara o
 * mesmo `EnviarParaGiService`; a primeira é automática, no fechamento da auditoria.
 *
 * STAFF, NÃO O CANDIDATO, e isso continua sendo o ponto de segurança da classe: ela NÃO é `@Public()`
 * e não tem `PortalSessaoGuard`. Passa pelo `JwtAuthGuard` global (exige sessão de usuário do EA), e
 * o candidato (que não tem JWT nenhum) nunca alcança. Mora sob `gi/`, fora do prefixo `portal/` que a
 * barreira allowlista para a internet: jamais alcançável de fora.
 *
 * ⚠️ QUALQUER CONSULTOR PODE ENVIAR (decisão do diretor, 14/10/2026). O `@Roles(MASTER, SUPER_ADMIN)`
 * foi REMOVIDO de propósito: estando na tela de Cadastro, o candidato já concluiu Auditoria e Exame,
 * então qualquer consultor pode seguir com ele para o G.I. A operação NÃO é reivindicada por menu
 * (`menuDaOperacao` devolve nulo), então o `MenuGuard` a trata como operação de trabalho ABERTA e
 * passa; o que fecha o acesso é só o `JwtAuthGuard` (sessão de EA). Candidato de fora segue barrado.
 */
@Controller("gi")
export class EnviarParaGiController {
  constructor(private readonly enviarService: EnviarParaGiService) {}

  /**
   * Dispara o envio manual da admissão ao GI. É a porta ALTERNATIVA, não a principal: desde 05/10/2026
   * o caminho principal é o AUTOMÁTICO, no fechamento da auditoria (decisão do diretor). As duas
   * passam pela MESMA cadeia de guardas (`enviarComGuardas`) e pela MESMA flag `GI_DISPARO_ARMADO`.
   *
   * ⚠️ O BOTÃO SEMPRE REENVIA, inclusive admissão já enviada (decisão do diretor, 14/10/2026): o
   * manual IGNORA a idempotência `jaEnviado`, porque pode haver "sucesso falso" (o EA carimbou o
   * envio mas o registro não está no G.I) e o time precisa conseguir mandar de novo. O automático
   * CONTINUA respeitando `jaEnviado` (não re-dispara a cada fechamento). Ver `enviarManual`.
   *
   * ⚠️ A DIFERENÇA QUE IMPORTA, levantada pelo `seguranca`: o automático exige admissão OPERÁVEL
   * (`admissaoOperavel`, farol vivo e não pausada) e o MANUAL NÃO. Declinada/rescindida ainda é
   * barrada pela guarda de ENCERRAMENTO (`admissaoEncerrada`), que vale para os dois gatilhos.
   *
   * O `@CurrentUser()` é o autor do disparo (não persistido do nosso lado: decisão do diretor em
   * `docs/GI-VETO-DISPARO-ARMADO-RESOLVIDO.md`).
   */
  @Post("admissao/:admissaoId/enviar")
  enviar(@Param("admissaoId", ParseUUIDPipe) admissaoId: string, @CurrentUser() user: AuthUser) {
    return this.enviarService.enviarManual(admissaoId, user.id);
  }
}
