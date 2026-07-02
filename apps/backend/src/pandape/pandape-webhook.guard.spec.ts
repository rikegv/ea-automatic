import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { PandapeWebhookGuard } from "./pandape-webhook.guard";

/** ConfigService fake devolvendo por chave (PANDAPE_WEBHOOK_TOKEN / PANDAPE_WEBHOOK_IPS). */
function config(vals: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

type ReqLike = {
  headers?: Record<string, string | undefined>;
  socket?: { remoteAddress?: string };
};

function ctx(req: ReqLike): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("PandapeWebhookGuard (origem do webhook INT-1 / §A.5)", () => {
  it("(a) fail-closed: sem token nem IPs configurados → rejeita", () => {
    const guard = new PandapeWebhookGuard(config({}));
    expect(() => guard.canActivate(ctx({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it("(b) token válido → passa", () => {
    const guard = new PandapeWebhookGuard(config({ PANDAPE_WEBHOOK_TOKEN: "segredo" }));
    expect(guard.canActivate(ctx({ headers: { "x-pandape-webhook-token": "segredo" } }))).toBe(
      true,
    );
  });

  it("(b) token inválido, só token configurado → rejeita", () => {
    const guard = new PandapeWebhookGuard(config({ PANDAPE_WEBHOOK_TOKEN: "segredo" }));
    expect(() =>
      guard.canActivate(ctx({ headers: { "x-pandape-webhook-token": "errado" } })),
    ).toThrow(UnauthorizedException);
  });

  it("(b) token ausente, só token configurado → rejeita", () => {
    const guard = new PandapeWebhookGuard(config({ PANDAPE_WEBHOOK_TOKEN: "segredo" }));
    expect(() => guard.canActivate(ctx({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it("(c) IP na allowlist via X-Forwarded-For → passa", () => {
    const guard = new PandapeWebhookGuard(
      config({ PANDAPE_WEBHOOK_IPS: "203.0.113.10,203.0.113.11" }),
    );
    expect(
      guard.canActivate(ctx({ headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" } })),
    ).toBe(true);
  });

  it("(c) IPv6-mapped no XFF é normalizado e casa a allowlist → passa", () => {
    const guard = new PandapeWebhookGuard(config({ PANDAPE_WEBHOOK_IPS: "203.0.113.10" }));
    expect(guard.canActivate(ctx({ headers: { "x-forwarded-for": "::ffff:203.0.113.10" } }))).toBe(
      true,
    );
  });

  it("(c) IP fora da allowlist → rejeita", () => {
    const guard = new PandapeWebhookGuard(config({ PANDAPE_WEBHOOK_IPS: "203.0.113.10" }));
    expect(() =>
      guard.canActivate(ctx({ headers: { "x-forwarded-for": "198.51.100.9" } })),
    ).toThrow(UnauthorizedException);
  });

  it("(c) sem XFF cai no socket.remoteAddress para a allowlist", () => {
    const guard = new PandapeWebhookGuard(config({ PANDAPE_WEBHOOK_IPS: "203.0.113.10" }));
    expect(guard.canActivate(ctx({ headers: {}, socket: { remoteAddress: "203.0.113.10" } }))).toBe(
      true,
    );
  });

  it("(d) ambos configurados → passa satisfazendo apenas o token (IP não bate)", () => {
    const guard = new PandapeWebhookGuard(
      config({ PANDAPE_WEBHOOK_TOKEN: "segredo", PANDAPE_WEBHOOK_IPS: "203.0.113.10" }),
    );
    expect(
      guard.canActivate(
        ctx({
          headers: { "x-pandape-webhook-token": "segredo", "x-forwarded-for": "198.51.100.9" },
        }),
      ),
    ).toBe(true);
  });

  it("(d) ambos configurados → passa satisfazendo apenas o IP (token não bate)", () => {
    const guard = new PandapeWebhookGuard(
      config({ PANDAPE_WEBHOOK_TOKEN: "segredo", PANDAPE_WEBHOOK_IPS: "203.0.113.10" }),
    );
    expect(
      guard.canActivate(
        ctx({
          headers: { "x-pandape-webhook-token": "errado", "x-forwarded-for": "203.0.113.10" },
        }),
      ),
    ).toBe(true);
  });

  it("(d) ambos configurados mas nenhum satisfeito → rejeita", () => {
    const guard = new PandapeWebhookGuard(
      config({ PANDAPE_WEBHOOK_TOKEN: "segredo", PANDAPE_WEBHOOK_IPS: "203.0.113.10" }),
    );
    expect(() =>
      guard.canActivate(
        ctx({
          headers: { "x-pandape-webhook-token": "errado", "x-forwarded-for": "198.51.100.9" },
        }),
      ),
    ).toThrow(UnauthorizedException);
  });
});
