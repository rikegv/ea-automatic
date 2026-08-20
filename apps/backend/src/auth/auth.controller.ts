import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AREA } from "@ea/shared-types";
import { TODOS_CODIGOS_MENU, filtrarMenusPorPapel } from "../domain/menus";
import { MenuAreasService } from "./menu-areas.service";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import { MenusService } from "./menus.service";
import type { AuthUser } from "./auth.types";
import { CurrentUser, PermiteSenhaTemporaria, Public } from "./decorators";
import { LoginDto, TrocarSenhaDto } from "./dto";

const REFRESH_COOKIE = "ea_refresh";
const REFRESH_PATH = "/api/auth";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly menus: MenusService,
    private readonly menuAreas: MenuAreasService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateUser(dto.email, dto.password);
    const { accessToken, refreshToken } = await this.auth.issueTokens(user);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException("Sessão expirada");
    const { user, accessToken, refreshToken } = await this.auth.refresh(token);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  // Autenticado + liberado a quem ainda tem senha temporária (para conseguir sair na 1ª tela).
  @PermiteSenhaTemporaria()
  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { ok: true };
  }

  /**
   * Liberado a quem tem senha temporária: o front lê user.senhaTemporaria para redirecionar à troca.
   * Devolve os MENUS do usuário (OST permissão de menu), que a sidebar e o guard de rota consomem.
   *
   * A SEGMENTAÇÃO DE ÁREA É RESOLVIDA AQUI, NO BACKEND, e a lista já sai RECORTADA. Foi a escolha de
   * desenho mais importante desta parte: a alternativa era mandar as áreas cruas e o front cruzar com
   * um mapa `menu -> áreas` próprio, ou seja, a regra de autorização escrita DUAS vezes, em dois
   * repositórios, livre para divergir. Divergência em permissão não é inconsistência de tela, é falha
   * de segurança. Assim o front não sabe o que é área: ele recebe códigos e os mostra.
   *
   * QUEM RECEBE O QUÊ:
   *  - SUPER_ADMIN: `todos: true`. Está acima da segmentação, não depende de marcação nem de área.
   *  - MASTER: a lista de TODOS os menus das áreas dele. Deixou de ser `todos: true`, porque o papel
   *    deixou de significar "vê tudo" e passou a significar "manda na minha área".
   *  - COMUM: os menus marcados, cortados pelas áreas dele.
   *
   * O `MENU_SEMPRE_VISIVEL` NÃO é aplicado aqui, e a ausência é deliberada (§A.14). Ele é código
   * declarado e nunca consumido: ligá-lo agora daria o Início a um COMUM que hoje não tem menu
   * nenhum, ou seja, mudaria o comportamento no ar de um usuário real sem a OST pedir. A virada de
   * área tinha de ser IDENTIDADE, e é. Se o diretor quiser corrigir a barra vazia, é decisão dele, em
   * OST própria.
   *
   * `areas` viaja junto só como INFORMAÇÃO (a tela mostra a área de quem está logado); a autorização
   * não depende dela do lado do front.
   */
  @PermiteSenhaTemporaria()
  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    if (user.papel === "SUPER_ADMIN") {
      return { user, menus: { todos: true as const, codigos: [] as string[] }, areas: [...AREA] };
    }

    const { codigos, areas } = await this.menus.permissaoDoUsuario(user.id);
    const base = user.papel === "MASTER" ? TODOS_CODIGOS_MENU : [...codigos];

    return {
      user,
      // DOIS TETOS, e os dois entram: a ÁREA (o menu pertence ao que a pessoa faz?) e o PAPEL (o
      // menu é exclusivo do SUPER_ADMIN?). O segundo é o que tira a tela de Usuários da barra do
      // Master, que já tomava 403 nela e não tinha por que enxergá-la.
      menus: {
        todos: false as const,
        // O TETO DE ÁREA vem da TABELA (fonte viva): o menu que o diretor acabou de remarcar já entra
        // ou sai daqui na carga seguinte da tela, sem restart e sem o usuário relogar.
        codigos: filtrarMenusPorPapel(await this.menuAreas.filtrar(base, areas), user.papel),
      },
      areas: [...areas],
    };
  }

  /**
   * Troca de senha do próprio usuário (OST). Liberada a quem tem senha temporária (é justamente a
   * rota do primeiro acesso). Verifica a senha atual, grava a nova, limpa a flag e REEMITE tokens
   * (novo cookie de refresh + accessToken) com senhaTemporaria=false.
   */
  @PermiteSenhaTemporaria()
  @Post("trocar-senha")
  @HttpCode(200)
  async trocarSenha(
    @Body() dto: TrocarSenhaDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.users.trocarSenha(user.id, dto.senhaAtual, dto.novaSenha);
    const atualizado: AuthUser = { ...user, senhaTemporaria: false };
    const { accessToken, refreshToken } = await this.auth.issueTokens(atualizado);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user: atualizado };
  }

  private setRefreshCookie(res: Response, token: string): void {
    const secure = this.config.get<string>("COOKIE_SECURE") === "true";
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: REFRESH_PATH,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
