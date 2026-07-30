import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { AplicarEmMassaDto, AtualizarItemDto } from "./pendencias-cliente.dto";
import { PendenciasClienteService } from "./pendencias-cliente.service";

/**
 * Obrigatoriedade de pendências POR CLIENTE (OST da tela de obrigatoriedade).
 *
 * RBAC: a classe herda o `@Roles` do módulo de administração, como os demais cadastros. Isto é
 * configuração de régua, não dado de operação: quem administra é Master / Super Admin, e quem
 * enxerga a TELA é decidido pelo diretor na liberação de menu (§A.23).
 */
@Controller("admin/pendencias-cliente")
export class PendenciasClienteController {
  constructor(private readonly pendencias: PendenciasClienteService) {}

  /** Todos os clientes com a configuração de cada um (a tela filtra e seleciona em memória). */
  @Get()
  listar() {
    return this.pendencias.listar();
  }

  @Get(":codCliente")
  obter(@Param("codCliente") codCliente: string) {
    return this.pendencias.obter(codCliente);
  }

  /** Edição INDIVIDUAL (ajuste fino de um cliente). */
  @Patch(":codCliente")
  atualizar(@Param("codCliente") codCliente: string, @Body() body: { itens: AtualizarItemDto[] }) {
    return this.pendencias.atualizar(codCliente, body.itens ?? []);
  }

  /** APLICAÇÃO EM MASSA: a mesma alteração para os N clientes selecionados. */
  @Post("massa")
  aplicarEmMassa(@Body() dto: AplicarEmMassaDto) {
    return this.pendencias.aplicarEmMassa(dto);
  }
}
