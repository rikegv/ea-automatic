import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { MenusService } from "../auth/menus.service";
import { codigosPadraoDoPapel } from "../domain/menus";
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

  /**
   * Salva a associação USUÁRIO x MENU. Só admin (herda o @Roles da classe). Passa o papel do alvo
   * para o service filtrar os menus bloqueados para COMUM (Diagnóstico/Usuários).
   *
   * NÃO substitui mais o conjunto inteiro: a tela declara em `conhecidos` o catálogo que exibiu, e a
   * remoção acontece só dentro desse escopo. Menu que nasceu depois de a página carregar é
   * preservado em vez de apagado em silêncio, que foi o defeito que sumiu com o `assinaturas` e
   * depois com o `assinante-empresa`. O total preservado volta na resposta, para não ser invisível.
   */
  @Put(":id/menus")
  async definirMenus(@Param("id") id: string, @Body() dto: DefinirMenusDto) {
    // Sem o escopo declarado não dá para saber o que a tela podia remover, e adivinhar é justamente o
    // que apagava menu novo. Uma aba antiga leva erro VISÍVEL pedindo recarga, em vez de remoção
    // silenciosa. A mensagem é uma só, para o consultor entender o que fazer.
    if (!dto.conhecidos || dto.conhecidos.length === 0) {
      throw new BadRequestException(
        "Recarregue a página de usuários e salve de novo: esta aba está desatualizada e não sabe quais menus existem hoje.",
      );
    }
    const alvo = await this.users.findById(id);
    const { aplicados, preservados } = await this.menus.salvarSelecaoDaTela(
      id,
      dto.menus,
      dto.conhecidos,
      alvo?.papel,
    );
    return { ok: true, total: aplicados.length, preservados: preservados.length };
  }

  @Post()
  async criar(@Body() dto: CriarUsuarioDto) {
    const res = await this.users.criar(dto);
    // Novo usuário nasce com o PADRÃO do papel (decisão do diretor, 24/07/2026): o COMUM enxerga toda
    // a Operação por padrão, em vez de nascer sem menu nenhum. Administração segue concessão pontual.
    await this.menus.definirMenusDoUsuario(
      res.usuario.id,
      codigosPadraoDoPapel(dto.papel),
      dto.papel,
    );
    return res;
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
