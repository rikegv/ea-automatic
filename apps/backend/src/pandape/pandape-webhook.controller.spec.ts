import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { PandapeWebhookController } from "./pandape-webhook.controller";
import type { PandapeQueueService } from "./pandape-queue.service";

/**
 * QA do endpoint RECEPTOR do webhook Pandapé (INT-1 / §A.5). A fila é MOCKADA — este spec cobre só o
 * contrato do controller (extração do id, enfileiramento, 202/503/400). A proteção de origem vive em
 * pandape-webhook.guard.spec.ts e a IDEMPOTÊNCIA em pandape-sync.service.spec.ts (não duplicar).
 */
function fakeRes(): Response & { statusCode: number } {
  const res = {
    statusCode: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number };
}

function controllerCom(enfileirar: ReturnType<typeof vi.fn>): PandapeWebhookController {
  const queue = { enfileirarCandidato: enfileirar } as unknown as PandapeQueueService;
  return new PandapeWebhookController(queue);
}

describe("PandapeWebhookController — POST /api/webhooks/pandape (INT-1)", () => {
  it("(a) payload válido → chama enfileirarCandidato 1x com o id e responde 202", async () => {
    const enfileirar = vi.fn().mockResolvedValue(true);
    const controller = controllerCom(enfileirar);
    const res = fakeRes();

    const out = await controller.receber({ IdPreCollaborator: "abc-123" }, res);

    expect(enfileirar).toHaveBeenCalledTimes(1);
    expect(enfileirar).toHaveBeenCalledWith("abc-123");
    expect(res.statusCode).toBe(202);
    expect(out).toEqual({ enfileirado: true });
  });

  it("(b) tolera casing alternativo do campo (idPrecollaborator)", async () => {
    const enfileirar = vi.fn().mockResolvedValue(true);
    const controller = controllerCom(enfileirar);
    const res = fakeRes();

    await controller.receber({ idPrecollaborator: "xyz-9" }, res);

    expect(enfileirar).toHaveBeenCalledWith("xyz-9");
  });

  it("(b'') tolera casing camelCase (idPreCollaborator)", async () => {
    const enfileirar = vi.fn().mockResolvedValue(true);
    const controller = controllerCom(enfileirar);
    const res = fakeRes();

    await controller.receber({ idPreCollaborator: "cam-7" }, res);

    expect(enfileirar).toHaveBeenCalledWith("cam-7");
  });

  it("(b') aceita id numérico convertendo para string", async () => {
    const enfileirar = vi.fn().mockResolvedValue(true);
    const controller = controllerCom(enfileirar);
    const res = fakeRes();

    await controller.receber({ IdPreCollaborator: 42 }, res);

    expect(enfileirar).toHaveBeenCalledWith("42");
  });

  it("(c) sem id no payload → 400 (BadRequest) e não enfileira", async () => {
    const enfileirar = vi.fn().mockResolvedValue(true);
    const controller = controllerCom(enfileirar);
    const res = fakeRes();

    await expect(controller.receber({ outra: "coisa" }, res)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("(d) fila indisponível (retorna false) → 503, evento não é perdido (Pandapé reenvia)", async () => {
    const enfileirar = vi.fn().mockResolvedValue(false);
    const controller = controllerCom(enfileirar);
    const res = fakeRes();

    const out = await controller.receber({ IdPreCollaborator: "abc-123" }, res);

    expect(res.statusCode).toBe(503);
    expect(out).toEqual({ enfileirado: false });
  });

  it("(e) webhook duplicado: 2 chamadas → enfileira 2x e responde 202 (dedup é do jobId/unique, não do controller)", async () => {
    // O controller NÃO deduplica: a dedup mora no jobId `cand-${id}` (jobs em voo) + no unique
    // `idPrecollaborator` (pandape-sync.service.spec.ts). Duas entregas → dois enfileiramentos → um efeito.
    const enfileirar = vi.fn().mockResolvedValue(true);
    const controller = controllerCom(enfileirar);
    const res = fakeRes();

    await controller.receber({ IdPreCollaborator: "dup-1" }, res);
    await controller.receber({ IdPreCollaborator: "dup-1" }, res);

    expect(enfileirar).toHaveBeenCalledTimes(2);
    expect(enfileirar).toHaveBeenNthCalledWith(1, "dup-1");
    expect(enfileirar).toHaveBeenNthCalledWith(2, "dup-1");
    expect(res.statusCode).toBe(202);
  });
});
