import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { BeneficiosService } from "./beneficios.service";
import { CreateBeneficioDto, UpdateBeneficioDto } from "./beneficios.dto";

/**
 * Catálogo de BENEFÍCIOS (OST cadastro de benefícios por tela).
 *
 * RBAC POR OPERAÇÃO, igual às controllers de escalas, cargos e clientes: LER o catálogo é dado de
 * trabalho e fica liberado a qualquer autenticado; ADMINISTRAR (criar, editar, inativar, reativar) é
 * governado pelo MENU `beneficios` (grupo ADMIN, fora do padrão do COMUM), com bypass de
 * MASTER / SUPER_ADMIN no guard. NÃO há `@Roles` em classe nem em método aqui, de propósito: foi
 * exatamente isso que tirou a Liberação do ar para o perfil Comum, e a regressão está travada em
 * `admin/rbac-catalogos.spec.ts`.
 */
@Controller("admin/beneficios")
export class BeneficiosController {
  constructor(private readonly beneficios: BeneficiosService) {}

  /** LEITURA: liberada a qualquer autenticado. */
  @Get()
  list() {
    return this.beneficios.list();
  }

  @Post()
  create(@Body() dto: CreateBeneficioDto) {
    return this.beneficios.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBeneficioDto) {
    return this.beneficios.update(id, dto);
  }

  /** Reativa o benefício (volta às opções selecionáveis). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.beneficios.reativar(id);
  }

  /**
   * INATIVAÇÃO (exclusão lógica, §A.3/§A.6). A rota DELETE só seta `ativo=false`, preservando a
   * alocação das admissões que já usam o benefício. Reversível pela reativação.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.beneficios.inativar(id);
  }
}
