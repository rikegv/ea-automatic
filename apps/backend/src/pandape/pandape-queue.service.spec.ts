import { describe, expect, it, vi } from "vitest";
import { PandapeQueueService } from "./pandape-queue.service";

/**
 * Regressão do jobId (INT-1 / §A.5). O BullMQ 5.x REJEITA custom jobId contendo ":" com
 * "Custom Id cannot contain :" — o desenho antigo (`cand:${id}`) fazia TODO webhook real cair
 * em 503 (enfileirar → throw → false). O contrato agora é `cand-${id}`, sem ":".
 */
describe("PandapeQueueService.enfileirarCandidato — contrato do jobId", () => {
  /** Injeta um `queue` falso na instância (o campo real é privado). */
  function servicoComQueueFake(add: ReturnType<typeof vi.fn>): PandapeQueueService {
    const svc = new PandapeQueueService({ get: () => undefined } as never);
    (svc as unknown as { queue: { add: typeof add } }).queue = { add };
    return svc;
  }

  it("usa jobId `cand-<id>` e NUNCA contém ':' (BullMQ rejeita)", async () => {
    const add = vi.fn().mockResolvedValue({});
    const svc = servicoComQueueFake(add);

    const ok = await svc.enfileirarCandidato("999999");

    expect(ok).toBe(true);
    const opts = add.mock.calls[0]?.[2] as { jobId: string };
    expect(opts.jobId).toBe("cand-999999");
    expect(opts.jobId).not.toContain(":");
  });

  it("retorna false (503 no webhook) se queue.add lançar", async () => {
    const add = vi.fn().mockRejectedValue(new Error("Custom Id cannot contain :"));
    const svc = servicoComQueueFake(add);

    await expect(svc.enfileirarCandidato("123")).resolves.toBe(false);
  });
});
