import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ClinicasService } from "./clinicas.service";
import { CreateClinicaDto, UpdateClinicaDto } from "./clinicas.dto";

/**
 * Catálogo de CLÍNICAS (OST Onda 2, item 4).
 *
 * RBAC POR OPERAÇÃO, igual às controllers de clientes e cargos depois da correção dos Blocos 2 e 3:
 * LER o catálogo é dado de trabalho e fica liberado a qualquer autenticado; ADMINISTRAR (criar,
 * editar, inativar, reativar) é exclusivo de Master / Super Admin, método a método. Nasce assim de
 * propósito, para não repetir o defeito que tirou a Liberação do ar para o perfil Comum.
 */
@Controller("admin/clinicas")
export class ClinicasController {
  constructor(private readonly clinicas: ClinicasService) {}

  /** LEITURA: liberada a qualquer autenticado. */
  @Get()
  list() {
    return this.clinicas.list();
  }

  @Post()
  create(@Body() dto: CreateClinicaDto) {
    return this.clinicas.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateClinicaDto) {
    return this.clinicas.update(id, dto);
  }

  /** Reativa a clínica (volta às opções do agendamento). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.clinicas.reativar(id);
  }

  /**
   * INATIVAÇÃO (exclusão lógica, §A.3/§A.6). A rota DELETE só seta `ativo=false`, preservando o
   * vínculo das admissões que já usam a clínica. Reversível pela reativação.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.clinicas.inativar(id);
  }
}
