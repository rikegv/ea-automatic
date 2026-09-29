import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { GiApiService } from "./gi-api.service";
import type { FuncionarioSelecao } from "../domain/portal-dados-gi";

/**
 * CLIENTE HTTP DO GI: a auth de 2 etapas, o cache de token, o UA de navegador e o fail-closed.
 * Sem rede: `fetch` é mockado. §A.6: nenhuma credencial/valor entra em teste como dado real.
 */

const CRED = {
  GI_API_URL: "https://gi.example.com/api/v1",
  GI_ID_CLIENTE_WEB: "cw-1",
  GI_CHAVE_ACESSO: "chave-1",
  GI_LOGIN: "login-1",
  GI_SENHA: "senha-1",
};

function svc(env: Record<string, string>): GiApiService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new GiApiService(config);
}

function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GiApiService: fail-closed sem credencial", () => {
  it("configurado() e false sem os quatro campos", () => {
    expect(svc({ GI_API_URL: CRED.GI_API_URL }).configurado()).toBe(false);
    expect(svc({ ...CRED, GI_SENHA: "" }).configurado()).toBe(false);
  });

  it("configurado() e true com URL + os quatro campos", () => {
    expect(svc(CRED).configurado()).toBe(true);
  });

  it("inerte: obterToken nao toca a rede", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const token = await svc({}).obterToken();
    expect(token).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("inerte: criarFuncionarioSelecao devolve INERTE e nao toca a rede", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await svc({}).criarFuncionarioSelecao({} as FuncionarioSelecao);
    expect(r).toEqual({ ok: false, motivo: "INERTE" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("GiApiService: auth de 2 etapas", () => {
  it("VerificaConexao (token1) depois Login (Bearer token1) -> token2", async () => {
    const chamadas: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({
        url,
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      });
      if (url.endsWith("/Conexao/VerificaConexao")) return jsonRes({ value: "TOKEN1" });
      if (url.endsWith("/Login/Login")) return jsonRes({ value: "TOKEN2" });
      throw new Error(`url inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const token = await svc(CRED).obterToken();
    expect(token).toBe("TOKEN2");
    expect(chamadas).toHaveLength(2);

    // Etapa 1: sem Authorization, com IDClienteWeb/ChaveAcesso no corpo.
    expect(chamadas[0].url).toBe(`${CRED.GI_API_URL}/Conexao/VerificaConexao`);
    expect(chamadas[0].headers.Authorization).toBeUndefined();
    expect(chamadas[0].body).toContain("cw-1");
    expect(chamadas[0].body).toContain("chave-1");

    // Etapa 2: Authorization Bearer TOKEN1, com login/senha no corpo.
    expect(chamadas[1].url).toBe(`${CRED.GI_API_URL}/Login/Login`);
    expect(chamadas[1].headers.Authorization).toBe("Bearer TOKEN1");
    expect(chamadas[1].body).toContain("login-1");
  });

  it("toda chamada leva User-Agent de navegador e Accept json (Cloudflare 1010)", async () => {
    const fetchSpy = vi.fn(async (url: string, _init: RequestInit) =>
      url.endsWith("/Conexao/VerificaConexao") ? jsonRes({ value: "T1" }) : jsonRes({ value: "T2" }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await svc(CRED).obterToken();
    for (const call of fetchSpy.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers["User-Agent"]).toMatch(/Mozilla/);
      expect(headers.Accept).toBe("application/json");
    }
  });

  it("cacheia o token2: a segunda chamada nao re-autentica", async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      url.endsWith("/Conexao/VerificaConexao") ? jsonRes({ value: "T1" }) : jsonRes({ value: "T2" }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const s = svc(CRED);
    await s.obterToken();
    await s.obterToken();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 2 etapas, uma vez só
  });

  it("etapa 1 falha (sem value): token undefined, nao chama a etapa 2", async () => {
    const fetchSpy = vi.fn(async () => jsonRes({}, 200));
    vi.stubGlobal("fetch", fetchSpy);
    const token = await svc(CRED).obterToken();
    expect(token).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("etapa 1 HTTP 403 (Cloudflare): token undefined", async () => {
    const fetchSpy = vi.fn(async () => jsonRes({ erro: "1010" }, 403));
    vi.stubGlobal("fetch", fetchSpy);
    const token = await svc(CRED).obterToken();
    expect(token).toBeUndefined();
  });
});

describe("GiApiService: criacao (construida, so exercitada aqui, nao no fluxo da entrega)", () => {
  it("POST no path de criacao com Bearer token2 e devolve o id", async () => {
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/Conexao/VerificaConexao")) return jsonRes({ value: "T1" });
      if (url.endsWith("/Login/Login")) return jsonRes({ value: "T2" });
      // criacao
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer T2");
      expect(init.method).toBe("POST");
      return jsonRes({ value: "FS-99" }, 201);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const r = await svc(CRED).criarFuncionarioSelecao({ cpf: "39053344705" } as FuncionarioSelecao);
    expect(r).toEqual({ ok: true, funcionarioSelecaoId: "FS-99" });
  });

  it("criacao HTTP 500: ok:false com status", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith("/Conexao/VerificaConexao")) return jsonRes({ value: "T1" });
      if (url.endsWith("/Login/Login")) return jsonRes({ value: "T2" });
      return jsonRes({}, 500);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const r = await svc(CRED).criarFuncionarioSelecao({} as FuncionarioSelecao);
    expect(r).toEqual({ ok: false, motivo: "HTTP", status: 500 });
  });
});
