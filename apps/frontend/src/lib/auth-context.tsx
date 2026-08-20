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
import type { Area, Papel } from "@ea/shared-types";
import {
  apiFetch,
  definirTokenDaSessao,
  registrarGanchosDeSessao,
  renovarSessao,
} from "./api";

/**
 * Folga do REFRESH PROATIVO: renova o access token 60 SEGUNDOS antes do vencimento. O token vive 900s,
 * então a renovação cai por volta dos 14 minutos. A folga é generosa o bastante para absorver relógio
 * defasado e latência de rede, e curta o bastante para não multiplicar chamadas.
 */
const FOLGA_RENOVACAO_MS = 60_000;

/** Ao voltar o foco da aba, renova se faltar menos que isto (a aba pode ter dormido com o timer). */
const FOLGA_AO_VOLTAR_MS = 120_000;

/**
 * Instante de expiração (epoch ms) lido do payload do JWT, SEM verificar assinatura: aqui o token só
 * é usado para AGENDAR a renovação, quem valida de verdade é o backend. `null` quando não dá para ler.
 * §A.6: nada é logado nem persistido, a leitura acontece em memória.
 */
function expiraEm(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  papel: Papel;
  /** Senha temporária ativa (usuário novo ou reset): força a troca antes de usar o app. */
  senhaTemporaria: boolean;
}

/**
 * Menus do usuário (OST permissão de menu). `todos:true` só para o SUPER_ADMIN, que está acima da
 * segmentação de área.
 *
 * A LISTA JÁ VEM RECORTADA PELA ÁREA (segmentação do módulo de A&S): o backend resolve a interseção
 * entre as áreas do usuário e as do menu e devolve só o que ele enxerga. O front NÃO recalcula isso,
 * de propósito: a regra de autorização escrita nos dois lados divergiria, e divergência em permissão
 * é falha de segurança, não inconsistência de tela.
 *
 * Para o MASTER, `todos` deixou de ser `true`: ele recebe a lista dos menus DAS ÁREAS DELE.
 */
export interface MenusSessao {
  todos: boolean;
  codigos: string[];
}

interface AuthState {
  user: SessionUser | null;
  token: string | null;
  loading: boolean;
  /** null enquanto não carregou (chamada a /auth/me). */
  menus: MenusSessao | null;
  /** Áreas do usuário logado. INFORMATIVO (a tela exibe); a autorização vem recortada em `menus`. */
  areas: Area[];
}

interface AuthContextValue extends AuthState {
  /**
   * MASTER ou SUPER_ADMIN. NÃO MUDOU com a segmentação de área, e a preservação é deliberada: este
   * booleano governa DUAS coisas diferentes no sistema, e só uma delas passou a depender de área.
   *
   *  1. visibilidade de MENU e guard de rota: passou a ser assunto do `temMenu` abaixo;
   *  2. visibilidade de RECURSO, sem relação com menu: as correções de Master no modal da Esteira e o
   *     alerta de Diagnóstico. Isso é PAPEL, e papel não mudou.
   *
   * Trocá-lo em bloco quebraria o item 2 em telas já validadas (§A.26). Quem decide menu usa
   * `temMenu`; quem decide recurso continua aqui.
   */
  isAdmin: boolean;
  /** SUPER_ADMIN: o único acima da segmentação de área. */
  isSuperAdmin: boolean;
  /** true se o usuário pode ver/usar o menu de `codigo` (já considerando papel, marcação e ÁREA). */
  temMenu: (codigo: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Troca obrigatória de senha temporária: atualiza token + user (senhaTemporaria=false). */
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type LoginResponse = { accessToken: string; user: SessionUser };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
    menus: null,
    areas: [],
  });

  // Espelha o token corrente num ref para os callbacks estáveis (deps []) sempre lerem o valor
  // atual, sem fechar sobre um `state` defasado. Necessário no `trocarSenha` (senha temporária).
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = state.token;

  // O cliente HTTP precisa enxergar o token corrente para renovar sozinho em 401 (§ OST refresh).
  definirTokenDaSessao(state.token);

  // Ganchos do cliente HTTP: token renovado sem passar por aqui (retry do 401 ou timer proativo)
  // atualiza o estado; sessão encerrada de verdade limpa o estado e leva ao login.
  useEffect(() => {
    registrarGanchosDeSessao({
      aoRenovar: (token, user) =>
        setState((atual) => ({
          user: (user as SessionUser | undefined) ?? atual.user,
          token,
          loading: false,
          menus: atual.menus,
          areas: atual.areas,
        })),
      aoExpirar: () => {
        setState({ user: null, token: null, loading: false, menus: null, areas: [] });
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
      },
    });
    return () => registrarGanchosDeSessao({});
  }, []);

  // Restaura a sessão pelo refresh token (cookie httpOnly) ao montar.
  useEffect(() => {
    apiFetch<LoginResponse>("/auth/refresh", { method: "POST" })
      .then((r) =>
        setState({ user: r.user, token: r.accessToken, loading: false, menus: null, areas: [] }),
      )
      .catch(() => setState({ user: null, token: null, loading: false, menus: null, areas: [] }));
  }, []);

  /**
   * REFRESH PROATIVO. Renova ANTES de vencer, para o usuário nunca chegar a tomar 401 (o retry do
   * cliente HTTP é a rede de segurança, não o caminho normal). Duas frentes:
   *  1. TIMER ancorado no `exp` do token, disparando `FOLGA_RENOVACAO_MS` antes;
   *  2. VOLTA DO FOCO da aba: aba em segundo plano tem timer estrangulado pelo browser, então ao
   *     voltar conferimos quanto falta e renovamos se estiver perto (ou já vencido).
   */
  useEffect(() => {
    if (!state.token) return;
    const venceEm = expiraEm(state.token);
    if (venceEm === null) return;

    const emQuanto = Math.max(0, venceEm - Date.now() - FOLGA_RENOVACAO_MS);
    const timer = setTimeout(() => void renovarSessao(), emQuanto);

    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (venceEm - Date.now() <= FOLGA_AO_VOLTAR_MS) void renovarSessao();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [state.token]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setState({ user: r.user, token: r.accessToken, loading: false, menus: null, areas: [] });
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setState({ user: null, token: null, loading: false, menus: null, areas: [] });
  }, []);

  const trocarSenha = useCallback(async (senhaAtual: string, novaSenha: string) => {
    // /auth/trocar-senha NÃO é @Public, exige o Bearer. Enviamos o token corrente (via ref),
    // senão o backend responde 401 "Token de acesso ausente" no primeiro acesso (senha temporária).
    const r = await apiFetch<LoginResponse>("/auth/trocar-senha", {
      method: "POST",
      body: { senhaAtual, novaSenha },
      token: tokenRef.current ?? undefined,
    });
    setState({ user: r.user, token: r.accessToken, loading: false, menus: null, areas: [] });
  }, []);

  const isAdmin = state.user?.papel === "MASTER" || state.user?.papel === "SUPER_ADMIN";
  const isSuperAdmin = state.user?.papel === "SUPER_ADMIN";

  // Carrega os MENUS do usuário assim que há sessão (OST permissão de menu). O login/refresh só
  // trazem o `user`; os menus vêm do /auth/me. Recarrega quando o usuário muda (troca de conta).
  useEffect(() => {
    const uid = state.user?.id;
    if (!uid || !state.token) return;
    let vivo = true;
    apiFetch<{ menus: MenusSessao; areas?: Area[] }>("/auth/me", { token: state.token })
      .then((r) => {
        if (vivo && r?.menus)
          setState((atual) => ({ ...atual, menus: r.menus, areas: r.areas ?? [] }));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [state.user?.id, state.token]);

  /**
   * O BYPASS AQUI É SÓ DO SUPER_ADMIN, e não mais do admin em geral. É a tradução exata do backend: o
   * MASTER deixou de ver tudo e passou a ver os menus da área dele, que já chegam prontos em
   * `state.menus.codigos`. Nada de área é calculado nesta função.
   */
  const temMenu = useCallback(
    (codigo: string): boolean => {
      if (isSuperAdmin) return true; // acima da segmentação, coerente com o backend.
      if (!state.menus) return false; // ainda carregando: não mostra a mais.
      return state.menus.todos || state.menus.codigos.includes(codigo);
    },
    [isSuperAdmin, state.menus],
  );

  return (
    <AuthContext.Provider
      value={{ ...state, isAdmin, isSuperAdmin, temMenu, login, logout, trocarSenha }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
