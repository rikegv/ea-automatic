import { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PandapeApiService } from "./pandape-api.service";

/** ConfigService mínimo que devolve o mapa informado. */
function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

/** Credenciais OAuth válidas (não-vazias) para ativar o serviço. */
function comCredenciais(over: Record<string, string | undefined> = {}): ConfigService {
  return config({
    PANDAPE_CLIENT_ID: "client-abc",
    PANDAPE_CLIENT_SECRET: "secret-xyz",
    ...over,
  });
}

/**
 * Mock de `fetch` que roteia por URL: o endpoint de token (`/connect/token`) devolve um
 * `access_token`; qualquer outra URL devolve `apiBody`. Registra as chamadas para inspeção.
 */
function fetchRouter(opts: {
  tokens?: Array<{ access_token: string; expires_in: number }>;
  tokenStatus?: number;
  apiBody?: unknown;
  apiStatus?: number;
}) {
  const tokens = [...(opts.tokens ?? [{ access_token: "TKN-1", expires_in: 3600 }])];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("/connect/token")) {
      const status = opts.tokenStatus ?? 200;
      const tok = tokens.shift() ?? tokens[0] ?? { access_token: "TKN-1", expires_in: 3600 };
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ token_type: "Bearer", scope: "PandapeApi", ...tok }),
      } as unknown as Response;
    }
    const status = opts.apiStatus ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => opts.apiBody ?? {},
    } as unknown as Response;
  });
  return { fn, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PandapeApiService — inércia sem credenciais OAuth (§A.5/§A.9)", () => {
  it("estaAtivo() é false sem client_id/secret e não toca a rede (nem o endpoint de token)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const svc = new PandapeApiService(config({ PANDAPE_CLIENT_ID: "", PANDAPE_CLIENT_SECRET: "" }));

    expect(svc.estaAtivo()).toBe(false);
    await expect(svc.getPrecollaborator("x")).resolves.toBeUndefined();
    await expect(svc.getMatch("m")).resolves.toBeUndefined();
    await expect(svc.getVacancy("v")).resolves.toBeUndefined();
    await expect(svc.listarVagas()).resolves.toEqual([]);
    await expect(svc.listarClientes()).resolves.toEqual([]);
    await expect(svc.listarMudancas()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("inerte se faltar SÓ o secret (client_id presente, secret vazio)", () => {
    const svc = new PandapeApiService(config({ PANDAPE_CLIENT_ID: "abc", PANDAPE_CLIENT_SECRET: "" }));
    expect(svc.estaAtivo()).toBe(false);
  });

  it("loga a inércia UMA única vez (flag anti-spam)", async () => {
    const svc = new PandapeApiService(
      config({ PANDAPE_CLIENT_ID: undefined, PANDAPE_CLIENT_SECRET: undefined }),
    );
    const warn = vi
      .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
      .mockImplementation(() => undefined);

    await svc.getPrecollaborator("a");
    await svc.getMatch("b");
    await svc.getVacancy("c");
    await svc.listarMudancas();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "Pandapé inerte: PANDAPE_CLIENT_ID/PANDAPE_CLIENT_SECRET ausentes",
    );
  });

  it("estaAtivo() é true quando client_id E secret estão presentes", () => {
    expect(new PandapeApiService(comCredenciais()).estaAtivo()).toBe(true);
  });
});

describe("PandapeApiService — OAuth client_credentials (cache + refresh + Bearer)", () => {
  it("emite o token no /connect/token (form-urlencoded) e usa Bearer na chamada de API", async () => {
    const { fn, calls } = fetchRouter({
      tokens: [{ access_token: "TKN-1", expires_in: 3600 }],
      apiBody: { idPreCollaborator: "PC-1" },
    });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    const pc = await svc.getPrecollaborator("PC-1");
    expect(pc).toMatchObject({ idPreCollaborator: "PC-1" });

    // 1ª chamada: token; 2ª: API.
    const tokenCall = calls.find((c) => c.url.includes("/connect/token"));
    expect(tokenCall?.init?.method).toBe("POST");
    expect((tokenCall?.init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = String(tokenCall?.init?.body);
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("scope=PandapeApi");

    const apiCall = calls.find((c) => c.url.includes("/v1/PreCollaborator/Get"));
    expect((apiCall?.init?.headers as Record<string, string>).Authorization).toBe("Bearer TKN-1");
  });

  it("cacheia o token: 3 chamadas de API → o /connect/token é chamado UMA vez só", async () => {
    const { fn, calls } = fetchRouter({ apiBody: {} });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    await svc.getPrecollaborator("PC-1");
    await svc.getMatch("M-1");
    await svc.listarClientes();

    const tokenCalls = calls.filter((c) => c.url.includes("/connect/token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("compartilha UMA emissão em voo: chamadas concorrentes → 1 fetch de token (anti-corrida)", async () => {
    const { fn, calls } = fetchRouter({ apiBody: {} });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    await Promise.all([svc.getPrecollaborator("A"), svc.getPrecollaborator("B"), svc.getMatch("C")]);

    expect(calls.filter((c) => c.url.includes("/connect/token"))).toHaveLength(1);
  });

  it("renova o token quando expira (reusa enquanto válido, reemite após a margem)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));
    const { fn, calls } = fetchRouter({
      tokens: [
        { access_token: "TKN-1", expires_in: 3600 },
        { access_token: "TKN-2", expires_in: 3600 },
      ],
      apiBody: {},
    });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    const ultimoBearer = (): string | undefined => {
      const apiCalls = calls.filter((c) => c.url.includes("/v1/"));
      const last = apiCalls[apiCalls.length - 1];
      return (last?.init?.headers as Record<string, string> | undefined)?.Authorization;
    };

    await svc.getPrecollaborator("PC-1"); // emite TKN-1
    await svc.getPrecollaborator("PC-1"); // ainda válido → reusa
    expect(calls.filter((c) => c.url.includes("/connect/token"))).toHaveLength(1);
    expect(ultimoBearer()).toBe("Bearer TKN-1");

    // avança além do expires_in (1h) + margem → força a renovação.
    vi.setSystemTime(new Date("2026-06-30T13:30:00Z"));
    await svc.getPrecollaborator("PC-1"); // expirou → emite TKN-2

    expect(calls.filter((c) => c.url.includes("/connect/token"))).toHaveLength(2);
    expect(ultimoBearer()).toBe("Bearer TKN-2");
  });

  it("erro na emissão do token → loga SÓ o status (nunca secret/token) e a chamada vira no-op", async () => {
    const { fn } = fetchRouter({ tokenStatus: 401, apiBody: {} });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais({ PANDAPE_CLIENT_SECRET: "super-secreto-123" }));
    const errorSpy = vi
      .spyOn((svc as unknown as { logger: { error: (m: string) => void } }).logger, "error")
      .mockImplementation(() => undefined);

    await expect(svc.getPrecollaborator("PC-1")).resolves.toBeUndefined();

    // logou o status do token, mas NUNCA o secret nem o access_token (§A.6).
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("401");
    expect(logged).not.toContain("super-secreto-123");
    expect(logged).not.toContain("TKN");
  });

  it("NUNCA loga client_secret nem access_token em uma chamada bem-sucedida (§A.6)", async () => {
    const { fn } = fetchRouter({
      tokens: [{ access_token: "ACCESS-TOKEN-SENSIVEL", expires_in: 3600 }],
      apiBody: { idPreCollaborator: "PC-1" },
    });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais({ PANDAPE_CLIENT_SECRET: "secret-sensivel" }));
    const logger = (svc as unknown as { logger: Record<string, (m: unknown) => void> }).logger;
    const calls: unknown[][] = [];
    for (const lvl of ["log", "warn", "error", "debug", "verbose"]) {
      vi.spyOn(logger, lvl as keyof typeof logger).mockImplementation((...a: unknown[]) => {
        calls.push(a);
      });
    }

    await svc.getPrecollaborator("PC-1");

    const logged = JSON.stringify(calls);
    expect(logged).not.toContain("secret-sensivel");
    expect(logged).not.toContain("ACCESS-TOKEN-SENSIVEL");
  });
});

describe("PandapeApiService — endpoints v1 (sem /v3)", () => {
  beforeEach(() => undefined);

  it("getPrecollaborator chama /v1/PreCollaborator/Get?idPreCollaborator=", async () => {
    const { fn, calls } = fetchRouter({ apiBody: { idPreCollaborator: "PC-9" } });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    await svc.getPrecollaborator("PC-9");

    expect(calls.some((c) => c.url.endsWith("/v1/PreCollaborator/Get?idPreCollaborator=PC-9"))).toBe(
      true,
    );
    expect(calls.some((c) => c.url.includes("/v3/"))).toBe(false);
  });

  it("getMatch chama /v1/Match/Get?idMatch= e devolve o CPF (fonte do CPF)", async () => {
    const { fn, calls } = fetchRouter({ apiBody: { idMatch: 7, cpf: "52998224725", phone: "11999" } });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    const match = await svc.getMatch("7");
    expect(match).toMatchObject({ cpf: "52998224725" });
    expect(calls.some((c) => c.url.endsWith("/v1/Match/Get?idMatch=7"))).toBe(true);
  });

  it("getVacancy lista (/v1/Vacancy/List) e filtra por idVacancy (não há get-by-id)", async () => {
    const { fn, calls } = fetchRouter({
      apiBody: [
        { idVacancy: 1, job: "Operador" },
        { idVacancy: 2, job: "Analista" },
      ],
    });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    const vaga = await svc.getVacancy("2");
    expect(vaga).toMatchObject({ idVacancy: 2, job: "Analista" });
    expect(calls.some((c) => c.url.includes("/v1/Vacancy/List"))).toBe(true);
  });

  it("listarClientes chama /v1/Client/List", async () => {
    const { fn, calls } = fetchRouter({ apiBody: [{ idClient: 16, cif: "12345678000190" }] });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    const clientes = await svc.listarClientes();
    expect(clientes[0]).toMatchObject({ cif: "12345678000190" });
    expect(calls.some((c) => c.url.endsWith("/v1/Client/List"))).toBe(true);
  });

  it("listarMudancas retorna [] (discovery não existe na API v1) sem chamar a rede", async () => {
    const { fn, calls } = fetchRouter({ apiBody: [] });
    vi.stubGlobal("fetch", fn);
    const svc = new PandapeApiService(comCredenciais());

    await expect(svc.listarMudancas()).resolves.toEqual([]);
    // não emite token nem chama endpoint de discovery (não há).
    expect(calls).toHaveLength(0);
  });
});
