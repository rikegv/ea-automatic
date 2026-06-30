import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClicksignApiService } from "./clicksign-api.service";

/** ConfigService mínimo que devolve o mapa informado. */
function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe("ClicksignApiService — inércia sem token (§A.5)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("estaAtivo() é false sem CLICKSIGN_API_TOKEN e NUNCA toca a rede", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "" }));

    expect(svc.estaAtivo()).toBe(false);
    await expect(svc.criarEnvelope("x")).resolves.toBeUndefined();
    await expect(
      svc.anexarDocumento("e", { filename: "k.pdf", conteudo: Buffer.from("x") }),
    ).resolves.toBeUndefined();
    await expect(
      svc.adicionarSigner("e", { nome: "n", email: "a@b.c", cpf: "11144477735" }),
    ).resolves.toBeUndefined();
    await expect(svc.consultarStatus("e")).resolves.toBeUndefined();
    await expect(svc.obterUrlAssinado("e")).resolves.toBeUndefined();
    await expect(svc.criarRequirement("e", { documentId: "d", signerId: "s" })).resolves.toBeUndefined();
    await expect(svc.ativarEnvelope("e")).resolves.toBeUndefined();
    await expect(svc.cancelarEnvelope("e")).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loga a inércia UMA única vez (flag anti-spam)", async () => {
    const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: undefined }));
    const warn = vi
      .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
      .mockImplementation(() => undefined);

    await svc.criarEnvelope("a");
    await svc.consultarStatus("b");
    await svc.obterUrlAssinado("c");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Clicksign inerte: CLICKSIGN_API_TOKEN ausente");
  });

  it("estaAtivo() é true quando o token está presente", () => {
    const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "tok-123" }));
    expect(svc.estaAtivo()).toBe(true);
  });
});

describe("ClicksignApiService — shapes confirmados no sandbox", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Captura a chamada fetch e devolve uma resposta JSON:API mockada. */
  function comFetch(json: unknown, status = 201) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    } as unknown as Response);
  }

  it("adicionarSigner MASCARA o CPF cru (000.000.000-00) e usa Authorization cru (sem Bearer)", async () => {
    const svc = new ClicksignApiService(
      config({ CLICKSIGN_API_TOKEN: "tok", CLICKSIGN_API_BASE_URL: "https://x/api/v3" }),
    );
    const spy = comFetch({ data: { id: "sig-1" } });

    const r = await svc.adicionarSigner("env-1", {
      nome: "Fulano",
      email: "f@e.com",
      cpf: "11144477735",
    });

    expect(r).toEqual({ id: "sig-1" });
    const [, init] = spy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("tok"); // token cru, sem "Bearer"
    expect(headers["Content-Type"]).toBe("application/vnd.api+json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.data.attributes.documentation).toBe("111.444.777-35");
    // O CPF cru jamais aparece no corpo enviado.
    expect((init as RequestInit).body).not.toContain("11144477735");
  });

  it("criarEnvelope devolve {id} a partir de data.id", async () => {
    const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "tok" }));
    comFetch({ data: { id: "env-9", attributes: { status: "draft" } } });
    await expect(svc.criarEnvelope("Contrato - X")).resolves.toEqual({ id: "env-9" });
  });

  it("consultarStatus lê data.attributes.status", async () => {
    const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "tok" }));
    comFetch({ data: { attributes: { status: "running" } } }, 200);
    await expect(svc.consultarStatus("env-1")).resolves.toEqual({ status: "running" });
  });

  it("obterUrlAssinado lê data[0].links.files.original e NÃO loga a URL", async () => {
    const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "tok" }));
    const url = "https://s3/contrato.pdf?X-Amz-Expires=300";
    comFetch({ data: [{ links: { files: { original: url } } }] }, 200);
    const errSpy = vi
      .spyOn((svc as unknown as { logger: { error: (m: string) => void } }).logger, "error")
      .mockImplementation(() => undefined);

    await expect(svc.obterUrlAssinado("env-1")).resolves.toBe(url);
    for (const c of errSpy.mock.calls) expect(String(c[0])).not.toContain("s3");
  });
});
