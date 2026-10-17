import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { NotificacoesService } from "./notificacoes.service";

/**
 * NOTIFICAÇÕES NA PLATAFORMA (OST Central de Solicitações). Vale para QUALQUER usuário autenticado, e
 * por isso NÃO é menu-gated: nenhum menu reivindica `NotificacoesController.*`, então o `MenuGuard`
 * deixa estas operações ABERTAS (regra 4 do guard, "operação não reivindicada por menu passa"). O
 * `JwtAuthGuard` global continua exigindo sessão, e cada rota só enxerga as notificações do próprio
 * usuário.
 */
@Controller("notificacoes")
export class NotificacoesController {
  constructor(private readonly service: NotificacoesService) {}

  /** As notificações pendentes (sem ciência) do usuário. */
  @Get("pendentes")
  pendentes(@CurrentUser() user: AuthUser) {
    return this.service.pendentes(user);
  }

  /** Quantas pendentes o usuário tem (badge do sininho). */
  @Get("contagem")
  contagem(@CurrentUser() user: AuthUser) {
    return this.service.contagem(user);
  }

  /** Dá ciência ("Estou Ciente") numa notificação do próprio usuário. */
  @Post(":id/ciente")
  ciente(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.marcarCiente(id, user);
  }
}
