import { Module } from "@nestjs/common";
import { CargosController } from "./cargos/cargos.controller";
import { CargosService } from "./cargos/cargos.service";
import { CatalogosController } from "./catalogos/catalogos.controller";
import { CatalogosService } from "./catalogos/catalogos.service";
import { ClientesController } from "./clientes/clientes.controller";
import { ClientesService } from "./clientes/clientes.service";
import { KitRegrasController } from "./kit-regras/kit-regras.controller";
import { KitRegrasService } from "./kit-regras/kit-regras.service";
import { KitTiposController } from "./kit-regras/kit-tipos.controller";
import { KitTiposService } from "./kit-regras/kit-tipos.service";
import { MotivosDeclinioController } from "./motivos-declinio/motivos-declinio.controller";
import { MotivosDeclinioService } from "./motivos-declinio/motivos-declinio.service";
import { RegrasController } from "./regras/regras.controller";
import { RegrasService } from "./regras/regras.service";
import { ReguaController } from "./regua/regua.controller";
import { ReguaService } from "./regua/regua.service";

@Module({
  controllers: [
    ClientesController,
    CargosController,
    MotivosDeclinioController,
    ReguaController,
    CatalogosController,
    RegrasController,
    KitTiposController,
    KitRegrasController,
  ],
  providers: [
    ClientesService,
    CargosService,
    MotivosDeclinioService,
    ReguaService,
    CatalogosService,
    RegrasService,
    KitTiposService,
    KitRegrasService,
  ],
})
export class AdminModule {}
