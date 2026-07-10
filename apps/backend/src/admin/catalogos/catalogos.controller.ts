import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
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

  // Clientes ativos sem NENHUMA régua cadastrada (item 1). Autenticado, sem restrição de papel.
  @Get("clientes-sem-regua")
  clientesSemRegua() {
    return this.catalogos.listClientesSemRegua();
  }

  // Valores padrão de VR/AM do cliente (item 4) para pré-preencher o wizard.
  @Get("beneficios-padrao-cliente")
  beneficiosPadraoCliente(@Query("codCliente") codCliente?: string) {
    if (!codCliente?.trim()) {
      throw new BadRequestException("codCliente é obrigatório");
    }
    return this.catalogos.getBeneficiosPadraoCliente(codCliente);
  }

  @Get("cargos-por-cliente")
  cargosPorCliente(@Query("codCliente") codCliente?: string) {
    if (!codCliente?.trim()) {
      throw new BadRequestException("codCliente é obrigatório");
    }
    return this.catalogos.listCargosPorCliente(codCliente);
  }

  @Get("regua")
  regua(@Query("codCliente") codCliente?: string, @Query("cargoId") cargoId?: string) {
    if (!codCliente?.trim() || !cargoId?.trim()) {
      throw new BadRequestException("codCliente e cargoId são obrigatórios");
    }
    return this.catalogos.listRegua(codCliente, cargoId);
  }

  // ── Catálogos abertos do wizard (W2/W3/W4) — GET autenticado; POST só Master/Super Admin ──
  @Get("motivos")
  motivos() {
    return this.catalogos.listMotivos();
  }
  @Get("beneficios")
  beneficios() {
    return this.catalogos.listBeneficios();
  }
  @Get("escalas")
  escalas() {
    return this.catalogos.listEscalas();
  }

  @Post("motivos")
  @Roles("MASTER", "SUPER_ADMIN")
  addMotivo(@Body("nome") nome: string) {
    return this.catalogos.addMotivo(nome);
  }
  @Post("beneficios")
  @Roles("MASTER", "SUPER_ADMIN")
  addBeneficio(@Body("nome") nome: string) {
    return this.catalogos.addBeneficio(nome);
  }
  @Post("escalas")
  @Roles("MASTER", "SUPER_ADMIN")
  addEscala(@Body("nome") nome: string) {
    return this.catalogos.addEscala(nome);
  }
}
