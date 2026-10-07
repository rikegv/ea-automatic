import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentUser, Roles } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import {
  CancelarVagaDto,
  CreateVagaDto,
  EditarPosicoesVagaDto,
  EditarVagaDto,
  FecharVagaDto,
  MoverStatusVagaDto,
  ReabrirVagaDto,
  CorrigirLiberacaoRevisaoDto,
  LiberarVagaRevisaoDto,
  TransferirConsultorDaVagaDto,
} from "./vagas.dto";
import { VagasEdicaoService } from "./vagas-edicao.service";
import { VagasService } from "./vagas.service";

/**
 * CENTRAL DE VAGAS (A&S, onda 1).
 *
 * RBAC: a controller INTEIRA é reivindicada pelo menu `as-vagas` (`domain/menus`), leitura incluída,
 * e é uma escolha diferente da dos catálogos da Admissão, onde a leitura fica aberta. O motivo é o
 * isolamento do módulo novo: enquanto o menu existir só para o SUPER_ADMIN (§A.23), o A&S precisa ser
 * invisível E inerte para o resto da operação, inclusive pela URL da API.
 */
@Controller("as/vagas")
export class VagasController {
  constructor(
    private readonly vagas: VagasService,
    /**
     * Editar e excluir a vaga JÁ LIBERADA (05/10/2026), em serviço próprio por exigência do veto.
     *
     * OPCIONAL NA ASSINATURA por alcance (§A.26): specs já validadas constroem esta controller à mão
     * com um argumento só. Em execução o Nest sempre injeta (o provider está no `AsModule`).
     */
    @Optional() private readonly edicaoInjetada?: VagasEdicaoService,
  ) {}

  private edicao(): VagasEdicaoService {
    if (!this.edicaoInjetada) throw new Error("VagasEdicaoService não foi injetado.");
    return this.edicaoInjetada;
  }

  @Get()
  list() {
    // A CENTRAL DE VAGAS mostra só vaga JÁ LIBERADA (decisão do diretor, 05/10/2026): a pendente de
    // revisão e o rascunho seguem só no Liberar Vaga. O filtro mora no `listCentral`, não no `list`
    // cru, que a fila de revisão ainda consome. Ver o comentário do método.
    return this.vagas.listCentral();
  }

  /** Cargos e clientes para os seletores do cadastro, servidos pelo próprio módulo (ver o service). */
  @Get("opcoes")
  opcoes() {
    return this.vagas.opcoes();
  }

  /**
   * O CONTEXTO DE A&S de quem está com a tela aberta: o lado que a pessoa ocupa e as pessoas do lado
   * oposto, para a trilha desenhar UM seletor só (frente 2). Lido do banco, não do token.
   */
  @Get("contexto")
  contexto(@CurrentUser() user: AuthUser) {
    return this.vagas.contextoAs(user.id);
  }

  /**
   * A FILA DAS VAGAS PENDENTES DE REVISÃO: o que a varredura do Pandapé espelhou sem cliente.
   *
   * DECLARADA ANTES DAS ROTAS COM `:id`, e isso não é arrumação: o Nest casa rotas na ORDEM de
   * declaração, e um `@Get(":id/...")` declarado antes engoliria "pendentes-revisao" como se fosse
   * um id. É o mesmo cuidado das rotas de liberação da Admissão.
   *
   * SEM `@Roles`: revisar a vaga que chegou é trabalho de consultor, como a Liberação Admissional.
   * A controller inteira já é reivindicada pelo menu `as-vagas`.
   */
  @Get("pendentes-revisao")
  pendentesDeRevisao() {
    return this.vagas.pendentesDeRevisao();
  }

  /**
   * AS VAGAS QUE JÁ SAÍRAM DA FILA PELA LIBERAÇÃO: o conjunto da correção do Master.
   *
   * SEM `@Roles` na LEITURA, e é coerente com a fila: a lista é de vaga, cliente e cargo, sem dado
   * pessoal nenhum, e é a mesma informação que a Central de Vagas já mostra a quem tem o menu. O que
   * é de Master é a ESCRITA, e ela tem o guard na rota dela.
   */
  @Get("pendentes-revisao/liberadas")
  liberadasDaRevisao() {
    return this.vagas.liberadasDaRevisao();
  }

  /** A contagem leve da fila (badge do menu e polling da tela). Devolve número, nunca linha. */
  @Get("pendentes-revisao/contagem")
  contagemPendentesDeRevisao() {
    return this.vagas.contarPendentesDeRevisao();
  }

  /**
   * A ABA RECUSADAS (F4): as vagas que o consultor recusou, com quem recusou e quando.
   *
   * CAMINHO LITERAL ANTES DO `@Get(":id")`, como `pendentes-revisao`: o Nest casa na ORDEM de
   * declaração. SEM `@Roles`, por paridade com `pendentes-revisao` e `liberar-revisao` (decisão do
   * diretor): a trava é o menu `as-vagas`, que reivindica a controller inteira.
   */
  @Get("recusadas")
  recusadas() {
    return this.vagas.recusadas();
  }

  /**
   * OS CONSULTORES QUE PODEM RECEBER UMA VAGA: o catálogo do seletor da transferência (item 5).
   *
   * CAMINHO FIXO ANTES DO `@Get(":id")`, e não é detalhe: o Nest casa na ORDEM de declaração, e a
   * rota de parâmetro declarada antes engoliria "consultores" como se fosse um id de vaga. É a mesma
   * razão escrita no bloco de `pendentes-revisao`.
   *
   * ENDPOINT, E NÃO AS LINHAS JÁ CARREGADAS (§A.37): a tela da Central de Vagas lista vagas, e
   * derivar os consultores dali só ofereceria quem já tem vaga, que é o oposto do que a
   * transferência precisa (quem vai RECEBER pode não ter nenhuma).
   *
   * SEM `@Roles`, como o resto da controller: é LEITURA de id e nome de usuário interno, e quem
   * restringe o módulo é o menu `as-vagas` no `MenuGuard`.
   */
  @Get("consultores")
  consultoresParaTransferencia() {
    return this.vagas.consultoresParaTransferencia();
  }

  /**
   * OS RECRUITERS QUE PODEM RECEBER UMA VAGA: o catálogo do seletor de recruiter da edição da vaga
   * liberada (05/10/2026). Mesmo regime de `consultores`: caminho fixo ANTES do `@Get(":id")`, sem
   * `@Roles` (leitura de id e nome de usuário interno; o menu `as-vagas` restringe).
   */
  @Get("recrutadores")
  recrutadores() {
    return this.edicao().recrutadores();
  }

  /** Quem abriu vem da SESSÃO, nunca do corpo: é trilha, não campo de formulário. */
  @Post()
  create(@Body() dto: CreateVagaDto, @CurrentUser() user: AuthUser) {
    return this.vagas.create(dto, user.id);
  }

  /**
   * CONTINUAR O RASCUNHO, e PUBLICAR quando ele estiver pronto (OST de 25/08).
   *
   * PATCH e não POST porque é a MESMA vaga sendo completada, não uma nova. Só rascunho entra: vaga
   * já publicada é recusada com conflito pelo service, que é quem tem o estado para decidir.
   *
   * O CORPO É O MESMO DA CRIAÇÃO (`CreateVagaDto`): a trilha é a mesma tela, mandando os mesmos
   * campos. É o `status` do corpo que diz se é para continuar rascunho ou publicar.
   *
   * ┌─ O `@CurrentUser()` AQUI É O RASTRO DA REDUÇÃO DE META, e ele faltava (veto de 09/09) ─────┐
   * │ ESTA ROTA TAMBÉM ESCREVE `posicoes_oficiais`, e escrevia em silêncio: o rastro tinha sido   │
   * │ aplicado só na rota irmã das posições, então o desvio do gate de Master seguia inteiro por  │
   * │ aqui (rascunho com gente alocada, PATCH baixando a meta e publicando de uma vez). Quem      │
   * │ editou vem da SESSÃO, nunca do corpo, como no `editarPosicoes` e no `fechar`: autoria é     │
   * │ trilha, não campo de formulário.                                                           │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: CreateVagaDto, @CurrentUser() user: AuthUser) {
    return this.vagas.atualizar(id, dto, user.id);
  }

  /**
   * EDITAR SÓ OS DOIS CONTADORES (decisão do diretor, 25/08: "continuam editáveis depois").
   *
   * ROTA PRÓPRIA, e não o PATCH da trilha, pelo mesmo motivo do corpo próprio: a vaga publicada não
   * volta para a trilha de abertura. Aqui se escreve o par de posições e mais nada, e é o service que
   * recusa a vaga já encerrada, porque é ele que tem o estado para decidir.
   *
   * ┌─ QUEM EDITOU VEM DA SESSÃO, e este parâmetro fecha o desvio que a auditoria achou ─────────┐
   * │ CONTINUA SEM `@Roles`, E ISSO É DECISÃO DO DIRETOR: baixar a meta é do consultor, liberado  │
   * │ a ele em 25/08 e não revogado. O que a auditoria de 09/09 provou é que a rota era o CAMINHO │
   * │ DE VOLTA do gate de Master do fechamento: baixando a meta até o já entregue, `faltam` virava│
   * │ zero e a vaga fechava pela porta normal, sem Master e sem trilha nenhuma.                   │
   * │                                                                                            │
   * │ A RESPOSTA É RASTRO, NÃO TRAVA, e rastro precisa de AUTOR. Ele não chegava aqui, e é só por │
   * │ isso que o `@CurrentUser()` aparece: a redução passa a ser gravada em NOME de alguém, na    │
   * │ mesma transação da escrita das posições. O padrão é o do `fechar`, logo abaixo.             │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Patch(":id/posicoes")
  editarPosicoes(
    @Param("id") id: string,
    @Body() dto: EditarPosicoesVagaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vagas.editarPosicoes(id, dto, user.id);
  }

  /**
   * FECHAR A VAGA (frente 4). Momento separado da abertura, então rota separada: aqui não se edita
   * a vaga, só se registra como o processo terminou.
   *
   * ┌─ SEM `@Roles` AQUI, E A AUSÊNCIA É A REGRA, NÃO UM ESQUECIMENTO ───────────────────────────┐
   * │ TODO CONSULTOR FECHA VAGA. O que é de Master é FORÇAR o fechamento com posição oficial em   │
   * │ aberto, e essa conferência mora no SERVICE, que é quem sabe se a vaga entregou o que        │
   * │ prometeu. Um `@Roles("MASTER","SUPER_ADMIN")` neste handler barraria o fechamento NORMAL do │
   * │ COMUM, que é regressão silenciosa: a vaga completa deixaria de fechar para quem a operou.   │
   * │ O padrão é o mesmo da liberação de Apto sem ASO na Esteira.                                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * QUEM FECHOU VEM DA SESSÃO, nunca do corpo: é o papel dele que autoriza a exceção, e é o nome
   * dele que vai para a trilha do forçado.
   */
  @Post(":id/fechar")
  fechar(@Param("id") id: string, @Body() dto: FecharVagaDto, @CurrentUser() user: AuthUser) {
    return this.vagas.fechar(id, dto, user);
  }

  /**
   * CANCELAR A VAGA (onda B1). Rota própria, e não o `PATCH` da trilha, pelo mesmo argumento que já
   * separou o `fechar`: aqui não se edita a vaga, registra-se que o processo não vai mais acontecer.
   *
   * ┌─ SEM `@Roles` AQUI, E A AUSÊNCIA É A REGRA, NÃO UM ESQUECIMENTO ───────────────────────────┐
   * │ TODO CONSULTOR CANCELA VAGA. O que é de Master é FORÇAR o cancelamento com candidato ainda │
   * │ em processo dentro, e essa conferência mora no SERVICE, que é quem sabe quem está lá.      │
   * │ Um `@Roles("MASTER","SUPER_ADMIN")` neste handler barraria o cancelamento NORMAL do COMUM, │
   * │ que é regressão silenciosa: a vaga vazia deixaria de ser cancelada por quem a operou.      │
   * │ É o mesmo desenho do `fechar`, logo acima, e o da liberação de Apto sem ASO na Esteira.    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * QUEM CANCELOU VEM DA SESSÃO, nunca do corpo: é o papel dele que autoriza a exceção, e é o nome
   * dele que vai para a trilha do cancelamento. A DATA do carimbo é o `now()` do servidor; a data
   * que o corpo traz é a do FATO comercial, que é outra coisa.
   */
  /**
   * MOVER O STATUS DA VAGA À MÃO (onda B2): o caminho para os status que o DIRETOR criou.
   *
   * ┌─ SEM `@Roles`, E A AUTORIDADE É O SERVICE, como no fechar e no cancelar ───────────────────┐
   * │ Pôr uma vaga em "Stand By" é operação de consultor, não configuração de sistema. O que é de │
   * │ SUPER_ADMIN é EDITAR A LISTA de status (`VagaStatusAdminController`), e essa está gatada.   │
   * │                                                                                            │
   * │ E ESTA ROTA NÃO ENCERRA VAGA: o destino tem de passar por `podeSerDestinoManual` (ativo,    │
   * │ movível e que NÃO encerra) e a origem por `podeSairManualmente` (só sai de quem não         │
   * │ encerra), as duas sob a linha travada. É o que preserva a frase que dispensa o `@Roles` do  │
   * │ fechamento: `fechar` e `cancelar` continuam sendo as ÚNICAS portas para o estado terminal.  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * PATCH e não POST porque é a MESMA vaga mudando de estado. Quem moveu vem da SESSÃO, nunca do
   * corpo: autoria é trilha, não campo de formulário.
   */
  @Patch(":id/status")
  moverStatus(
    @Param("id") id: string,
    @Body() dto: MoverStatusVagaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vagas.moverStatus(id, dto, user);
  }

  @Post(":id/cancelar")
  cancelar(@Param("id") id: string, @Body() dto: CancelarVagaDto, @CurrentUser() user: AuthUser) {
    return this.vagas.cancelar(id, dto, user);
  }

  /**
   * O AVISO DO CANCELAMENTO (onda B3): quantos processos daquela vaga JÁ ESTÃO ENCERRADOS.
   *
   * ┌─ SEM `@Roles` AQUI, E A AUSÊNCIA É DELIBERADA ─────────────────────────────────────────────┐
   * │ ESTA É A LEITURA DO MODAL DE CANCELAR, e cancelar é do CONSULTOR (ver a rota logo acima).  │
   * │ Um `@Roles("MASTER","SUPER_ADMIN")` deixaria o COMUM cancelar sem nunca ver o aviso que a  │
   * │ OST existe para dar, que é regressão silenciosa do pior tipo: a trava continuaria valendo e │
   * │ a informação que ela não dá continuaria faltando.                                          │
   * │                                                                                            │
   * │ E O QUE ELA SERVE É ESTRITAMENTE MENOS do que a leitura já aberta: a MESMA informação, COM  │
   * │ NOME, é servida a qualquer consultor com o menu por `GET as/candidatos/vaga/:vagaId`. Aqui  │
   * │ sai um NÚMERO por situação. A controller inteira continua reivindicada pelo menu `as-vagas`.│
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Get(":id/cancelamento-previa")
  previaDoCancelamento(@Param("id") id: string) {
    return this.vagas.previaDoCancelamento(id);
  }

  /**
   * A PRÉVIA DO REABRIR: quem o cancelamento derrubou, para o Master escolher quem volta.
   *
   * ┌─ `@Roles` AQUI TAMBÉM, E ELE NÃO É REDUNDANTE COM O DA ESCRITA ────────────────────────────┐
   * │ SEM ELE, O COMUM ENUMERA OS DESCARTADOS DE QUALQUER VAGA pela URL da API, com nome, motivo  │
   * │ e data da saída, sem nunca conseguir reabrir nada. Leitura sensível se protege na leitura.  │
   * │                                                                                            │
   * │ O AVISO AO COMUM É PURAMENTE DE TELA, SEM `fetch`: o botão não se esconde (decisão do       │
   * │ diretor), ele DIZ que só o Master reabre. Esconder ensina que o sistema está quebrado; dizer │
   * │ ensina quem procurar.                                                                       │
   * │                                                                                            │
   * │ `SUPER_ADMIN` É ESCRITO, e a omissão seria um defeito medido: o `RolesGuard` faz            │
   * │ `!required.includes(user.papel)` e LANÇA antes de tratar o SUPER_ADMIN, então               │
   * │ `@Roles("MASTER")` sozinho barraria o próprio diretor. É o molde do `trocarVaga`.            │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Get(":id/reabrir-previa")
  @Roles("MASTER", "SUPER_ADMIN")
  previaDeReabertura(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.vagas.previaDeReabertura(id, user);
  }

  /**
   * REABRIR A VAGA CANCELADA (onda B3): a única porta que DESFAZ um encerramento.
   *
   * ┌─ COM `@Roles`, AO CONTRÁRIO DO `fechar` E DO `cancelar`, E O CONTRASTE É A REGRA ──────────┐
   * │ Lá a ausência é deliberada: todo consultor fecha e cancela, e só FORÇAR é de Master, o que  │
   * │ o service confere. AQUI A AÇÃO INTEIRA É DE MASTER, por decisão do diretor, então a         │
   * │ restrição sobe para a rota. O service RECONFERE o papel do `@CurrentUser()`, nunca do corpo:│
   * │ o guard é a primeira autoridade, e a segunda vale para todo chamador interno.                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ELA MORA NESTA CONTROLLER, E ISSO NÃO É ARRUMAÇÃO: uma controller NOVA cairia no default de
   * área ADM, fail-closed (`menu-areas.service`), e todo Master de A&S levaria 403 dizendo que a
   * operação é de outra área. A `VagasController` já é reivindicada pelo menu `as-vagas`.
   *
   * POST e não PATCH, no molde do `fechar` e do `cancelar`: aqui não se edita a vaga, registra-se um
   * movimento dela, com trilha e com gente voltando ao processo.
   */
  @Post(":id/reabrir")
  @Roles("MASTER", "SUPER_ADMIN")
  reabrir(@Param("id") id: string, @Body() dto: ReabrirVagaDto, @CurrentUser() user: AuthUser) {
    return this.vagas.reabrir(id, dto, user);
  }

  /**
   * LIBERAR A VAGA PENDENTE DE REVISÃO, uma por vez.
   *
   * ┌─ SEM `@Roles`, E A AUSÊNCIA É DECISÃO DO DIRETOR ──────────────────────────────────────────┐
   * │ QUALQUER CONSULTOR LIBERA: revisar a vaga que chegou do Pandapé, vincular o cliente que     │
   * │ falta e liberar é fluxo operacional do dia a dia, exatamente como a Liberação Admissional.  │
   * │ O que é de Master aqui é DESFAZER, e essa rota tem o `@Roles` logo abaixo.                   │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NÃO HÁ ROTA DE LOTE, e a ausência é a decisão: um cliente errado aplicado a centenas de vagas
   * atribui centenas de pessoas ao controlador errado, e desfazer não desfaz o que já foi visto.
   *
   * POST e não PATCH, no molde do `fechar` e do `reabrir`: aqui não se edita a vaga, registra-se um
   * movimento dela, com trilha. O CORPO É VAZIO de propósito: o destino é resolvido no catálogo e o
   * cliente é lido do banco, sob a linha travada, nunca do que a tela mandou.
   */
  @Post(":id/liberar-revisao")
  liberarRevisao(
    @Param("id") id: string,
    @Body() dto: LiberarVagaRevisaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vagas.liberarPendenteRevisao(id, user, dto);
  }

  /**
   * CORRIGIR A LIBERAÇÃO: trocar o cliente, devolver a vaga para a fila, ou as duas coisas.
   *
   * ┌─ COM `@Roles`, E O `SUPER_ADMIN` É ESCRITO ────────────────────────────────────────────────┐
   * │ A ação inteira é de Master, por decisão do diretor: ela é a rede de segurança da liberação  │
   * │ errada, e corrigir o trabalho de outra pessoa não é operação de rotina. `@Roles("MASTER")`  │
   * │ sozinho barraria o próprio diretor, porque o `RolesGuard` confere `required.includes(papel)`│
   * │ e LANÇA antes de tratar o SUPER_ADMIN. É o molde do `reabrir`.                               │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Post(":id/corrigir-revisao")
  @Roles("MASTER", "SUPER_ADMIN")
  corrigirRevisao(
    @Param("id") id: string,
    @Body() dto: CorrigirLiberacaoRevisaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vagas.corrigirLiberacaoDaRevisao(id, dto, user);
  }

  /**
   * ─ RECUSAR A LIBERAÇÃO E DEVOLVER PARA A FILA (F4), espelhando a recusa da Admissão ────────────
   *
   * ┌─ SEM `@Roles`, POR DECISÃO DO DIRETOR, EM PARIDADE COM `liberar-revisao` ──────────────────┐
   * │ Recusar e devolver são fluxo operacional de QUALQUER consultor, como liberar. A trava é o   │
   * │ menu `as-vagas`, que reivindica a controller inteira (`VagasController.*`, `domain/menus`):  │
   * │ estes métodos novos herdam a reivindicação curinga e já nascem cobertos. Um `@Roles` aqui    │
   * │ seria porta trancada para quem tem o menu, o defeito que a casa já pagou.                     │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * CORPO VAZIO: a autoria vem da SESSÃO (`@CurrentUser`), nunca do corpo, porque é trilha. POST, no
   * molde do `liberar-revisao`: registra um movimento da vaga, com trilha em `vaga_recusa_eventos`.
   */
  @Post(":id/recusar-liberacao")
  recusarLiberacao(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.vagas.recusarLiberacao(id, user);
  }

  @Post(":id/devolver-revisao")
  devolverRevisao(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.vagas.devolverRevisao(id, user);
  }

  /**
   * TRANSFERIR A VAGA DE UM CONSULTOR PARA OUTRO (item 5 da OST de 30/09/2026).
   *
   * PATCH e não POST: a vaga já existe e UMA propriedade dela muda. POST diria que algo nasce, e
   * nascer é o que esta operação não faz. É o mesmo argumento do `PATCH candidaturas/:id/vaga`.
   *
   * ┌─ SEM `@Roles`, POR DECISÃO DO DIRETOR, E ISSO NÃO É "SEM GUARDA" ──────────────────────────┐
   * │ NÍVEL CONSULTOR, no mesmo padrão já declarado nesta controller para revisar, baixar meta,   │
   * │ mover status, fechar e cancelar. Quem barra é o MENU: `VagasController.*` é reivindicada     │
   * │ pelo menu `as-vagas` em `domain/menus`, e o `MenuGuard` recusa quem não o tem, inclusive por │
   * │ `curl`. A reivindicação é CURINGA, então este método novo já nasce coberto: numa controller  │
   * │ reivindicada método a método ele nasceria FAIL-OPEN.                                        │
   * │                                                                                            │
   * │ `@Roles("MASTER")` aqui seria porta trancada para quem tem o menu, que é o defeito que a    │
   * │ casa já pagou. As travas que a operação tem são de ESTADO, no service, e não de papel: o    │
   * │ destino existe, está ATIVO e tem papel de A&S de CONSULTOR.                                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * QUEM TRANSFERIU VEM DA SESSÃO, nunca do corpo, e vai para `vaga_consultor_transferencias`.
   */
  @Patch(":id/consultor")
  transferirConsultor(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransferirConsultorDaVagaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vagas.transferirConsultor(id, dto, user.id);
  }

  /**
   * ─ EDITAR A VAGA JÁ LIBERADA (05/10/2026): a prévia e a escrita ──────────────────────────────
   *
   * SEM `@Roles`: editar é do consultor (decisão do diretor), e quem restringe é o menu `as-vagas`,
   * que reivindica a controller inteira (`VagasController.*`). As travas são de ESTADO, no service:
   * só vaga em processo, a fronteira da admissão, as posições e os destinos dos dois lados.
   *
   * Recusa de regra volta 409 com `AsVagaEdicaoNegada` (`codigo` de `AS_VAGA_EDICAO_RECUSAS`); os
   * dois `CONFIRMAR_*` pedem que a tela reenvie o mesmo corpo com a confirmação marcada.
   */
  @Get(":id/edicao-previa")
  previaDaEdicao(@Param("id", ParseUUIDPipe) id: string) {
    return this.edicao().previa(id);
  }

  @Patch(":id/editar")
  editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: EditarVagaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.edicao().editar(id, dto, user.id);
  }

  /**
   * ─ EXCLUIR A VAGA (05/10/2026): só o SUPER_ADMIN, e só vaga sem candidatura nem shortlist ──────
   *
   * `@Roles("SUPER_ADMIN")` SOZINHO, e o MASTER recebe 403 de propósito: o `RolesGuard` faz
   * `required.includes(papel)`, e a decisão do diretor é que o Master não exclui. A PRÉVIA tem o
   * mesmo guard, porque só serve a quem pode excluir. O menu `as-vagas` segue valendo por cima.
   */
  @Get(":id/exclusao-previa")
  @Roles("SUPER_ADMIN")
  previaDaExclusao(@Param("id", ParseUUIDPipe) id: string) {
    return this.edicao().exclusaoPrevia(id);
  }

  @Delete(":id")
  @Roles("SUPER_ADMIN")
  excluir(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.edicao().excluir(id, user.id);
  }

  /**
   * O DETALHE DE UMA VAGA, com o `substituidoCpf` que a LISTA não carrega mais (correção de LGPD
   * ativo, 22/09). A ficha de edição, o clone e a liberação buscam AQUI o CPF do substituído quando o
   * consultor abre uma vaga; a `@Get()` da lista parou de descer o CPF de todas as vagas para todos.
   *
   * ┌─ DECLARADA POR ÚLTIMO, E ISSO É A REGRA, NÃO ARRUMAÇÃO ────────────────────────────────────┐
   * │ O Nest casa rotas na ORDEM de declaração. Um `@Get(":id")` de SEGMENTO ÚNICO declarado antes │
   * │ engoliria "opcoes", "contexto", "pendentes-revisao" e "pendentes-revisao/contagem" como se   │
   * │ fossem um id. Por isso ele vem DEPOIS de toda rota de caminho literal. As rotas `:id/...`     │
   * │ (dois segmentos) e os `@Post`/`@Patch` de `:id` não conflitam: método ou profundidade         │
   * │ diferente. É o mesmo cuidado que o comentário de `pendentes-revisao` já registra.             │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `ParseUUIDPipe` recusa id malformado com 400 limpo, e é defesa em profundidade: só UUID bem
   * formado chega à consulta do service.
   *
   * SEM `@Roles`, no MESMO regime da lista: a controller inteira é reivindicada pelo menu `as-vagas`
   * (`VagasController.*`, `domain/menus`), então quem não pode ver a lista não pode ver o detalhe. O
   * detalhe não afrouxa nada: só devolve a vaga que a lista já devolveria, com um campo a mais.
   */
  @Get(":id")
  detalhe(@Param("id", ParseUUIDPipe) id: string) {
    return this.vagas.detalhe(id);
  }
}
