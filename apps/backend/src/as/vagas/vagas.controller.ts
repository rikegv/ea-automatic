import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser, Roles } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import {
  CancelarVagaDto,
  CreateVagaDto,
  EditarPosicoesVagaDto,
  FecharVagaDto,
  MoverStatusVagaDto,
  ReabrirVagaDto,
} from "./vagas.dto";
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
  constructor(private readonly vagas: VagasService) {}

  @Get()
  list() {
    return this.vagas.list();
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
}
