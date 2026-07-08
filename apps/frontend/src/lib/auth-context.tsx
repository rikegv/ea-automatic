"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Papel } from "@ea/shared-types";
import { apiFetch } from "./api";

export interface SessionUser {
  id: string;
  email: string;
  papel: Papel;
  /** Senha temporária ativa (usuário novo ou reset): força a troca antes de usar o app. */
  senhaTemporaria: boolean;
}

interface AuthState {
  user: SessionUser | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Troca obrigatória de senha temporária: atualiza token + user (senhaTemporaria=false). */
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type LoginResponse = { accessToken: string; user: SessionUser };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true });

  // Espelha o token corrente num ref para os callbacks estáveis (deps []) sempre lerem o valor
  // atual, sem fechar sobre um `state` defasado. Necessário no `trocarSenha` (senha temporária).
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = state.token;

  // Restaura a sessão pelo refresh token (cookie httpOnly) ao montar.
  useEffect(() => {
    apiFetch<LoginResponse>("/auth/refresh", { method: "POST" })
      .then((r) => setState({ user: r.user, token: r.accessToken, loading: false }))
      .catch(() => setState({ user: null, token: null, loading: false }));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setState({ user: r.user, token: r.accessToken, loading: false });
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setState({ user: null, token: null, loading: false });
  }, []);

  const trocarSenha = useCallback(async (senhaAtual: string, novaSenha: string) => {
    // /auth/trocar-senha NÃO é @Public, exige o Bearer. Enviamos o token corrente (via ref),
    // senão o backend responde 401 "Token de acesso ausente" no primeiro acesso (senha temporária).
    const r = await apiFetch<LoginResponse>("/auth/trocar-senha", {
      method: "POST",
      body: { senhaAtual, novaSenha },
      token: tokenRef.current ?? undefined,
    });
    setState({ user: r.user, token: r.accessToken, loading: false });
  }, []);

  const isAdmin = state.user?.papel === "MASTER" || state.user?.papel === "SUPER_ADMIN";

  return (
    <AuthContext.Provider value={{ ...state, isAdmin, login, logout, trocarSenha }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
