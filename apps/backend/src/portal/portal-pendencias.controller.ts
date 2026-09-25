import { Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { PortalPendenciasService } from "./portal-pendencias.service";

/**
 * A pendência do Portal que caiu para a fila do TIME: solicitar o reenvio (item 5) e zerar o teto
 * (item 6). São rotas INTERNAS, do time, e não do candidato.
 *
 * ══ POR QUE ELAS NÃO FICAM SOB `/portal`, E ISSO NÃO É CAPRICHO DE NOME ═════════════════════════
 *
 * As duas rotas do candidato (`portal/credencial` e `portal/confirmar`) são `@Public()`, protegidas
 * pelo guard de sessão local, e precisam entrar na ALLOWLIST da barreira. Estas aqui são o oposto:
 * exigem usuário autenticado do EA e NUNCA podem ser alcançáveis de fora. Pendurá-las sob `portal/`
 * faria uma regra de allowlist por prefixo, no dia em que alguém escrevesse uma, expor ao mundo a
 * porta que zera o teto. Elas moram sob `esteira/`, que é território autenticado, junto das rotas de
 * auditoria e reauditoria que o mesmo time já usa.
 *
 * ══ OS DOIS PAPÉIS, E A DIFERENÇA É DELIBERADA ═════════════════════════════════════════════════
 *
 *  - SOLICITAR REENVIO é do TIME, ou seja, do consultor: SEM `@Roles`, no mesmo padrão operacional
 *    de `AuditoriaController` e `ReauditoriaController`, que são propositalmente sem restrição de
 *    papel. É fluxo normal de trabalho.
 *  - ZERAR O TETO é de MASTER e de SUPER_ADMIN, pelo `RolesGuard` global que já existe. É exceção, e
 *    ela admite que a régua pode estar errada (§A.9). Consultor não zera teto.
 *
 * Nenhum caminho novo de autorização foi inventado aqui: o RBAC é o do projeto.
 */
@Controller("esteira/pendencias-portal")
export class PortalPendenciasController {
  constructor(private readonly pendencias: PortalPendenciasService) {}

  /** Situação da pendência: quantas reprovações contam hoje e como ela foi reaberta da última vez. */
  @Get(":admissaoId/:tipoDocumentoId")
  situacao(
    @Param("admissaoId", ParseUUIDPipe) admissaoId: string,
    @Param("tipoDocumentoId", ParseUUIDPipe) tipoDocumentoId: string,
  ) {
    return this.pendencias.situacao(admissaoId, tipoDocumentoId);
  }

  /** O time pede o documento de novo ao candidato. Fluxo normal, do consultor. */
  @Post(":admissaoId/:tipoDocumentoId/solicitar-reenvio")
  solicitarReenvio(
    @Param("admissaoId", ParseUUIDPipe) admissaoId: string,
    @Param("tipoDocumentoId", ParseUUIDPipe) tipoDocumentoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pendencias.solicitarReenvio(admissaoId, tipoDocumentoId, user);
  }

  /**
   * O Master zera as tentativas. Exceção, com rastro de quem destravou e quando.
   *
   * SÓ DEPOIS DA QUEDA (decisão do diretor): a trava está no serviço, que é onde ela vale. A tela
   * esconde o botão antes da terceira reprovação, e esconder não é impedir.
   */
  @Post(":admissaoId/:tipoDocumentoId/zerar-tentativas")
  @Roles("MASTER", "SUPER_ADMIN")
  zerarTentativas(
    @Param("admissaoId", ParseUUIDPipe) admissaoId: string,
    @Param("tipoDocumentoId", ParseUUIDPipe) tipoDocumentoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pendencias.zerarTentativas(admissaoId, tipoDocumentoId, user);
  }
}
