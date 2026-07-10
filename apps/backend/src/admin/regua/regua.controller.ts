import { Body, Controller, Delete, Get, Put, Query } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { ReguaService } from "./regua.service";
import { UpsertReguaDto } from "./regua.dto";

@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/regua")
export class ReguaController {
  constructor(private readonly regua: ReguaService) {}

  @Get()
  list(@Query("codCliente") codCliente: string, @Query("cargoId") cargoId: string) {
    return this.regua.list(codCliente, cargoId);
  }

  @Put()
  upsert(@Body() dto: UpsertReguaDto) {
    return this.regua.upsert(dto);
  }

  @Delete()
  remove(
    @Query("codCliente") codCliente: string,
    @Query("cargoId") cargoId: string,
    @Query("tipoDocumentoId") tipoDocumentoId: string,
  ) {
    return this.regua.remove(codCliente, cargoId, tipoDocumentoId);
  }

  // Inativa toda a régua de um cliente (§A.12, painel "Com régua"): devolve o cliente à lista sem régua.
  @Delete("cliente")
  removeCliente(@Query("codCliente") codCliente: string) {
    return this.regua.removeCliente(codCliente);
  }
}
