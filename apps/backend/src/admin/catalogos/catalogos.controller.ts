import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { CatalogosService } from "./catalogos.service";

// Referência (tipos de documento, status por frente). Autenticado, sem restrição de papel:
// a esteira é coletiva (§A.3) e essas listas alimentam telas de todos os consultores.
@Controller("catalogos")
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  @Get("tipos-documento")
  tiposDocumento() {
    return this.catalogos.listTiposDocumento();
  }

  @Get("frente-status")
  frenteStatus() {
    return this.catalogos.listFrenteStatus();
  }

  // Leituras operacionais do wizard (F6) — autenticadas, sem restrição de papel.
  @Get("clientes")
  clientes(@Query("q") q?: string) {
    return this.catalogos.listClientes(q);
  }

  @Get("cargos")
  cargos() {
    return this.catalogos.listCargos();
  }

  @Get("regua")
  regua(@Query("codCliente") codCliente?: string, @Query("cargoId") cargoId?: string) {
    if (!codCliente?.trim() || !cargoId?.trim()) {
      throw new BadRequestException("codCliente e cargoId são obrigatórios");
    }
    return this.catalogos.listRegua(codCliente, cargoId);
  }
}
