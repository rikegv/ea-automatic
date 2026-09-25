import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { PortalPedidosAjudaService } from "./portal-pedidos-ajuda.service";

/**
 * OS PEDIDOS DE AJUDA PARA ENTRAR, no Gerenciador do Portal: a fila de quem clicou "Não consigo
 * entrar" e ainda precisa de ação do RH.
 *
 * ══ NÃO NASCE SOB `portal/`, PELO MESMO MOTIVO DA IRMÃ `PortalPainelController` ═════════════════
 *
 * `portal/` é o prefixo que a barreira do Fernando allowlista PARA A INTERNET (é por onde o
 * candidato entra sem sessão). Uma allowlist escrita por PREFIXO exporia ao mundo esta lista, que é
 * NOMINAL (candidato, cargo, cliente). Por isso a controller mora sob `esteira/`, território
 * autenticado, ao lado do Gerenciador do Portal e das rotas de auditoria do mesmo time.
 *
 * ══ REIVINDICADA POR MENU, SENÃO NASCE ABERTA ══════════════════════════════════════════════════
 *
 * Sem `@Roles` (acompanhar o Portal é trabalho de consultor, como emitir o link), quem governa é o
 * MENU. O coringa `PortalPainelController.*` NÃO alcança esta classe: o índice do `MenuGuard` é por
 * `Controller.handler`, então classe nova é operação nova, e operação que nenhum menu reivindica
 * passa LIVRE. Por isso o menu `portal-links` (`domain/menus.ts`) cita `PortalPedidosAjudaController.*`
 * por nome, no mesmo molde de `PortalPainelController.*` e `PortalEnvioController.*`.
 *
 * ══ §A.6, O QUE ESTA RESPOSTA NÃO CARREGA ══════════════════════════════════════════════════════
 *
 * Sem CPF, sem IP, sem `ua_hash`, sem token. O nome, o cargo e o cliente são os mesmos que o
 * Gerenciador do Portal já entrega ao mesmo time.
 */
@Controller("esteira/portal-pedidos-ajuda")
export class PortalPedidosAjudaController {
  constructor(private readonly pedidos: PortalPedidosAjudaService) {}

  /**
   * A lista dos pedidos de ajuda, ordenada pelo último pedido (mais recente primeiro).
   *
   * `Cache-Control: no-store, private`, o mesmo do Gerenciador do Portal e da rota do candidato: a
   * resposta atravessa o proxy do Next, e nem ele nem o disco do navegador guardam o retrato.
   */
  @Get()
  listar(@Res({ passthrough: true }) res: Response) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.pedidos.listar();
  }
}
