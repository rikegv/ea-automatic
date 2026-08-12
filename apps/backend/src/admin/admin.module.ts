import { Module } from "@nestjs/common";
import { AssinanteEmpresaModule } from "../clicksign/assinante-empresa.module";
import { AltoVolumeController } from "./alto-volume/alto-volume.controller";
import { AltoVolumeService } from "./alto-volume/alto-volume.service";
import { AltoVolumeVinculosService } from "./alto-volume/alto-volume-vinculos.service";
import { AltoVolumeAnaliseService } from "./alto-volume/alto-volume-analise.service";
import { AssinanteEmpresaController } from "./assinante-empresa/assinante-empresa.controller";
import { BeneficiosController } from "./beneficios/beneficios.controller";
import { BeneficiosService } from "./beneficios/beneficios.service";
import { CargosController } from "./cargos/cargos.controller";
import { CargosService } from "./cargos/cargos.service";
import { CatalogosController } from "./catalogos/catalogos.controller";
import { CatalogosService } from "./catalogos/catalogos.service";
import { ClientesController } from "./clientes/clientes.controller";
import { ClientesService } from "./clientes/clientes.service";
import { ClinicasController } from "./clinicas/clinicas.controller";
import { IntegracaoClientesController } from "./integracao-clientes/integracao-clientes.controller";
import { IntegracaoClientesService } from "./integracao-clientes/integracao-clientes.service";
import { PendenciasClienteController } from "./pendencias-cliente/pendencias-cliente.controller";
import { PendenciasClienteService } from "./pendencias-cliente/pendencias-cliente.service";
import { ClinicasService } from "./clinicas/clinicas.service";
import { EscalasController } from "./escalas/escalas.controller";
import { EscalasService } from "./escalas/escalas.service";
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
import { TarifasController } from "./tarifas/tarifas.controller";
import { TarifasService } from "./tarifas/tarifas.service";
import { TiposDocumentoController } from "./tipos-documento/tipos-documento.controller";
import { TiposDocumentoService } from "./tipos-documento/tipos-documento.service";

@Module({
  // O AssinanteEmpresaModule traz o service da tela de "quem assina pela empresa" (INT-4); o
  // mesmo service é consumido pelo ClicksignModule ao montar o envelope.
  imports: [AssinanteEmpresaModule],
  controllers: [
    AltoVolumeController,
    AssinanteEmpresaController,
    ClientesController,
    CargosController,
    MotivosDeclinioController,
    ClinicasController,
    IntegracaoClientesController,
    PendenciasClienteController,
    EscalasController,
    BeneficiosController,
    TarifasController,
    ReguaController,
    TiposDocumentoController,
    CatalogosController,
    RegrasController,
    KitTiposController,
    KitRegrasController,
  ],
  providers: [
    AltoVolumeService,
    AltoVolumeVinculosService,
    AltoVolumeAnaliseService,
    ClientesService,
    CargosService,
    MotivosDeclinioService,
    ClinicasService,
    IntegracaoClientesService,
    PendenciasClienteService,
    EscalasService,
    BeneficiosService,
    TarifasService,
    ReguaService,
    TiposDocumentoService,
    CatalogosService,
    RegrasService,
    KitTiposService,
    KitRegrasService,
  ],
})
export class AdminModule {}
