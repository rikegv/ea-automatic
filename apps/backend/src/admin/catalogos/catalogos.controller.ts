import { Controller, Get } from "@nestjs/common";
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
}
