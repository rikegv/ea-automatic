import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CreateRegraDto, UpdateRegraDto } from "./regras.dto";
import { RegrasService } from "./regras.service";

@Controller("admin/regras")
export class RegrasController {
  constructor(private readonly regras: RegrasService) {}

  @Get()
  list(@Query("tipoDocumentoId") tipoDocumentoId?: string) {
    return this.regras.list(tipoDocumentoId);
  }

  @Post()
  create(@Body() dto: CreateRegraDto) {
    return this.regras.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRegraDto) {
    return this.regras.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.regras.remove(id);
  }
}
