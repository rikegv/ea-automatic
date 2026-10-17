import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Roles } from "../auth/decorators";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { AcaoGestaoDto } from "./central-solicitacoes.dto";
import { SolicitacoesService } from "./solicitacoes.service";

/**
 * CENTRAL DE SOLICITAÇÕES, lado da GESTÃO (OST Central de Solicitações). Só SUPER_ADMIN, carimbado no
 * controller inteiro (`@Roles`). Lista com filtros multiselect (§A.28), detalhe e as ações do ciclo
 * de status (aprovar, reprovar, enviar dúvida, em andamento, concluir).
 */
@Controller("solicitacoes-gestao")
@Roles("SUPER_ADMIN")
export class SolicitacoesGestaoController {
  constructor(private readonly service: SolicitacoesService) {}

  /** Lista para a gestão. `tipos` e `status` são multivalor (CSV, §A.28); `busca` é texto livre. */
  @Get()
  listar(
    @Query("tipos") tipos?: string,
    @Query("status") status?: string,
    @Query("busca") busca?: string,
  ) {
    return this.service.listarGestao({
      tipos: parseMulti(tipos),
      status: parseMulti(status),
      busca,
    });
  }

  /** Detalhe de qualquer solicitação. */
  @Get(":id")
  detalhe(@Param("id") id: string) {
    return this.service.detalheGestao(id);
  }

  /** Aplica uma ação da gestão (muda status + mensagem na thread + notificação ao solicitante). */
  @Post(":id/acao")
  acao(@Param("id") id: string, @Body() dto: AcaoGestaoDto, @CurrentUser() user: AuthUser) {
    return this.service.aplicarAcao(id, dto.acao, dto.corpo, user);
  }
}
