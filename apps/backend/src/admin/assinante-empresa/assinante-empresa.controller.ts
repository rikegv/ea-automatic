import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { AssinanteEmpresaService } from "../../clicksign/assinante-empresa.service";
import { SalvarConjuntoDto } from "./assinante-empresa.dto";

/**
 * Cadastro de QUEM ASSINA PELA EMPRESA (INT-4).
 *
 * ACESSO: governado pelo MENU `assinante-empresa`, não por papel. O `@Roles` admin foi removido por
 * decisão do diretor (o COMUM passa a cadastrar os grupos de assinatura). A remoção é OBRIGATÓRIA e
 * não cosmética: o `RolesGuard` roda ANTES do `MenuGuard`, então com ele no lugar o COMUM enxergaria
 * o menu e tomaria 403 em toda operação, que foi o defeito já visto no Gerador de Kit.
 *
 * Modelo PADRÃO + EXCEÇÃO POR CLIENTE, igual à pasta-pai do Drive: um representante fixo assina por
 * todos os contratos e um cliente que exija outro ganha exceção própria.
 *
 * §A.6: a listagem devolve o CPF MASCARADO. O CPF completo nunca sai do backend, nem para a tela.
 */
@Controller("admin/assinante-empresa")
export class AssinanteEmpresaController {
  constructor(private readonly assinantes: AssinanteEmpresaService) {}

  /** Padrão e exceções, com o padrão encabeçando a lista. */
  @Get()
  list() {
    return this.assinantes.listar();
  }

  /**
   * SALVA O CONJUNTO INTEIRO de um escopo de uma vez: padrão (sem `codCliente`) ou o de um cliente.
   * Substituição completa, quem não vem na lista sai. Lista vazia apaga o conjunto.
   *
   * É o único caminho de escrita: cadastrar de um em um foi o que a reformulação da tela eliminou.
   */
  @Put("conjunto")
  salvarConjunto(@Body() dto: SalvarConjuntoDto) {
    return this.assinantes.salvarConjunto(dto.codCliente, dto.itens ?? []);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.assinantes.remover(id);
  }
}
