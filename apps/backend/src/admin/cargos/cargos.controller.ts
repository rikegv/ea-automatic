import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CargosService } from "./cargos.service";
import { CreateCargoDto, UpdateCargoDto } from "./cargos.dto";

/**
 * Catálogo de CARGOS.
 *
 * RBAC POR OPERAÇÃO, não por controller (OST produção, Blocos 2 e 3). O `@Roles` estava na CLASSE,
 * então cobria também o GET da listagem, e o consultor COMUM tomava 403 ao abrir a Liberação
 * Admissional, tela que é a operação diária dele. A régua correta separa duas coisas que não são a
 * mesma: LER o catálogo é dado de TRABALHO (qualquer autenticado precisa, para escolher o cargo da
 * admissão); ADMINISTRAR o catálogo (criar, editar, inativar, reativar) continua exclusivo de
 * Master / Super Admin, método a método.
 *
 * O `JwtAuthGuard` global continua valendo: "aberto para leitura" significa aberto para usuário
 * AUTENTICADO, nunca público.
 */
@Controller("admin/cargos")
export class CargosController {
  constructor(private readonly cargos: CargosService) {}

  /** LEITURA: liberada a qualquer autenticado (o consultor precisa na Liberação e no wizard). */
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

  /** Reativa o cargo (volta às opções selecionáveis). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.cargos.reativar(id);
  }

  /**
   * INATIVAÇÃO (não é exclusão física — §A.3/§A.6). A rota DELETE é mantida (contrato/RBAC), mas agora
   * apenas seta `ativo=false`, preservando os vínculos. Mesmo padrão da tela de clientes; reversível.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.cargos.inativar(id);
  }
}
