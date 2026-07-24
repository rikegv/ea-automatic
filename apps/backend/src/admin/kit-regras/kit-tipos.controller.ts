import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { AtualizarKitTipoDto, CriarKitTipoDto } from "./kit-regras.dto";
import { KitTiposService } from "./kit-tipos.service";

// Kits do Gerador de Kit por tipo de vínculo (OST). Só administração (Master / Super Admin).
@Controller("admin/kit-tipos")
export class KitTiposController {
  constructor(private readonly kits: KitTiposService) {}

  @Get()
  list() {
    return this.kits.list();
  }

  @Post()
  criar(@Body() dto: CriarKitTipoDto) {
    return this.kits.criar(dto);
  }

  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: AtualizarKitTipoDto) {
    return this.kits.atualizar(id, dto);
  }

  @Delete(":id")
  remover(@Param("id") id: string) {
    return this.kits.remover(id);
  }
}
