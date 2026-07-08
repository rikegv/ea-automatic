import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { ClientesService } from "./clientes.service";
import { CreateClienteDto, DefinirVinculoDto, UpdateClienteDto } from "./clientes.dto";

// Administração de cadastros — restrita a Master / Super Admin (§A.3 / escopo OST-1A).
@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/clientes")
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  list() {
    return this.clientes.list();
  }

  /** Opções válidas de vínculo (empresa Soulan/tipo) para o select da edição. Rota estática. */
  @Get("vinculo-opcoes")
  opcoesVinculo() {
    return this.clientes.opcoesVinculo();
  }

  @Post()
  create(@Body() dto: CreateClienteDto) {
    return this.clientes.create(dto);
  }

  @Patch(":codCliente")
  update(@Param("codCliente") codCliente: string, @Body() dto: UpdateClienteDto) {
    return this.clientes.update(codCliente, dto);
  }

  /** TROCA a empresa Soulan/tipo (vínculo) do cliente para uma opção do catálogo. */
  @Patch(":codCliente/vinculo")
  definirVinculo(@Param("codCliente") codCliente: string, @Body() dto: DefinirVinculoDto) {
    return this.clientes.definirVinculo(codCliente, dto.opcaoId);
  }

  /** Prévia das dependências (admissões em andamento) — usada para AVISAR antes de inativar. */
  @Get(":codCliente/dependencias")
  dependencias(@Param("codCliente") codCliente: string) {
    return this.clientes.dependenciasAtivas(codCliente);
  }

  /** Reativa o cliente (volta às seleções). */
  @Patch(":codCliente/reativar")
  reativar(@Param("codCliente") codCliente: string) {
    return this.clientes.reativar(codCliente);
  }

  /**
   * INATIVAÇÃO (não é exclusão física — §A.3/§A.6). A rota DELETE é mantida (contrato/RBAC), mas agora
   * apenas seta `ativo=false` e devolve as admissões em andamento afetadas para o cliente avisar. O
   * histórico é preservado; reversível via `reativar`.
   */
  @Delete(":codCliente")
  remove(@Param("codCliente") codCliente: string) {
    return this.clientes.inativar(codCliente);
  }
}
