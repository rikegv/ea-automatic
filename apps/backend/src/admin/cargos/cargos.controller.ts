import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { CargosService } from "./cargos.service";
import { CreateCargoDto, UpdateCargoDto } from "./cargos.dto";

@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/cargos")
export class CargosController {
  constructor(private readonly cargos: CargosService) {}

  @Get()
  list() {
    return this.cargos.list();
  }

  @Post()
  create(@Body() dto: CreateCargoDto) {
    return this.cargos.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCargoDto) {
    return this.cargos.update(id, dto);
  }

  /** Reativa o cargo (volta às opções selecionáveis). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.cargos.reativar(id);
  }

  /**
   * INATIVAÇÃO (não é exclusão física — §A.3/§A.6). A rota DELETE é mantida (contrato/RBAC), mas agora
   * apenas seta `ativo=false`, preservando os vínculos. Mesmo padrão da tela de clientes; reversível.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.cargos.inativar(id);
  }
}
