import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { CreateVagaDto, EditarPosicoesVagaDto, FecharVagaDto } from "./vagas.dto";
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
}
