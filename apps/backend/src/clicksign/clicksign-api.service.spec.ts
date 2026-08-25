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
    await expect(
      svc.criarRequirement("e", { documentId: "d", signerId: "s" }),
    ).resolves.toBeUndefined();
    await expect(svc.ativarEnvelope("e")).resolves.toBeUndefined();
    await expect(svc.notificarEnvelope("e")).resolves.toBeUndefined();
    // `cancelarEnvelope` passou a devolver SE o provedor aceitou. Inerte nunca cancela nada, então
    // false, que é o mesmo que a tela precisa saber: a notificação não saiu.
    await expect(svc.cancelarEnvelope("e")).resolves.toBe(false);

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

  /**
   * Captura a chamada fetch e devolve uma resposta JSON:API mockada.
   *
   * O `headers` é obrigatório: o limitador de ritmo lê `x-rate-limit-remaining` e
   * `x-rate-limit-reset` de TODA resposta (`domain/clicksign-rate`). Sem eles o mock não pareceria
   * uma Response de verdade. Os valores padrão simulam folga confortável, para estes testes de shape
   * não virarem testes de espera; o ritmo tem os próprios testes.
   */
  function comFetch(json: unknown, status = 201, rate: Record<string, string> = {}) {
    const headers = new Headers({
      "x-rate-limit": "50",
      "x-rate-limit-remaining": "49",
      ...rate,
    });
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers,
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

  /**
   * Shape levantado contra a PRODUÇÃO em 25/08/2026: o POST devolve 201 com
   * `data.attributes.summary[] = [{ signer_id, notified }]`. Com grupos sequenciais o summary traz
   * só o grupo corrente (o funcionário), não todos os signatários do envelope.
   */
  it("notificarEnvelope manda o corpo JSON:API e conta quem foi notificado", async () => {
    const svc = new ClicksignApiService(
      config({ CLICKSIGN_API_TOKEN: "tok", CLICKSIGN_API_BASE_URL: "https://x/api/v3" }),
    );
    const spy = comFetch({
      data: {
        type: "notifications",
        attributes: {
          summary: [
            { signer_id: "s-1", notified: true },
            { signer_id: "s-2", notified: false },
          ],
        },
      },
    });

    await expect(svc.notificarEnvelope("env-1")).resolves.toEqual({ notificados: 1, total: 2 });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://x/api/v3/envelopes/env-1/notifications");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      data: { type: "notifications", attributes: {} },
    });
  });

  it("notificarEnvelope sem summary devolve zero, em vez de estourar", async () => {
    const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "tok" }));
    comFetch({ data: { attributes: {} } });
    await expect(svc.notificarEnvelope("env-1")).resolves.toEqual({ notificados: 0, total: 0 });
  });

  /**
   * O 429 era tratado como erro genérico e caía no backoff cego de 5s do BullMQ, que pode recair na
   * MESMA janela cheia. Agora a espera é cronometrada pelo `x-rate-limit-reset` do provedor, dentro
   * do próprio cliente, e a chamada se recupera sozinha sem gastar tentativa da fila.
   */
  /** Resposta 429 com os headers de rate, para os testes de retentativa. */
  function resposta429(resetSeg: number): Response {
    return {
      ok: false,
      status: 429,
      headers: new Headers({
        "x-rate-limit-remaining": "0",
        "x-rate-limit-reset": String(resetSeg),
      }),
      json: async () => ({}),
    } as unknown as Response;
  }

  it("429 retenta UMA vez esperando o reset do provedor, e a segunda resposta vale", async () => {
    // Timers falsos: a espera real é de segundos e o que importa provar é o COMPORTAMENTO, não a
    // paciência da suíte. Sem isto o teste dormiria de verdade a cada execução.
    vi.useFakeTimers();
    try {
      const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "tok" }));
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(resposta429(Math.floor(Date.now() / 1000) + 6))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "x-rate-limit-remaining": "49" }),
          json: async () => ({ data: { attributes: { status: "running" } } }),
        } as unknown as Response);

      const promessa = svc.consultarStatus("env-1");
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(promessa).resolves.toEqual({ status: "running" });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("429 PERSISTENTE não vira laço infinito: retenta uma vez e lança", async () => {
    // A recuperação é do cliente; a insistência é da fila. Sem este limite, uma janela cronicamente
    // cheia seguraria a conexão para sempre em vez de devolver o problema para o backoff do BullMQ.
    vi.useFakeTimers();
    try {
      const svc = new ClicksignApiService(config({ CLICKSIGN_API_TOKEN: "tok" }));
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(resposta429(Math.floor(Date.now() / 1000) + 6));

      const promessa = svc.consultarStatus("env-1");
      const capturado = promessa.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(capturado).resolves.toMatchObject({ message: "Clicksign HTTP 429" });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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
