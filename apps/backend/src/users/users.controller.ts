import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { MenusService } from "../auth/menus.service";
import { AtualizarUsuarioDto, CriarUsuarioDto, DefinirMenusDto } from "./users.dto";
import { UsersService } from "./users.service";

/**
 * Administração de usuários (OST-EA-GESTAO-USUARIOS). Restrita a Master/Super Admin (§A.3/§A.6):
 * o consultor COMUM nunca acessa. Nenhuma resposta expõe senhaHash; a senha temporária em claro
 * trafega apenas na criação e no reset (nunca é logada).
 */
@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/usuarios")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly menus: MenusService,
  ) {}

  @Get()
  listar() {
    return this.users.listar();
  }

  /**
   * Catálogo de menus para a tela de configuração (OST permissão de menu, Bloco 4). Lido da tabela
   * `menus` (fonte de verdade), então menu novo aparece só rodando o seed, sem deploy da tela.
   * A rota herda o `@Roles` da classe: a configuração é restrita a MASTER/SUPER_ADMIN.
   */
  @Get("menus/catalogo")
  catalogoMenus() {
    return this.menus.catalogo();
  }

  /** Menus atualmente marcados de UM usuário (para a tela de edição). */
  @Get(":id/menus")
  async menusDoUsuario(@Param("id") id: string) {
    return { codigos: [...(await this.menus.codigosDoUsuario(id))] };
  }

  /** Salva a associação USUÁRIO x MENU (substitui o conjunto). Só admin (herda o @Roles da classe). */
  @Put(":id/menus")
  async definirMenus(@Param("id") id: string, @Body() dto: DefinirMenusDto) {
    await this.menus.definirMenusDoUsuario(id, dto.menus);
    return { ok: true, total: dto.menus.length };
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
