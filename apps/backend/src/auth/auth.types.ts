import type { Papel } from "@ea/shared-types";

/** Usuário autenticado anexado ao request pelo JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  papel: Papel;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  papel: Papel;
  typ: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  typ: "refresh";
}
