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
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
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

  // Liberado a quem tem senha temporária: o front lê user.senhaTemporaria para redirecionar à troca.
  @PermiteSenhaTemporaria()
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { user };
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
