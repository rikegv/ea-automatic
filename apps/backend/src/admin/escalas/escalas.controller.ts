import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { EscalasService } from "./escalas.service";
import { CreateEscalaDto, UpdateEscalaDto } from "./escalas.dto";

/**
 * Catálogo de ESCALAS (OST produção, Bloco 4).
 *
 * RBAC POR OPERAÇÃO, igual às controllers de clientes e cargos depois da correção dos Blocos 2 e 3:
 * LER o catálogo é dado de trabalho e fica liberado a qualquer autenticado; ADMINISTRAR (criar,
 * editar, inativar, reativar) é exclusivo de Master / Super Admin, método a método. Nasce assim de
 * propósito, para não repetir o defeito que tirou a Liberação do ar para o perfil Comum.
 */
@Controller("admin/escalas")
export class EscalasController {
  constructor(private readonly escalas: EscalasService) {}

  /** LEITURA: liberada a qualquer autenticado. */
  @Get()
  list() {
    return this.escalas.list();
  }

  @Post()
  create(@Body() dto: CreateEscalaDto) {
    return this.escalas.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateEscalaDto) {
    return this.escalas.update(id, dto);
  }

  /** Reativa a escala (volta às opções selecionáveis). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.escalas.reativar(id);
  }

  /**
   * INATIVAÇÃO (exclusão lógica, §A.3/§A.6). A rota DELETE só seta `ativo=false`, preservando o
   * vínculo das admissões que já usam a escala. Reversível pela reativação.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.escalas.inativar(id);
  }
}
