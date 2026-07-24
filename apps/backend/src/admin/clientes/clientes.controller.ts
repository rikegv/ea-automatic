import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ClientesService } from "./clientes.service";
import { CreateClienteDto, DefinirVinculoDto, UpdateClienteDto } from "./clientes.dto";

/**
 * Catálogo de CLIENTES.
 *
 * RBAC POR OPERAÇÃO, não por controller (OST produção, Blocos 2 e 3). Mesma correção da controller
 * de cargos, pela mesma razão: o `@Roles` na CLASSE cobria o GET, e o consultor COMUM tomava 403 ao
 * abrir a Liberação Admissional, que é a operação diária dele. LER o cadastro de clientes é dado de
 * TRABALHO; ADMINISTRAR (criar, editar, trocar vínculo, inativar, reativar) segue exclusivo de
 * Master / Super Admin, método a método. O `JwtAuthGuard` global continua valendo em tudo.
 *
 * As duas rotas de leitura auxiliares ficam em lados opostos de propósito: `vinculo-opcoes` serve ao
 * select da EDIÇÃO e continua restrita; `dependencias` também, porque só é consultada na inativação.
 */
@Controller("admin/clientes")
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  /** LEITURA: liberada a qualquer autenticado (o consultor precisa na Liberação e no wizard). */
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
