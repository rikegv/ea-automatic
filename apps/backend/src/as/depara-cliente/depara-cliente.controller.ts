import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../../auth/auth.types";
import {
  AlternarAtivoDeParaClienteDto,
  ConfirmarDeParaClienteDto,
  FiltroDeParaClienteDto,
} from "./depara-cliente.dto";
import { DeParaClienteService } from "./depara-cliente.service";

/**
 * ─ A CURADORIA DO DE/PARA DE CLIENTE: A SUPERFÍCIE HTTP ────────────────────────────────────────
 *
 * ┌─ QUEM SEGURA ESTAS ROTAS É O MENU, E AS OPERAÇÕES SÃO NOMINAIS ──────────────────────────────┐
 * │ O `MenuGuard` reivindica esta classe pelo menu `depara-cliente-vaga` (`domain/menus`), e ele é │
 * │ FAIL-OPEN para operação NÃO REIVINDICADA: `menuDaOperacao` devolve `null` e o handler fica     │
 * │ alcançável por QUALQUER sessão autenticada, com um `curl`. É o mesmo defeito que o `seguranca` │
 * │ mediu em 30/09 nos sete catálogos de A&S: se um nome de método não bate, a escrita do catálogo │
 * │ fica aberta.                                                                                   │
 * │                                                                                               │
 * │ POR QUE ISSO IMPORTA AQUI: a lista devolve RAZÃO SOCIAL de empresa, e razão social de MEI é    │
 * │ nome de pessoa natural (§A.6). E a confirmação ESCREVE no catálogo que alimenta a proposta de  │
 * │ 312 vagas.                                                                                     │
 * │                                                                                               │
 * │ NOMINAL, NUNCA CURINGA: `Controller.*` faria handler NOVO herdar a concessão sem decisão do    │
 * │ diretor. Renomear um método daqui SEM mudar o menu abre a rota, e nada fica vermelho.          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SEM `@Roles`, E A AUSÊNCIA É A MESMA DECISÃO DA FILA DE DIVERGENCIAS ───────────────────────┐
 * │ O diretor decide, usuário por usuário, quem trabalha esta curadoria (§A.23), e papel no handler │
 * │ entregaria uma PORTA TRANCADA a quem recebesse o menu. O menu nasce visível só para o           │
 * │ SUPER_ADMIN, e quem libera é o diretor: menu novo que não aparece para os demais NÃO é bug.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO EXISTE ROTA DE LOTE, e a ausência é deliberada, pela MESMA razão que a liberação de vaga não
 * tem: confirmar 95 traduções de uma vez é confirmar o palpite da fábrica sem conferir, e um cliente
 * errado confirmado aqui se espalha por todas as vagas daquele código.
 *
 * §A.6: nenhuma rota daqui loga. O que desce é código de vaga, razão social e dois booleanos, atrás
 * do menu.
 */
@Controller("as/depara-cliente")
export class DeParaClienteController {
  constructor(private readonly dePara: DeParaClienteService) {}

  /** A fila de curadoria. O padrão é o que falta CONFIRMAR, que é o trabalho da tela. */
  @Get()
  listar(@Query() dto: FiltroDeParaClienteDto) {
    return this.dePara.listar({ apenasPendentes: dto.apenasPendentes !== "false" });
  }

  /**
   * A SINCRONIZAÇÃO COM A PLANILHA VIVA, sob demanda.
   *
   * ┌─ POR QUE SOB DEMANDA, E NÃO EM CRON, NESTA ENTREGA ───────────────────────────────────────┐
   * │ A cadência é decisão do diretor, e um agendador que nasce ligado passa a ler uma planilha   │
   * │ com dado operacional da empresa de hora em hora sem ninguém ter pedido. A rota existe para a │
   * │ curadoria ser DISPARÁVEL e MEDÍVEL (o resumo é a resposta), e ligar a cadência é um passo    │
   * │ separado, com decisão de quem manda. §A.31: propõe, não entrega em silêncio.                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ELA DEVOLVE O RESUMO, que é só CONTAGEM mais a família da falha: é assim que quem opera
   * distingue "a planilha não cobre estas vagas" de "a leitura parou de funcionar".
   */
  @Post("sincronizar")
  sincronizar() {
    return this.dePara.sincronizar();
  }

  /** Confirmar o vínculo. O AUTOR vem da SESSÃO, nunca do corpo (ver o DTO). */
  @Post(":id/confirmar")
  confirmar(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ConfirmarDeParaClienteDto,
    @Req() req: Request,
  ) {
    return this.dePara.confirmar(id, dto.codCliente, req.user as AuthUser);
  }

  /** Ligar e desligar a tradução. A sincronização NUNCA religa: este é o único caminho de volta. */
  @Post(":id/ativo")
  alternarAtivo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AlternarAtivoDeParaClienteDto,
  ) {
    return this.dePara.alternarAtivo(id, dto.ativo);
  }
}
