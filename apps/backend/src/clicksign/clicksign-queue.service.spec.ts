import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClicksignQueueService } from "./clicksign-queue.service";
import { JOB_CRIAR_ENVELOPE, JOB_POLL_TICK } from "./clicksign.queue";

/**
 * Monta o produtor da fila SEM subir Redis/BullMQ (não chama onModuleInit). Quando `comQueue`,
 * injeta uma `Queue` falsa com `add` espionável no campo privado; senão o serviço fica como no boot
 * sem Redis (queue indefinida → no-op logado).
 */
function montar(comQueue: boolean) {
  const add = vi.fn().mockResolvedValue(undefined);
  const svc = new ClicksignQueueService({ get: () => undefined } as unknown as ConfigService);
  if (comQueue) {
    (svc as unknown as { queue: { add: typeof add } }).queue = { add };
  }
  const warn = vi
    .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
    .mockImplementation(() => undefined);
  return { svc, add, warn };
}

describe("ClicksignQueueService — jobId de criar-envelope (REGRESSÃO: BullMQ rejeita ':' em jobId)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("enfileira com jobId 'env-<admissaoId>' e SEM ':' (falharia se voltasse a usar 'env:')", async () => {
    const { svc, add } = montar(true);

    await svc.enfileirarCriarEnvelope("adm-123", "/staging/_kits/kit.pdf");

    expect(add).toHaveBeenCalledTimes(1);
    const [nome, data, opts] = add.mock.calls[0] as [
      string,
      { admissaoId: string; stagingPathKit: string },
      { jobId: string },
    ];
    expect(nome).toBe(JOB_CRIAR_ENVELOPE);
    expect(data).toEqual({ admissaoId: "adm-123", stagingPathKit: "/staging/_kits/kit.pdf" });
    // O formato exato e — sobretudo — a AUSÊNCIA de ':' são o que esta regressão protege.
    expect(opts.jobId).toBe("env-adm-123");
    expect(opts.jobId).not.toContain(":");
  });

  it("jobId nunca contém ':' mesmo com admissaoId 'normal' (BullMQ usa ':' como separador interno)", async () => {
    const { svc, add } = montar(true);
    await svc.enfileirarCriarEnvelope("11111111-2222-3333-4444-555555555555", "/p/k.pdf");
    const opts = add.mock.calls[0][2] as { jobId: string };
    expect(opts.jobId).not.toContain(":");
    expect(opts.jobId).toBe("env-11111111-2222-3333-4444-555555555555");
  });

  it("enfileirarTick adiciona o job poll-tick (payload vazio)", async () => {
    const { svc, add } = montar(true);
    await svc.enfileirarTick();
    expect(add).toHaveBeenCalledWith(JOB_POLL_TICK, {});
  });

  it("sem fila (Redis indisponível no boot) → no-op logado, NÃO chama queue.add", async () => {
    const { svc, add, warn } = montar(false);
    await svc.enfileirarCriarEnvelope("adm-1", "/p/k.pdf");
    await svc.enfileirarTick();
    expect(add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
