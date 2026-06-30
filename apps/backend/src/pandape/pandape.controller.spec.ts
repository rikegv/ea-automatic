import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { PandapeController } from "./pandape.controller";
import type { PandapeSyncService } from "./pandape-sync.service";

/**
 * QA do entrypoint interno do cron (DoD §4): o controller só ENFILEIRA o tick e responde 202 —
 * inclusive quando a API está inerte (sem token), pois o no-op acontece no worker, não aqui.
 * A proteção do segredo compartilhado já é coberta por internal-token.guard.spec.ts (não duplicar).
 */
describe("PandapeController — /internal/pandape/tick (DoD §4)", () => {
  it("enfileira o tick e devolve { enfileirado: true }", async () => {
    const enfileirarTick = vi.fn().mockResolvedValue(undefined);
    const controller = new PandapeController({ enfileirarTick } as unknown as PandapeSyncService);

    await expect(controller.tick()).resolves.toEqual({ enfileirado: true });
    expect(enfileirarTick).toHaveBeenCalledTimes(1);
  });

  it("responde mesmo com a API inerte — o handler só enfileira (no-op vive no worker)", async () => {
    // Mesmo que a sync esteja inerte, o controller não consulta token: apenas delega o enfileiramento.
    const enfileirarTick = vi.fn().mockResolvedValue(undefined);
    const controller = new PandapeController({ enfileirarTick } as unknown as PandapeSyncService);

    await expect(controller.tick()).resolves.toEqual({ enfileirado: true });
  });

  it("o handler está decorado com HTTP 202 (Accepted)", () => {
    // @HttpCode(202) grava a metadata '__httpCode__' no método — garante o status assíncrono correto.
    const httpCode = Reflect.getMetadata("__httpCode__", PandapeController.prototype.tick);
    expect(httpCode).toBe(202);
  });
});
