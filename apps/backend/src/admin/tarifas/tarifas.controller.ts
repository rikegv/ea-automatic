import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { TarifasService } from "./tarifas.service";
import { CreateTarifaDto, UpdateTarifaDto } from "./tarifas.dto";

// Gestão das tarifas de transporte (fundação do VT Online, §A.17). Só administração (§A.6):
// consultor não acessa rotas de cadastro.
@Controller("admin/tarifas")
export class TarifasController {
  constructor(private readonly tarifas: TarifasService) {}

  @Get()
  list() {
    return this.tarifas.list();
  }

  @Post()
  create(@Body() dto: CreateTarifaDto) {
    return this.tarifas.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTarifaDto) {
    return this.tarifas.update(id, dto);
  }

  /** Reativa a tarifa (volta a ser sugerida no formulário de VT). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.tarifas.reativar(id);
  }

  /**
   * INATIVAÇÃO (não é exclusão física, §A.3/§A.6). A rota DELETE só seta `ativo=false`, preservando
   * o histórico de quem já usou a tarifa. Reversível pela reativação.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.tarifas.inativar(id);
  }
}
