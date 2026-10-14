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

  /**
   * O time RESOLVE a intervenção humana da admissão: ela sai do card "Intervenção Humana" do
   * Gerenciador do Portal. Fluxo normal, do consultor, SEM `@Roles`, no mesmo padrão de
   * `solicitar-reenvio` (é trabalho operacional, não a exceção do Master).
   *
   * ══ POR QUE A ROTA DE UM SEGMENTO NÃO COLIDE COM AS DE DOIS ════════════════════════════════════
   *
   * Esta é `:admissaoId/resolver` (UM parâmetro, "resolver" é literal); as demais operacionais são
   * `:admissaoId/:tipoDocumentoId/...` (DOIS parâmetros) e a de situação é `:admissaoId/:tipoDocumentoId`
   * (dois parâmetros). O roteador do Nest (Express) casa por NÚMERO de segmentos antes de olhar o
   * conteúdo: `POST /esteira/pendencias-portal/<id>/resolver` tem dois segmentos depois do prefixo e
   * só pode casar um padrão de dois segmentos, enquanto `:admissaoId/:tipoDocumentoId/algo` tem três.
   * "resolver" nunca é lido como um `tipoDocumentoId` porque aquele padrão exige um terceiro segmento
   * que esta URL não tem. Sem ambiguidade, e o `ParseUUIDPipe` no `:admissaoId` é cinto e suspensório.
   */
  @Post(":admissaoId/resolver")
  resolver(
    @Param("admissaoId", ParseUUIDPipe) admissaoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pendencias.resolver(admissaoId, user);
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
   * O time REABRE UM DOCUMENTO RECEBIDO PELO PORTAL (envio do candidato em análise). Par do descarte
   * para o caminho do `portal_credenciais`: move o marco pela porta única (`REABERTURA_AUDITORIA`),
   * a casa do Portal volta a "Escolher um arquivo", e fica o rastro de reprovação do time no envio.
   * Fluxo normal, do consultor, SEM `@Roles`, no mesmo padrão de `solicitar-reenvio`.
   */
  @Post(":admissaoId/:tipoDocumentoId/reabrir-recebido")
  reabrirRecebido(
    @Param("admissaoId", ParseUUIDPipe) admissaoId: string,
    @Param("tipoDocumentoId", ParseUUIDPipe) tipoDocumentoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pendencias.reabrirDocumentoRecebidoPortal(admissaoId, tipoDocumentoId, user);
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
