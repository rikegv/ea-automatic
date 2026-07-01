import type { Papel } from "@ea/shared-types";

/** Usuário autenticado anexado ao request pelo JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  papel: Papel;
  /** true enquanto a senha for temporária (criação/reset pelo admin) — força a troca (OST). */
  senhaTemporaria: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  papel: Papel;
  senhaTemporaria: boolean;
  typ: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  typ: "refresh";
}
