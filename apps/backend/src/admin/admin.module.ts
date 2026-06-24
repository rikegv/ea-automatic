import { Module } from "@nestjs/common";
import { CargosController } from "./cargos/cargos.controller";
import { CargosService } from "./cargos/cargos.service";
import { CatalogosController } from "./catalogos/catalogos.controller";
import { CatalogosService } from "./catalogos/catalogos.service";
import { ClientesController } from "./clientes/clientes.controller";
import { ClientesService } from "./clientes/clientes.service";
import { ReguaController } from "./regua/regua.controller";
import { ReguaService } from "./regua/regua.service";

@Module({
  controllers: [ClientesController, CargosController, ReguaController, CatalogosController],
  providers: [ClientesService, CargosService, ReguaService, CatalogosService],
})
export class AdminModule {}
