import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { CurrentUser, Roles } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosService } from "./candidatos.service";
import {
  AlocarEmVagaDto,
  BuscarCandidatosDto,
  CriarCandidatoDto,
  EditarCandidatoDto,
  MoverEtapaDto,
  RegistrarContatoDto,
  RegistrarSaidaDto,
  TrocarVagaDto,
} from "./candidatos.dto";

/**
 * CENTRAL DE CANDIDATOS (A&S, onda 1).
 *
 * RBAC: a controller INTEIRA é reivindicada pelo menu `as-candidatos` (`domain/menus`), LEITURA
 * INCLUÍDA, exatamente como a `VagasController`. É escolha diferente da dos catálogos da Admissão,
 * onde a leitura fica aberta, e o motivo aqui é mais forte do que lá: enquanto o menu existir só
 * para o SUPER_ADMIN (§A.23), este módulo precisa ser invisível E inerte, inclusive pela URL da API,
 * e o que ele guarda é dado pessoal de quem ainda não é funcionário.
 *
 * TUDO NUMA CONTROLLER SÓ, incluindo as rotas de candidatura e de contato, e isso é deliberado:
 * duas controllers seriam duas reivindicações de menu, e um menu que reivindica uma e esquece a
 * outra deixa metade do módulo alcançável por quem não deveria. Uma superfície, uma reivindicação.
 *
 * §A.6, A REGRA QUE MOLDA O DESENHO DAS ROTAS: NÃO EXISTE GET DE LISTAGEM AQUI. A busca é
 * `POST /buscar`, porque o CPF tem de viajar no CORPO: query string aparece em log de proxy, em
 * histórico de navegador e no cabeçalho `Referer`. Não havendo listagem GET, não sobra a porta em
 * que alguém acrescentaria `?cpf=` sem pensar.
 *
 * ORDEM DAS ROTAS: as de caminho fixo (`buscar`, `candidaturas/...`) vêm ANTES das de parâmetro
 * (`:id`), senão o Nest casaria "candidaturas" como se fosse um id de candidato. O `ParseUUIDPipe`
 * é a segunda trava do mesmo problema.
 */
@Controller("as/candidatos")
export class CandidatosController {
  constructor(private readonly candidatos: CandidatosService) {}

  // ── A PESSOA ──────────────────────────────────────────────────────────────

  /** Quem cadastrou vem da SESSÃO, nunca do corpo: é trilha, não campo de formulário. */
  @Post()
  criar(@Body() dto: CriarCandidatoDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.criar(dto, user.id);
  }

  /**
   * BUSCAR/LISTAR. POST, e não GET, por causa do CPF no corpo (§A.6). `HttpCode(200)` porque é uma
   * consulta: devolver 201 faria uma leitura parecer criação para qualquer coisa que leia o status.
   */
  @Post("buscar")
  @HttpCode(200)
  buscar(@Body() dto: BuscarCandidatosDto) {
    return this.candidatos.buscar(dto);
  }

  // ── A CANDIDATURA (caminhos fixos, declarados antes do `:id`) ─────────────

  /** O painel de uma vaga: a ocupação DERIVADA mais quem está nela. */
  @Get("vaga/:vagaId")
  painelVaga(@Param("vagaId", ParseUUIDPipe) vagaId: string) {
    return this.candidatos.painelVaga(vagaId);
  }

  /** Mover de etapa no funil. Não muda a situação: quem chega na Aprovação segue Em Seleção. */
  @Patch("candidaturas/:id/etapa")
  moverEtapa(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MoverEtapaDto,
    @CurrentUser() user: AuthUser,
  ) {
    // QUEM MOVEU vai para o histórico de etapas. Uma linha do tempo sem autor responde "por onde a
    // pessoa passou" e não responde "quem decidiu", que é metade do valor de uma trilha.
    return this.candidatos.moverEtapa(id, dto, user.id);
  }

  /**
   * APROVAR: a operação que consome posição. Corpo vazio de propósito, aprovar não tem parâmetro.
   * É aqui que as travas 1 e 4 atuam, dentro da transação e com a linha da vaga travada.
   */
  @Post("candidaturas/:id/aprovar")
  aprovar(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.candidatos.aprovar(id, user.id);
  }

  /** Registrar saída de QUALQUER etapa: descarte, desistência ou contratação. */
  @Post("candidaturas/:id/saida")
  registrarSaida(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RegistrarSaidaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.registrarSaida(id, dto, user.id);
  }

  /**
   * TROCAR A VAGA da candidatura (item 5 do diretor): corrige a alocação errada MANTENDO a linha e a
   * etapa. Distinta do "Trazer De Volta", que cria processo novo e é de qualquer consultor.
   *
   * `@Roles` É A AUTORIDADE, e é aqui que a restrição vale. Esconder a ação na tela é conveniência:
   * um consultor comum que chame esta rota direto recebe 403 do `RolesGuard`, e é o guard, não a
   * interface, que garante a regra.
   *
   * PATCH e não POST: a candidatura já existe e uma propriedade dela muda. POST diria que algo nasce,
   * e nascer é justamente o que esta operação NÃO faz, ao contrário do "Trazer De Volta".
   */
  @Patch("candidaturas/:id/vaga")
  @Roles("MASTER", "SUPER_ADMIN")
  trocarVaga(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TrocarVagaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.trocarVaga(id, dto, user.id);
  }

  /**
   * A LINHA DO TEMPO DE ETAPAS da candidatura (peça P3 do bug 1): por onde a pessoa passou.
   *
   * ROTA DE LEITURA PRÓPRIA, e não um campo do item da listagem, pelo mesmo motivo que os contatos:
   * a listagem carrega o conjunto inteiro sem paginação, e pendurar N eventos em cada linha faria a
   * tela baixar o histórico de todo mundo para mostrar o de um. A ficha pede o de quem ela abriu.
   */
  @Get("candidaturas/:id/etapas")
  listarHistoricoEtapas(@Param("id", ParseUUIDPipe) id: string) {
    return this.candidatos.listarHistoricoEtapas(id);
  }

  /** Registrar contato. Quem registrou vem da sessão. */
  @Post("candidaturas/:id/contatos")
  registrarContato(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RegistrarContatoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.registrarContato(id, dto, user.id);
  }

  /** O histórico da candidatura, na ordem em que os fatos aconteceram. */
  @Get("candidaturas/:id/contatos")
  listarContatos(@Param("id", ParseUUIDPipe) id: string) {
    return this.candidatos.listarContatos(id);
  }

  // ── ROTAS COM `:id` DE CANDIDATO (por último) ─────────────────────────────

  /** A FICHA: o único lugar em que o CPF e os dados de contato saem do backend (§A.6). */
  @Get(":id")
  ficha(@Param("id", ParseUUIDPipe) id: string) {
    return this.candidatos.ficha(id);
  }

  @Patch(":id")
  editar(@Param("id", ParseUUIDPipe) id: string, @Body() dto: EditarCandidatoDto) {
    return this.candidatos.editar(id, dto);
  }

  /**
   * Alocar a pessoa numa vaga. Travas 2 (vaga fechada) e 3 (duplicata VIVA) atuam aqui.
   *
   * QUEM JÁ TEVE CANDIDATURA ENCERRADA NESTA VAGA é recusado na primeira tentativa, com um 409 que
   * traz a data e o motivo do processo anterior, e passa quando o corpo volta com `cienteReentrada`.
   */
  @Post(":id/candidaturas")
  alocar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AlocarEmVagaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.alocar(id, dto, user.id);
  }
}
