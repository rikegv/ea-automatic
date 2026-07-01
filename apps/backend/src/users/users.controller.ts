import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { AtualizarUsuarioDto, CriarUsuarioDto } from "./users.dto";
import { UsersService } from "./users.service";

/**
 * Administração de usuários (OST-EA-GESTAO-USUARIOS). Restrita a Master/Super Admin (§A.3/§A.6):
 * o consultor COMUM nunca acessa. Nenhuma resposta expõe senhaHash; a senha temporária em claro
 * trafega apenas na criação e no reset (nunca é logada).
 */
@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/usuarios")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  listar() {
    return this.users.listar();
  }

  @Post()
  criar(@Body() dto: CriarUsuarioDto) {
    return this.users.criar(dto);
  }

  @Patch(":id")
  atualizar(
    @Param("id") id: string,
    @Body() dto: AtualizarUsuarioDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.atualizar(id, dto, user.id);
  }

  @Post(":id/reset-senha")
  resetarSenha(@Param("id") id: string) {
    return this.users.resetarSenha(id);
  }
}
