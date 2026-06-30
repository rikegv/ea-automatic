import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PandapeApiService } from "./pandape-api.service";

/** ConfigService mínimo que devolve o mapa informado. */
function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe("PandapeApiService — inércia sem token (§A.5/§A.9)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("estaAtivo() é false sem PANDAPE_API_TOKEN e não toca a rede", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const svc = new PandapeApiService(config({ PANDAPE_API_TOKEN: "" }));

    expect(svc.estaAtivo()).toBe(false);
    await expect(svc.getPrecollaborator("x")).resolves.toBeUndefined();
    await expect(svc.listarMudancas()).resolves.toEqual([]);
    await expect(svc.getVacancy("v")).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loga a inércia UMA única vez (flag anti-spam)", async () => {
    const svc = new PandapeApiService(config({ PANDAPE_API_TOKEN: undefined }));
    const warn = vi
      .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
      .mockImplementation(() => undefined);

    await svc.getPrecollaborator("a");
    await svc.listarMudancas();
    await svc.getVacancy("c");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Pandapé inerte: PANDAPE_API_TOKEN ausente");
  });

  it("estaAtivo() é true quando o token está presente", () => {
    const svc = new PandapeApiService(config({ PANDAPE_API_TOKEN: "tok-123" }));
    expect(svc.estaAtivo()).toBe(true);
  });
});
