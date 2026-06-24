import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { ClientesService } from "./clientes.service";
import { CreateClienteDto, UpdateClienteDto } from "./clientes.dto";

// Administração de cadastros — restrita a Master / Super Admin (§A.3 / escopo OST-1A).
@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/clientes")
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  list() {
    return this.clientes.list();
  }

  @Post()
  create(@Body() dto: CreateClienteDto) {
    return this.clientes.create(dto);
  }

  @Patch(":codCliente")
  update(@Param("codCliente") codCliente: string, @Body() dto: UpdateClienteDto) {
    return this.clientes.update(codCliente, dto);
  }

  @Delete(":codCliente")
  remove(@Param("codCliente") codCliente: string) {
    return this.clientes.remove(codCliente);
  }
}
