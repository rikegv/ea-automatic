import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { CurrentUser, Roles } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosService } from "./candidatos.service";
import {
  AdicionarEmLoteDto,
  AlocarEmVagaDto,
  BuscarCandidatosDto,
  CriarCandidatoDto,
  EditarCandidatoDto,
  FinalizarPosicaoDto,
  FinalizarPosicaoEmLoteDto,
  MoverEtapaDto,
  MoverEtapaEmLoteDto,
  RegistrarContatoDto,
  RegistrarSaidaDto,
  RegistrarSaidaEmLoteDto,
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

  // ── AS AÇÕES EM MASSA (grupo 1) ───────────────────────────────────────────

  /**
   * ─ AS QUATRO ROTAS EM MASSA MORAM NESTA CONTROLLER, e isso é RBAC, não organização ────────────
   *
   * ┌─ POR QUE NÃO NASCEU UMA CONTROLLER NOVA "PARA NÃO INCHAR O ARQUIVO" ───────────────────────┐
   * │ O `MenuGuard` resolve o coringa PELO NOME DA CLASSE: o menu `as-candidatos` reivindica      │
   * │ `"CandidatosController.*"` (`domain/menus`), e OPERAÇÃO NÃO REIVINDICADA PASSA. Uma segunda │
   * │ classe, portanto, não nasceria protegida: ela nasceria ABERTA a qualquer usuário logado, e  │
   * │ o que ela oferece é ESCRITA EM MASSA sobre dado pessoal de quem ainda não é funcionário.    │
   * │ Nada falharia, nenhum teste ficaria vermelho, e a porta estaria aberta.                     │
   * │                                                                                             │
   * │ Se um dia uma classe nova for inevitável, ela TEM de entrar nas `operacoes` do menu no       │
   * │ MESMO commit. Enquanto isso: uma superfície, uma reivindicação, como o cabeçalho já dizia.  │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OS CAMINHOS `candidaturas/lote/...` VÊM ANTES DE `candidaturas/:id/...`, e o prefixo fixo `lote`
   * é de propósito: o Nest casa na ordem de declaração, e sem o prefixo próprio um POST em massa
   * bateria na rota de parâmetro com o id valendo "lote".
   *
   * SEM `@Roles`: são as mesmas operações que o consultor já faz uma a uma. A troca de vaga, que é de
   * Master, NÃO tem versão em massa aqui, e é por isso que "mover no funil em massa" é `moverEtapa` e
   * só ela: incluir a troca abriria um caminho de COMUM para uma ação que o `@Roles` protege.
   */

  /**
   * ADICIONAR CANDIDATOS À VAGA EM MASSA. A VAGA VEM DA ROTA: o lote é sempre de uma vaga só.
   * Vaga encerrada recusa o pedido INTEIRO; o resto é lote parcial, com as falhas por linha.
   */
  @Post("vaga/:vagaId/candidaturas/lote")
  adicionarEmLote(
    @Param("vagaId", ParseUUIDPipe) vagaId: string,
    @Body() dto: AdicionarEmLoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.adicionarEmLote(vagaId, dto, user);
  }

  /** FINALIZAR POSIÇÃO EM MASSA: N entregas, uma transação travada por linha. */
  @Post("candidaturas/lote/finalizar-posicao")
  finalizarPosicaoEmLote(@Body() dto: FinalizarPosicaoEmLoteDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.finalizarPosicaoEmLote(dto, user.id);
  }

  /** DESVINCULAR (e ENVIAR PARA ADMISSÃO) EM MASSA. O motivo é obrigatório, como no individual. */
  @Post("candidaturas/lote/saida")
  registrarSaidaEmLote(@Body() dto: RegistrarSaidaEmLoteDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.registrarSaidaEmLote(dto, user.id);
  }

  /** MOVER NO FUNIL EM MASSA. PATCH, como a rota individual: é a mesma propriedade que muda. */
  @Patch("candidaturas/lote/etapa")
  moverEtapaEmLote(@Body() dto: MoverEtapaEmLoteDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.moverEtapaEmLote(dto, user.id);
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

  /**
   * FINALIZAR POSIÇÃO: a posição da vaga é entregue e a candidatura vira `ALOCADO`.
   *
   * ROTA PRÓPRIA, e não a de saída com `situacao: "ALOCADO"`, porque ALOCAR NÃO É SAIR: o candidato
   * continua no funil. O `@IsIn` do `RegistrarSaidaDto` recusa `ALOCADO` de propósito, e é bom que
   * recuse: por lá a operação ainda exigiria um motivo que ela não tem o que dizer.
   *
   * POST como a aprovação, e não PATCH: as duas registram um FATO novo do processo (a posição foi
   * entregue), e não a edição de uma propriedade da candidatura. A troca de vaga é que é PATCH,
   * porque lá o que muda é um campo de algo que já existe.
   *
   * DE QUALQUER CONSULTOR, sem `@Roles`: entregar posição é a operação normal de quem opera a vaga,
   * e é a mesma régua da aprovação, que também não tem papel exigido. Quem restringe o módulo
   * inteiro é o menu `as-candidatos` no `MenuGuard`.
   */
  @Post("candidaturas/:id/finalizar-posicao")
  finalizarPosicao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FinalizarPosicaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.finalizarPosicao(id, dto, user.id);
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
   * REVERTER O ENVIO PARA A ADMISSÃO: desfaz o envio recente e devolve a pessoa à seleção, na etapa
   * em que ela estava. A posição que ela ocupava volta a ficar livre.
   *
   * ┌─ DENTRO DESTA CONTROLLER, e isso é RBAC, não organização ──────────────────────────────────┐
   * │ O `MenuGuard` resolve o coringa PELO NOME DA CLASSE (`"CandidatosController.*"`, em          │
   * │ `domain/menus`), e OPERAÇÃO NÃO REIVINDICADA PASSA: uma controller nova para esta rota       │
   * │ nasceria ABERTA a qualquer usuário logado, sem nada falhar e sem nenhum teste vermelho.      │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * SEM `@Roles`, como a aprovação, a finalização de posição e a própria saída que ela desfaz
   * (decisão do diretor): qualquer consultor reverte, porque erro recente tem de ser desfeito
   * rápido. Quem restringe o módulo inteiro é o menu `as-candidatos`, no `MenuGuard`.
   *
   * POST e CORPO VAZIO, como `aprovar`: a reversão registra um FATO novo do processo, não a edição
   * de uma propriedade, e não tem parâmetro nenhum a receber. Quem reverteu vem da SESSÃO, nunca do
   * corpo: é trilha, não campo de formulário.
   */
  @Post("candidaturas/:id/reverter-envio")
  reverterEnvioParaAdmissao(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.reverterEnvioParaAdmissao(id, user.id);
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
