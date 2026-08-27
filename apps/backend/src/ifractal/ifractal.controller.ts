import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { IfractalStatusService } from "./ifractal-status.service";
import { IfractalGestaoService } from "./ifractal-gestao.service";
import {
  CriarStatusIfractalDto,
  EditarClienteIfractalDto,
  RenomearStatusIfractalDto,
} from "./ifractal.dto";

/**
 * MENU GERENCIAL DO IFRACTAL. Duas coisas numa tela só, que é o que o diretor pediu:
 *   1. a visão de gestão das admissões (todas, com status, tipo de marcação e credencial);
 *   2. o gerenciamento da LISTA de status (renomear, acrescentar, marcar qual conclui).
 *
 * §A.23: o menu nasce visível SÓ para o SUPER_ADMIN. A fábrica registra no catálogo e para aí; quem
 * enxerga é decisão do diretor, na tela de liberação de menu por usuário.
 */
@Controller("ifractal")
export class IfractalController {
  constructor(
    private readonly status: IfractalStatusService,
    private readonly gestao: IfractalGestaoService,
  ) {}

  /**
   * A GESTÃO: os clientes e o tipo de marcação de cada um.
   *
   * NÃO lista admissões, e isso é a correção do desenho: aquilo é a ABA DA ESTEIRA, e repeti-la
   * aqui criava duas telas com o mesmo conteúdo (decisão do diretor ao validar).
   */
  @Get("clientes")
  listarClientes() {
    return this.gestao.listarClientes();
  }

  /** Edita o cliente pelo lápis da linha: tipo de marcação e situação. */
  @Patch("clientes/:codCliente")
  editarCliente(@Param("codCliente") codCliente: string, @Body() dto: EditarClienteIfractalDto) {
    return this.gestao.editarCliente(codCliente, dto);
  }

  @Get("status")
  listarStatus() {
    return this.status.listar();
  }

  @Post("status")
  criarStatus(@Body() dto: CriarStatusIfractalDto) {
    return this.status.criar(dto);
  }

  @Patch("status/:id")
  renomearStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: RenomearStatusIfractalDto) {
    return this.status.renomear(id, dto);
  }

  /** Marca QUAL status conclui a frente. Exclusivo: marcar um desmarca os demais. */
  @Patch("status/:id/concluinte")
  definirConcluinte(@Param("id", ParseIntPipe) id: number) {
    return this.status.definirConcluinte(id);
  }

  @Delete("status/:id")
  removerStatus(@Param("id", ParseIntPipe) id: number) {
    return this.status.remover(id);
  }
}
