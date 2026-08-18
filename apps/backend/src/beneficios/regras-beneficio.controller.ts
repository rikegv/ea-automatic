import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { SalvarRegrasBeneficioDto } from "./beneficios-fila.dto";
import { RegrasBeneficioService } from "./regras-beneficio.service";

/**
 * REGRAS DE BENEFÍCIO POR CLIENTE (onda 2). O que o modal "Principais Informações" lê e grava.
 *
 * CONTROLLER PRÓPRIO, e não handlers a mais no da fila (§A.26): o recorte é outro (cliente, e não
 * admissão) e assim nada do que já está validado é editado para esta frente entrar.
 *
 * SEM @Roles: o gate é o MENU (§A.23). As duas operações nascem reivindicadas pelo menu
 * `beneficios-fila`, que é o time que cadastra e consulta a regra. A LEITURA também é reivindicada,
 * e não por acaso: operação não reivindicada fica ABERTA a qualquer autenticado, e esta devolve
 * política comercial do cliente.
 */
@Controller("beneficios-regras")
export class RegrasBeneficioController {
  constructor(private readonly regras: RegrasBeneficioService) {}

  /** As regras do cliente, com os seis grupos sempre presentes (o vazio volta como null). */
  @Get(":codCliente")
  listar(@Param("codCliente") codCliente: string) {
    return this.regras.listar(codCliente);
  }

  /** Grava a lista COMPLETA das regras do cliente. Texto vazio apaga a regra daquele grupo. */
  @Put(":codCliente")
  salvar(@Param("codCliente") codCliente: string, @Body() dto: SalvarRegrasBeneficioDto) {
    return this.regras.salvar(codCliente, dto.regras ?? []);
  }
}
