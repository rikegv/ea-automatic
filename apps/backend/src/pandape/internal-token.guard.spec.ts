import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { InternalTokenGuard } from "./internal-token.guard";

function config(token: string | undefined): ConfigService {
  return { get: () => token } as unknown as ConfigService;
}

function contextComHeader(value?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: value === undefined ? {} : { "x-internal-token": value } }),
    }),
  } as unknown as ExecutionContext;
}

describe("InternalTokenGuard (rota interna do cron §A.6)", () => {
  it("libera quando o header bate com INTERNAL_TOKEN", () => {
    const guard = new InternalTokenGuard(config("segredo"));
    expect(guard.canActivate(contextComHeader("segredo"))).toBe(true);
  });

  it("barra header divergente", () => {
    const guard = new InternalTokenGuard(config("segredo"));
    expect(() => guard.canActivate(contextComHeader("errado"))).toThrow(UnauthorizedException);
  });

  it("barra header ausente", () => {
    const guard = new InternalTokenGuard(config("segredo"));
    expect(() => guard.canActivate(contextComHeader())).toThrow(UnauthorizedException);
  });

  it("fail-closed: barra quando INTERNAL_TOKEN não está configurado", () => {
    const guard = new InternalTokenGuard(config(""));
    expect(() => guard.canActivate(contextComHeader("qualquer"))).toThrow(UnauthorizedException);
  });
});
