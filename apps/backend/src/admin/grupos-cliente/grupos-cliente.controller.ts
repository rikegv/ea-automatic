import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import {
  AtualizarGrupoClienteDto,
  CriarGrupoClienteDto,
  DefinirMembrosDto,
  DefinirMetaCargoDto,
} from "./grupos-cliente.dto";
import { GruposClienteService } from "./grupos-cliente.service";

/**
 * GRUPOS DE CLIENTE (cenário 2, etapa 1).
 *
 * SEM `@Roles`, como todo o cadastro: quem governa é o MENU. As operações de escrita são
 * reivindicadas pelo menu `clientes` (decisão do diretor: quem administra cliente administra grupo),
 * e NÃO por um menu novo, porque o grupo mora dentro da tela de Clientes.
 *
 * A LEITURA fica aberta pelo mesmo motivo dos outros catálogos: a ficha do cliente mostra o grupo, e
 * reivindicar a leitura faria a ficha tomar 403 de quem só consulta.
 */
@Controller("admin/grupos-cliente")
export class GruposClienteController {
  constructor(private readonly grupos: GruposClienteService) {}

  @Get()
  listar() {
    return this.grupos.listar();
  }

  /**
   * DECLARADA ANTES de `@Get(":id")`, porque o Nest casa na ordem de declaração e "clientes" seria
   * lido como um id. Mesmo cuidado das rotas do Alto Volume.
   */
  @Get("clientes")
  catalogoDeClientes() {
    return this.grupos.catalogoDeClientes();
  }

  @Get("do-cliente/:codCliente")
  grupoDoCliente(@Param("codCliente") codCliente: string) {
    return this.grupos.grupoDoCliente(codCliente);
  }

  @Get(":id")
  obter(@Param("id") id: string) {
    return this.grupos.obter(id);
  }

  /**
   * O PAINEL DO GRUPO (Alto Volume por grupo): meta contra o que está na esteira, num total só.
   *
   * SEM `@Roles`, no MESMO regime da leitura de `AltoVolumeController.analisar` e pelo mesmo motivo:
   * a tela é gatada pelo menu `diretoria` no guard de rota, e o retorno é só contagem e o nome/meta
   * do grupo (§A.6, nenhum CPF/candidato/CNPJ). Reivindicar operação aqui faria a tela tomar 403 de
   * quem só consulta, que é o incidente que a régua de leitura aberta já consertou.
   *
   * São dois segmentos (`:id/analise`), então não colide com `@Get(":id")`.
   */
  @Get(":id/analise")
  analise(@Param("id") id: string) {
    return this.grupos.analise(id);
  }

  /**
   * META POR CARGO (ajuste 5). A LEITURA fica aberta no mesmo regime dos outros GETs do cadastro (o
   * livreto de grupos mostra as metas). A ESCRITA é reivindicada pelo menu `clientes`, como o resto
   * do cadastro de grupo (quem administra cliente administra grupo). São dois segmentos
   * (`:id/metas-cargo`), então não colidem com `@Get(":id")` nem com `@Patch(":id")`.
   */
  @Get(":id/metas-cargo")
  listarMetasCargo(@Param("id") id: string) {
    return this.grupos.listarMetasCargo(id);
  }

  @Put(":id/metas-cargo/:cargoId")
  definirMetaCargo(
    @Param("id") id: string,
    @Param("cargoId") cargoId: string,
    @Body() dto: DefinirMetaCargoDto,
  ) {
    return this.grupos.definirMetaCargo(id, cargoId, dto);
  }

  @Post()
  criar(@Body() dto: CriarGrupoClienteDto) {
    return this.grupos.criar(dto);
  }

  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: AtualizarGrupoClienteDto) {
    return this.grupos.atualizar(id, dto);
  }

  /** A prévia é `POST` porque leva a lista no corpo, e não escreve nada. */
  @Post(":id/membros/previa")
  previaMembros(@Param("id") id: string, @Body() dto: DefinirMembrosDto) {
    return this.grupos.previaMembros(id, dto);
  }

  @Post(":id/membros")
  definirMembros(@Param("id") id: string, @Body() dto: DefinirMembrosDto) {
    return this.grupos.definirMembros(id, dto);
  }
}
