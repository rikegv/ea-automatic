import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { UsersService } from "../users/users.service";
import type { AuthUser, RefreshTokenPayload } from "./auth.types";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser> {
    const u = await this.users.findByEmail(email);
    if (!u || !u.ativo) throw new UnauthorizedException("Credenciais inválidas");
    const ok = await argon2.verify(u.senhaHash, password);
    if (!ok) throw new UnauthorizedException("Credenciais inválidas");
    return { id: u.id, email: u.email, papel: u.papel, senhaTemporaria: u.senhaTemporaria };
  }

  async issueTokens(user: AuthUser): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        papel: user.papel,
        senhaTemporaria: user.senhaTemporaria,
        typ: "access",
      },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "900s",
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: "refresh" },
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_TTL") ?? "7d",
      },
    );
    return { accessToken, refreshToken };
  }

  async refresh(
    token: string,
  ): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Sessão expirada");
    }
    if (payload.typ !== "refresh") throw new UnauthorizedException("Token inválido");

    const u = await this.users.findById(payload.sub);
    if (!u || !u.ativo) throw new UnauthorizedException("Usuário inativo");
    const user: AuthUser = {
      id: u.id,
      email: u.email,
      papel: u.papel,
      senhaTemporaria: u.senhaTemporaria,
    };
    const tokens = await this.issueTokens(user);
    return { user, ...tokens };
  }
}
