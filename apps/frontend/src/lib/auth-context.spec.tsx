// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";

/**
 * Regressão (bug "Token de acesso ausente" no 1º acesso): `trocarSenha` precisa enviar o Bearer
 * corrente — /auth/trocar-senha NÃO é @Public. Antes o token era omitido → 401 no primeiro login
 * dos usuários com senha temporária. Aqui mockamos o fetch e conferimos o header Authorization.
 */
type Call = { url: string; init: RequestInit };

function mockFetch(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      calls.push({ url: u, init });
      // /auth/refresh no mount → sem sessão (rejeita para o AuthProvider marcar "deslogado").
      if (u.endsWith("/auth/refresh")) {
        return { ok: false, status: 401, text: async () => JSON.stringify({ message: "sem sessão" }) };
      }
      if (u.endsWith("/auth/login")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              accessToken: "TOKEN-LOGIN",
              user: { id: "u1", email: "a@b.c", papel: "SUPER_ADMIN", senhaTemporaria: true },
            }),
        };
      }
      if (u.endsWith("/auth/trocar-senha")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              accessToken: "TOKEN-NOVO",
              user: { id: "u1", email: "a@b.c", papel: "SUPER_ADMIN", senhaTemporaria: false },
            }),
        };
      }
      return { ok: true, status: 200, text: async () => "null" };
    }) as unknown as typeof fetch,
  );
  return calls;
}

const authHeader = (init: RequestInit) =>
  (init.headers as Record<string, string> | undefined)?.["Authorization"];

describe("AuthProvider.trocarSenha (regressão: envia o Bearer corrente)", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("após login, trocarSenha envia Authorization com o token corrente", async () => {
    const calls = mockFetch();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    // Espera o refresh de montagem resolver (sem sessão).
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Login: recebe e guarda o token (senha temporária = true).
    await act(async () => {
      await result.current.login("a@b.c", "senha");
    });
    expect(result.current.token).toBe("TOKEN-LOGIN");
    expect(result.current.user?.senhaTemporaria).toBe(true);

    // Troca de senha: DEVE carregar o Bearer corrente.
    await act(async () => {
      await result.current.trocarSenha("temp", "NovaSenha123");
    });

    const trocar = calls.find((c) => c.url.endsWith("/auth/trocar-senha"));
    expect(trocar, "chamada a /auth/trocar-senha deve existir").toBeTruthy();
    expect(authHeader(trocar!.init)).toBe("Bearer TOKEN-LOGIN");

    // E o estado atualiza com o novo token + flag limpa.
    expect(result.current.token).toBe("TOKEN-NOVO");
    expect(result.current.user?.senhaTemporaria).toBe(false);
  });

  it("o login em si não deve exigir/enviar Authorization (é público)", async () => {
    const calls = mockFetch();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.login("a@b.c", "senha");
    });
    const login = calls.find((c) => c.url.endsWith("/auth/login"));
    expect(authHeader(login!.init)).toBeUndefined();
  });
});
