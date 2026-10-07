import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CENARIOS_IMPORT_CANDIDATO,
  type CenarioImportCandidato,
  type MapaColunasCandidato,
} from "@ea/shared-types";
/*
 * O `Roles` NÃO É MAIS IMPORTADO AQUI, e a ausência é a regra: esta controller não tem NENHUM
 * `@Roles`, nem de classe nem de método (o último, o da troca de vaga, saiu na Frente D por decisão
 * do diretor). Quem restringe o módulo é o menu `as-candidatos`, no `MenuGuard`, e as autoridades
 * que dependem do ESTADO da linha (desvincular quem já entregou posição) moram no service, que é o
 * único lugar que sabe qual é esse estado. Ver `candidatos.saida-autoridade-na-rota.spec.ts`.
 */
import { CurrentUser } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosService } from "./candidatos.service";
import { CandidatosImportService } from "./candidatos-import.service";
import { exigirPlanilhaNoTeto, OPCOES_UPLOAD_PLANILHA } from "../../planilha/upload";
import { FiltroUploadPlanilha } from "../../planilha/upload-erro.filter";
import {
  AdicionarEmLoteDto,
  AdicionarPorFiltroDto,
  AlocarEmVagaDto,
  BuscarCandidatosDto,
  CandidaturasDaVagaDto,
  CriarCandidatoDto,
  EditarCandidatoDto,
  FinalizarPosicaoDto,
  FinalizarPosicaoEmLoteDto,
  FinalizarPosicaoPorFiltroDto,
  IdsDasCandidaturasDaVagaDto,
  MarcarEntrevistaDto,
  MoverEtapaDto,
  MoverEtapaEmLoteDto,
  MoverEtapaPorFiltroDto,
  RegistrarContatoDto,
  RegistrarSaidaDto,
  ReprovarPeloClienteDto,
  RegistrarSaidaEmLoteDto,
  RegistrarSaidaPorFiltroDto,
  TrocarVagaDto,
  TrocarVagaEmLoteDto,
  TrocarVagaPorFiltroDto,
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
  constructor(
    private readonly candidatos: CandidatosService,
    private readonly candidatosImport: CandidatosImportService,
  ) {}

  // ── A PESSOA ──────────────────────────────────────────────────────────────

  /**
   * Quem cadastrou vem da SESSÃO, nunca do corpo: é trilha, não campo de formulário.
   *
   * O USUÁRIO INTEIRO DESCE PARA O SERVIÇO, e não só o `id`, porque o cadastro passou a decidir
   * sobre a RETENÇÃO (`bancoTalentos`), que só SUPER_ADMIN concede: lá se confere o PAPEL e se
   * registra o AUTOR na trilha, inclusive quando a tentativa é recusada.
   */
  @Post()
  criar(@Body() dto: CriarCandidatoDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.criar(dto, user);
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

  /**
   * QUEM PODE SER TRANSFERIDO PARA ESTA VAGA: as candidaturas VIVAS que estão em OUTRAS vagas.
   *
   * É a metade "b" da aba Candidatos Disponíveis. A metade "a" (quem está solto, sem processo vivo
   * nenhum) é a busca com `semCandidatura`, que já existe e não ganha rota nova.
   *
   * ANTES DE `vaga/:vagaId`? NÃO PRECISA: os dois caminhos têm número de segmentos diferente, então
   * o Nest não os confunde. A ordem aqui é de leitura, não de roteamento.
   *
   * GET, e sem `@Roles`: é LEITURA, e ela não devolve CPF nenhum (§A.6). Quem restringe o módulo
   * inteiro é o menu `as-candidatos`, no `MenuGuard`.
   */
  @Get("vaga/:vagaId/transferiveis")
  transferiveisPara(@Param("vagaId", ParseUUIDPipe) vagaId: string) {
    return this.candidatos.transferiveisPara(vagaId);
  }

  /** O painel de uma vaga: a ocupação DERIVADA mais quem está nela. */
  @Get("vaga/:vagaId")
  painelVaga(@Param("vagaId", ParseUUIDPipe) vagaId: string) {
    return this.candidatos.painelVaga(vagaId);
  }

  /**
   * ─ A ABA VER CANDIDATOS, PAGINADA NO SERVIDOR (07/10/2026), IRMA de `painelVaga` ──────────────
   *
   * POST, e não GET, pela MESMA razão de `buscar`: o recorte (busca por nome, situação, etapa) viaja
   * no CORPO, nunca em query string (§A.6). `HttpCode(200)` porque é leitura, não criação.
   *
   * MAIS SEGMENTOS QUE `vaga/:vagaId`, então o Nest não os confunde: a ordem aqui é de leitura. O
   * caminho `candidaturas/ids` logo abaixo é irmão e também não colide (o último segmento é fixo).
   *
   * SEM `@Roles`, como `painelVaga` e todo o módulo: quem restringe é o menu `as-candidatos`.
   */
  @Post("vaga/:vagaId/candidaturas")
  @HttpCode(200)
  candidaturasDaVaga(
    @Param("vagaId", ParseUUIDPipe) vagaId: string,
    @Body() dto: CandidaturasDaVagaDto,
  ) {
    return this.candidatos.candidaturasDaVagaPagina(vagaId, dto);
  }

  /**
   * OS IDS DAS CANDIDATURAS QUE CASAM O FILTRO, para a seleção de um subconjunto grande sem baixar a
   * tela inteira. §A.6: devolve só UUIDs, nenhum nome, nenhum CPF. POST pelo mesmo motivo acima.
   */
  @Post("vaga/:vagaId/candidaturas/ids")
  @HttpCode(200)
  idsDasCandidaturasDaVaga(
    @Param("vagaId", ParseUUIDPipe) vagaId: string,
    @Body() dto: IdsDasCandidaturasDaVagaDto,
  ) {
    return this.candidatos.idsDaVaga(vagaId, dto);
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
   * SEM `@Roles`: são as mesmas operações que o consultor já faz uma a uma.
   *
   * ┌─ A TROCA DE VAGA PASSOU A TER LOTE, E ESTE PARÁGRAFO DIZIA QUE NÃO TERIA (OST de 30/09) ───┐
   * │ ESTAVA ESCRITO AQUI que ela não teria versão em massa porque a troca trava a linha da vaga  │
   * │ de DESTINO e confere o teto dela na transação, e um lote parcial deixaria metade da seleção │
   * │ movida e metade não. O diretor decidiu que TODAS as ações do modal ganham versão em massa,  │
   * │ e o fato técnico virou o RELATÓRIO: quem não entrou volta em `falhas`, com o motivo, linha  │
   * │ por linha. A caixa velha foi reescrita para não ser lida como decisão viva pela próxima     │
   * │ sessão, que a usaria para remover a rota.                                                  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
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

  /**
   * DESVINCULAR (e ENVIAR PARA ADMISSÃO) EM MASSA. O motivo é obrigatório, como no individual.
   *
   * O USUÁRIO INTEIRO, e não só o id: o desvínculo de quem está ALOCADO é ação de Master, e quem
   * confere o papel é o SERVICE, linha a linha. SEM `@Roles` aqui, de propósito: todo consultor
   * desvincula quem está EM SELEÇÃO, e um papel exigido no handler barraria o lote normal do COMUM.
   */
  @Post("candidaturas/lote/saida")
  registrarSaidaEmLote(@Body() dto: RegistrarSaidaEmLoteDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.registrarSaidaEmLote(dto, user);
  }

  /** MOVER NO FUNIL EM MASSA. PATCH, como a rota individual: é a mesma propriedade que muda. */
  @Patch("candidaturas/lote/etapa")
  moverEtapaEmLote(@Body() dto: MoverEtapaEmLoteDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.moverEtapaEmLote(dto, user.id);
  }

  /**
   * TROCAR A VAGA EM MASSA (item 1 da OST de 30/09/2026).
   *
   * PATCH, como a rota individual, e pelo mesmo motivo: a candidatura já existe e uma propriedade
   * dela muda. O caminho `lote` vem ANTES de `candidaturas/:id/vaga`, senão o Nest casaria "lote"
   * como id de candidatura, que é a mesma razão registrada na caixa deste grupo.
   *
   * VAGA DE DESTINO ENCERRADA RECUSA O PEDIDO INTEIRO (problema DA VAGA, não das linhas); o resto é
   * lote PARCIAL, com o teto do destino conferido linha a linha, dentro da transação de cada uma.
   */
  @Patch("candidaturas/lote/vaga")
  trocarVagaEmLote(@Body() dto: TrocarVagaEmLoteDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.trocarVagaEmLote(dto, user.id);
  }

  /**
   * ─ AS ACOES EM MASSA POR FILTRO, SEM TETO (decisao do diretor, 07/10/2026) ────────────────────
   *
   * ┌─ O IRMAO SEM TETO DAS ROTAS `lote` ────────────────────────────────────────────────────────┐
   * │ As rotas `candidaturas/lote/...` recebem a LISTA de ids marcados (teto de 200, protecao de  │
   * │ payload). Estas recebem o ALVO POR FILTRO: o servidor resolve o conjunto INTEIRO e age sobre │
   * │ ele, SEM teto. A acao, a trava e a autorizacao sao as MESMAS da unitaria, reaplicadas linha a │
   * │ linha (por isso a saida e a adicao recebem o `AuthUser`, nao so o id). Retorno:              │
   * │ `AsResultadoAcaoEmMassa` (`{ afetados, falharam }`), so contagens (§A.6).                     │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `por-filtro` e PREFIXO FIXO, declarado ANTES de `candidaturas/:id/...`, pela mesma razao do `lote`:
   * o Nest casa na ordem de declaracao, e sem o prefixo proprio um POST bateria na rota de parametro.
   * SEM `@Roles`, como todo o modulo: quem restringe e o menu `as-candidatos` no `MenuGuard`.
   */

  /** DESVINCULAR (e ENVIAR PARA ADMISSAO) por filtro. O USUARIO INTEIRO desce: a trava de Master le o papel. */
  @Post("candidaturas/por-filtro/saida")
  @HttpCode(200)
  registrarSaidaPorFiltro(
    @Body() dto: RegistrarSaidaPorFiltroDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.registrarSaidaPorFiltro(dto, user);
  }

  /** MOVER NO FUNIL por filtro. PATCH, como a rota individual: a mesma propriedade muda. */
  @Patch("candidaturas/por-filtro/etapa")
  moverEtapaPorFiltro(@Body() dto: MoverEtapaPorFiltroDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.moverEtapaPorFiltro(dto, user.id);
  }

  /** TROCAR A VAGA por filtro. PATCH, como a rota individual. */
  @Patch("candidaturas/por-filtro/vaga")
  trocarVagaPorFiltro(@Body() dto: TrocarVagaPorFiltroDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.trocarVagaPorFiltro(dto, user.id);
  }

  /** FINALIZAR POSICAO por filtro. */
  @Post("candidaturas/por-filtro/finalizar-posicao")
  @HttpCode(200)
  finalizarPosicaoPorFiltro(
    @Body() dto: FinalizarPosicaoPorFiltroDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.finalizarPosicaoPorFiltro(dto, user.id);
  }

  /** ADICIONAR A VAGA por filtro: todos os DISPONIVEIS. A vaga de destino vem do `filtro.vagaId`. */
  @Post("candidaturas/por-filtro/adicionar")
  @HttpCode(200)
  adicionarPorFiltro(@Body() dto: AdicionarPorFiltroDto, @CurrentUser() user: AuthUser) {
    return this.candidatos.adicionarPorFiltro(dto, user);
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
   * ─ REPROVADO PELO CLIENTE: a pessoa volta para a ETAPA INICIAL (Frente E, ponto 12) ───────────
   *
   * `POST`, E NÃO `PATCH`, e a diferença não é estética: o `PATCH .../etapa` ao lado é "mude esta
   * propriedade para o valor que eu mandei", e o corpo dele CARREGA a etapa. Aqui o corpo NÃO
   * carrega destino nenhum (ele vem do catálogo) e o que se registra é um FATO do processo, com
   * marcador próprio na trilha. É verbo de gesto, no molde do `aprovar` e do `finalizar-posicao`.
   *
   * SEM `@Roles`, como todo o resto desta controller: é a operação normal de quem opera a vaga, e o
   * que restringe o módulo é o menu `as-candidatos`. As guardas que dependem do ESTADO (candidatura
   * viva, pessoa em etapa de entrega ao cliente) moram no service, que é quem lê a linha.
   */
  @Post("candidaturas/:id/reprovar-pelo-cliente")
  reprovarPeloCliente(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReprovarPeloClienteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.reprovarPeloCliente(id, dto, user.id);
  }

  /**
   * ─ MARCAR OU REMARCAR A ENTREVISTA (Frente E, ponto 8) ────────────────────────────────────────
   *
   * UMA ROTA PARA OS DOIS GESTOS: é o mesmo fato dito uma ou duas vezes ("a entrevista desta
   * pessoa, nesta etapa, é neste dia e nesta hora"). Duas rotas obrigariam a TELA a decidir se já
   * existe marcação, e ela decidiria com a fotografia que carregou, que pode estar velha.
   *
   * DEVOLVE A LISTA INTEIRA da candidatura, e não só a linha gravada: a ficha mostra as entrevistas
   * das duas etapas lado a lado, e devolver uma obrigaria a tela a uma segunda chamada para
   * redesenhar o que ela já poderia ter recebido.
   */
  @Post("candidaturas/:id/entrevista")
  marcarEntrevista(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MarcarEntrevistaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.marcarEntrevista(id, dto, user.id);
  }

  /** AS ENTREVISTAS MARCADAS da candidatura, na ordem da agenda. §A.6: nada do candidato sai aqui. */
  @Get("candidaturas/:id/entrevistas")
  listarEntrevistas(@Param("id", ParseUUIDPipe) id: string) {
    return this.candidatos.listarEntrevistas(id);
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

  /**
   * Registrar saída de QUALQUER etapa: descarte, desistência ou contratação.
   *
   * O USUÁRIO INTEIRO DESCE PARA O SERVICE, e não só o id dele: desvincular quem já está ALOCADO é
   * ação de Master (a posição dele já foi entregue), e a autoridade mora no service, NUNCA num
   * `@Roles` aqui. Um papel exigido no handler barraria o desvínculo normal do COMUM, que é a
   * operação do dia a dia de quem opera a vaga, e isso é regressão silenciosa. Mesmo desenho do
   * `fechar` e do `cancelar` das vagas.
   */
  @Post("candidaturas/:id/saida")
  registrarSaida(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RegistrarSaidaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.registrarSaida(id, dto, user);
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
   * ┌─ O `@Roles("MASTER","SUPER_ADMIN")` SAIU DAQUI (Frente D, decisão do diretor) ─────────────┐
   * │ O PEDIDO: o time operacional faz a gestão das vagas, e transferir alguém da vaga A para a B  │
   * │ é gesto de gestão do dia a dia. QUALQUER CONSULTOR TRANSFERE.                                │
   * │                                                                                             │
   * │ ESTE ERA O ÚNICO `@Roles` DE MÉTODO DA CONTROLLER INTEIRA, e a investigação antes de removê- │
   * │ lo (§A.26) mediu o que ele sustentava por baixo: NADA no `trocarVaga` consulta papel. O      │
   * │ método recebe `porId: string`, nunca o `AuthUser`, então não havia como uma régua de lá      │
   * │ depender do papel nem em silêncio. As quatro travas que decidem a operação continuam         │
   * │ INTEIRAS e não são de papel nenhum: candidatura VIVA, vaga de destino que RECEBE candidato,  │
   * │ pessoa que JÁ ESTÁ no destino, e TETO de posições do destino (contado sob a linha travada).  │
   * │                                                                                             │
   * │ O QUE CONTINUA PROTEGIDO, E PRECISA SER DITO PORQUE ISTO É BAIXAR PERMISSÃO (§A.38):         │
   * │  · O MÓDULO INTEIRO segue reivindicado pelo menu `as-candidatos` no `MenuGuard`: sem o menu, │
   * │    a rota é inalcançável, inclusive pela URL da API. "Sem `@Roles`" nunca quis dizer         │
   * │    "aberto a qualquer autenticado" nesta controller.                                        │
   * │  · DESVINCULAR quem já ENTREGOU posição (`ALOCADO`, `ENVIADO_PARA_ADMISSAO`) continua sendo  │
   * │    de MASTER, no service (`desvinculoEhDeMaster`), e esta mudança não o toca: transferir NÃO │
   * │    é desvincular. O desvínculo DESTRÓI o processo da pessoa (vira desfecho, com motivo); a   │
   * │    transferência PRESERVA a linha, a etapa e o histórico, e a pessoa continua viva na vaga   │
   * │    nova. É a diferença entre apagar e mudar de lugar.                                       │
   * │  · FECHAR vaga continua com a trava de Master dele, no `VagasService`: o COMUM leva trava   │
   * │    dura quando ainda falta posição, e só o MASTER passa com `forcar`, com a exceção          │
   * │    registrada na trilha.                                                                     │
   * │                                                                                             │
   * │ O EFEITO COLATERAL QUE EU HAVIA REPORTADO AQUI NÃO EXISTE MAIS, E A CORREÇÃO É DA AUDITORIA  │
   * │ (§A.38): este bloco dizia que um COMUM poderia esvaziar a vaga por transferência e depois    │
   * │ cancelá-la "sem Master". NÃO HÁ MAIS GATE DE MASTER NO CANCELAMENTO: a própria Frente B      │
   * │ revogou a `travaCandidatosQueSeguram`, o cancelamento passou a ser do consultor e o `forcar` │
   * │ deixou de ter efeito. Não há trava a contornar, então não há contorno.                       │
   * │                                                                                             │
   * │ ARGUMENTO DE SEGURANÇA APOIADO EM TRAVA REVOGADA É PIOR QUE COMENTÁRIO NENHUM: a próxima     │
   * │ sessão o lê como verdade e decide em cima dele. O que continua valendo do parágrafo antigo é │
   * │ só o FECHAMENTO, e para ele a transferência não afrouxa nada: tirar um entregue AUMENTA o    │
   * │ que falta para a meta, então fechar fica MAIS difícil, nunca menos.                          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * PATCH e não POST: a candidatura já existe e uma propriedade dela muda. POST diria que algo nasce,
   * e nascer é justamente o que esta operação NÃO faz, ao contrário do "Trazer De Volta".
   */
  @Patch("candidaturas/:id/vaga")
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

  // ── IMPORTAÇÃO POR PLANILHA (caminhos fixos, antes do `:id`) ──────────────

  /*
   * ─ POR QUE AS DUAS ROTAS DE IMPORT MORAM NESTA CONTROLLER, e é RBAC, não organização ──────────
   *
   * O `MenuGuard` resolve o coringa PELO NOME DA CLASSE (`"CandidatosController.*"`, em
   * `domain/menus`), e OPERAÇÃO NÃO REIVINDICADA PASSA. Uma controller nova para o import nasceria
   * ABERTA a qualquer sessão válida, e o que ela oferece é ESCRITA EM MASSA de dado pessoal de quem
   * ainda não é funcionário. Uma superfície, uma reivindicação, como o resto do módulo.
   *
   * `importar/previa` e `importar/aplicar` vêm ANTES do bloco `:id`: o Nest casa na ordem de
   * declaração, e "importar" é caminho fixo que não pode ser engolido por `:id`.
   *
   * SEM `@Roles`, como o `criar` e as ações em lote: é a mesma operação que o consultor já faz uma a
   * uma. Quem restringe o módulo inteiro é o menu `as-candidatos`, no `MenuGuard`.
   *
   * §A.6: o arquivo vai no CORPO (multipart), nunca em query string. O buffer vive na requisição e é
   * expurgado no serviço; nada do conteúdo é logado.
   */

  /**
   * PRÉVIA: sobe a planilha, a IA sugere o de/para das colunas e a tela confere. NÃO GRAVA NADA.
   * IA fora do ar devolve a prévia com o mapa vazio, para o time mapear na mão.
   */
  @Post("importar/previa")
  @HttpCode(200)
  @UseFilters(FiltroUploadPlanilha)
  @UseInterceptors(FileInterceptor("file", OPCOES_UPLOAD_PLANILHA))
  importarPrevia(@UploadedFile() file?: Express.Multer.File, @Body("aba") aba?: string) {
    // TETO DE BYTES NA PORTA (§A.6 e disponibilidade): sem ele, o multer aceita arquivo de tamanho
    // infinito e o parse síncrono trava o event loop do backend inteiro.
    const arquivo = exigirPlanilhaNoTeto(file);
    // `aba` é OPCIONAL: sem ela a leitura escolhe a primeira aba utilizável e devolve quais existem,
    // para a tela oferecer a troca. A base real do diretor tem duas abas no mesmo arquivo.
    return this.candidatosImport.previa(arquivo, aba || undefined);
  }

  /**
   * APLICA: com o `mapa` já confirmado pela tela, lê a planilha inteira e cria/reaproveita os
   * candidatos, tolerante a falha por linha. Cenário `COM_VAGA` vincula à `vagaId` na etapa CAPTACAO.
   *
   * O corpo do multipart chega em TEXTO (não é JSON): `mapa` vem como string a ser parseada, e um
   * texto inválido é erro do chamador, não motivo para 500.
   */
  @Post("importar/aplicar")
  @UseFilters(FiltroUploadPlanilha)
  @UseInterceptors(FileInterceptor("file", OPCOES_UPLOAD_PLANILHA))
  importarAplicar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body("cenario") cenario?: string,
    @Body("vagaId") vagaId?: string,
    @Body("mapa") mapaJson?: string,
    @Body("aba") aba?: string,
    @Body("assinaturaCabecalho") assinaturaCabecalho?: string,
  ) {
    const arquivo = exigirPlanilhaNoTeto(file);
    if (!cenario || !(CENARIOS_IMPORT_CANDIDATO as readonly string[]).includes(cenario)) {
      throw new BadRequestException("Cenário de importação inválido.");
    }
    let mapa: MapaColunasCandidato;
    try {
      mapa = JSON.parse(mapaJson ?? "") as MapaColunasCandidato;
    } catch {
      throw new BadRequestException("Mapeamento de colunas inválido.");
    }
    if (!mapa || typeof mapa !== "object") {
      throw new BadRequestException("Mapeamento de colunas inválido.");
    }
    return this.candidatosImport.aplicar(
      {
        arquivo,
        cenario: cenario as CenarioImportCandidato,
        vagaId: vagaId || undefined,
        mapa,
        // A MESMA aba que a prévia usou: o mapa foi conferido contra o cabeçalho DELA.
        aba: aba || undefined,
        // A ASSINATURA DAQUELE cabeçalho, ecoada pela tela: o serviço recalcula a da grade que leu e
        // recusa quando diverge, em vez de gravar a coluna errada em silêncio. Ausente (cliente
        // antigo), a gravação segue o comportamento de antes.
        assinaturaCabecalho: assinaturaCabecalho || undefined,
      },
      user,
    );
  }

  /**
   * AS OPCOES DOS FILTROS da Central de Candidatos: clientes, cargos e vagas DISTINTOS das
   * candidaturas (§A.37). Desacopla a tela de `/as/vagas`, que so traz vaga liberada.
   *
   * CAMINHO FIXO, DECLARADO ANTES DE `:id`: sem isto o Nest casaria "opcoes" como id de candidato e
   * o `ParseUUIDPipe` da ficha devolveria 400. Mesma razao da ordem de `buscar` e `candidaturas/...`.
   *
   * GET e SEM `@Roles`, como as demais leituras: nao sai dado pessoal nenhum (so rotulo/codigo de
   * catalogo), e quem restringe o modulo inteiro e o menu `as-candidatos` no `MenuGuard`.
   */
  @Get("opcoes")
  opcoes() {
    return this.candidatos.opcoes();
  }

  // ── ROTAS COM `:id` DE CANDIDATO (por último) ─────────────────────────────

  /** A FICHA: o único lugar em que o CPF e os dados de contato saem do backend (§A.6). */
  @Get(":id")
  ficha(@Param("id", ParseUUIDPipe) id: string) {
    return this.candidatos.ficha(id);
  }

  /**
   * EDITAR a ficha. O `@CurrentUser()` NÃO É ENFEITE AQUI, e a assinatura mudou por causa dele.
   *
   * A edição passou a alcançar a RETENÇÃO (`bancoTalentos`), a única marca do sistema que concede
   * vida eterna a dado pessoal. Sem o usuário não há PAPEL a conferir nem AUTOR a registrar, e a
   * rota nasceria como a porta que contorna o cadeado posto no cadastro.
   */
  @Patch(":id")
  editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: EditarCandidatoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidatos.editar(id, dto, user);
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
