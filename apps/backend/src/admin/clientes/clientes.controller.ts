import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ClientesService } from "./clientes.service";
import { CreateClienteDto, DefinirVinculoDto, UpdateClienteDto } from "./clientes.dto";
import { Roles } from "../../auth/decorators";

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

  /**
   * ─ OS COMERCIAIS, PARA O SELETOR DA EDIÇÃO DO CLIENTE (Onda E) ───────────────────────────────
   *
   * ┌─ QUEM FECHA ESTA ROTA É O MENU `clientes`, REIVINDICADO **NOMINALMENTE** (§A.6) ───────────┐
   * │ A lista é de NOMES DE PESSOA (o time comercial), e por isso NÃO existe um `GET             │
   * │ /as/comerciais` aberto: os catálogos irmãos têm leitura aberta porque a lista deles é       │
   * │ inócua, esta não é. Uma rota nova sem guarda aqui seria a mesma porta com outro nome, e é   │
   * │ o que aconteceria SOZINHO: handler que menu nenhum reivindica é ABERTO por construção       │
   * │ (`menu.guard.ts`: "operação aberta (não reivindicada por menu)" devolve `true`).            │
   * │                                                                                             │
   * │ POR ISSO `"ClientesController.comerciais"` ESTÁ ESCRITO, COM ESTE NOME, nas `operacoes` do  │
   * │ menu `clientes` em `domain/menus.ts`. E por isso NÃO serve um coringa `ClientesController.*`│
   * │ ali: o `list` desta mesma controller fica FORA da reivindicação de propósito (o consultor   │
   * │ precisa da lista de clientes na Liberação e no wizard), e o coringa o fecharia junto.       │
   * │                                                                                             │
   * │ RENOMEAR ESTE HANDLER SEM MEXER NO MENU REABRE A ROTA, em silêncio. O nome do método é      │
   * │ parte da autorização, não detalhe de estilo.                                                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `?incluirInativos=1` traz quem saiu da empresa, e é o que impede o seletor de perder o vínculo
   * já guardado (ver o service). O padrão, sem o parâmetro, devolve só quem está ativo.
   */
  @Get("comerciais")
  comerciais(@Query("incluirInativos") incluirInativos?: string) {
    return this.clientes.comerciais(incluirInativos === "1" || incluirInativos === "true");
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

  /** Vínculos (contratos) do cliente. Item 7: um cliente pode operar mais de um tipo. */
  @Get(":codCliente/vinculos")
  listarVinculos(@Param("codCliente") codCliente: string) {
    return this.clientes.listarVinculos(codCliente);
  }

  /** Remove um vínculo. As admissões dele voltam a resolver pela config do cliente. */
  @Delete(":codCliente/vinculos/:vinculoId")
  @Roles("MASTER", "SUPER_ADMIN")
  removerVinculo(
    @Param("codCliente") codCliente: string,
    @Param("vinculoId") vinculoId: string,
  ) {
    return this.clientes.removerVinculo(codCliente, vinculoId);
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
