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

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.cargos.remove(id);
  }
}
