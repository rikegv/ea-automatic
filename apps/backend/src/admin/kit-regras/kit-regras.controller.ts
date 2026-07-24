import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { AtualizarKitRegraDto, CriarKitRegraDto, ReordenarKitRegraDto } from "./kit-regras.dto";
import { KitRegrasService } from "./kit-regras.service";

// Documentos de um kit (OST). Só administração (Master / Super Admin).
@Controller("admin/kit-regras")
export class KitRegrasController {
  constructor(private readonly regras: KitRegrasService) {}

  @Get()
  list(@Query("kitTipoId") kitTipoId: string) {
    return this.regras.list(kitTipoId);
  }

  @Post()
  criar(@Body() dto: CriarKitRegraDto) {
    return this.regras.criar(dto);
  }

  // Reordenar (drag-and-drop) vem antes de :id para não colidir com a rota paramétrica.
  @Put("ordem")
  reordenar(@Body() dto: ReordenarKitRegraDto) {
    return this.regras.reordenar(dto.ids);
  }

  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: AtualizarKitRegraDto) {
    return this.regras.atualizar(id, dto);
  }

  @Delete(":id")
  remover(@Param("id") id: string) {
    return this.regras.remover(id);
  }
}
