import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { CreateVagaDto, FecharVagaDto } from "./vagas.dto";
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
   * FECHAR A VAGA (frente 4). Momento separado da abertura, então rota separada: aqui não se edita
   * a vaga, só se registra como o processo terminou.
   */
  @Post(":id/fechar")
  fechar(@Param("id") id: string, @Body() dto: FecharVagaDto) {
    return this.vagas.fechar(id, dto);
  }
}
