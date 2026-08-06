import { Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { SalaEsperaDto, SalaEsperaStatusDto } from "./sala-espera.dto";
import { SalaEsperaService } from "./sala-espera.service";

/**
 * SALA DE ESPERA (pré-processo, antes da Liberação Admissional).
 *
 * SEM `@Roles`, como a esteira: quem opera a Sala é o consultor, e quem ENXERGA a tela é decidido
 * pelo diretor na liberação de menu (§A.23). As mutações são reivindicadas pelos menus, então o
 * `MenuGuard` cobra a permissão sem travar por papel.
 *
 * O catálogo de status vive sob `/sala-espera/status` e é reivindicado por um menu PRÓPRIO, do
 * Gerencial: manter a lista é administração, operar a fila não.
 */
@Controller("sala-espera")
export class SalaEsperaController {
  constructor(private readonly sala: SalaEsperaService) {}

  /** Catálogo completo (inclusive inativos): a tela de manutenção do Gerencial. */
  @Get("status")
  listarStatus() {
    return this.sala.listarStatus();
  }

  /** Só os ativos: alimenta os seletores da tela da Sala. */
  @Get("status/ativos")
  listarStatusAtivos() {
    return this.sala.listarStatusAtivos();
  }

  @Post("status")
  criarStatus(@Body() dto: SalaEsperaStatusDto) {
    return this.sala.criarStatus(dto);
  }

  @Patch("status/:id")
  atualizarStatus(@Param("id") id: string, @Body() dto: SalaEsperaStatusDto) {
    return this.sala.atualizarStatus(id, dto);
  }

  /** A fila. `todos=1` abre o histórico (encerrados e já vinculados). */
  @Get()
  listar(@Query("todos") todos?: string) {
    return this.sala.listar(todos === "1");
  }

  @Post()
  criar(@Body() dto: SalaEsperaDto, @CurrentUser() user: AuthUser) {
    return this.sala.criar(dto, user);
  }

  @Put(":id")
  atualizar(@Param("id") id: string, @Body() dto: SalaEsperaDto) {
    return this.sala.atualizar(id, dto);
  }
}
