import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Public } from "../auth/decorators";
import { InternalTokenGuard } from "./internal-token.guard";
import { PandapeSyncService } from "./pandape-sync.service";

/**
 * Entrypoint interno do cron da sincronização Pandapé (Fase 5 / INT-1). Fora do JWT (`@Public()`),
 * protegido pelo segredo compartilhado `INTERNAL_TOKEN` via `InternalTokenGuard`. O handler só
 * ENFILEIRA o tick (BullMQ) e responde 202 — o trabalho roda no worker (fila + backoff, §A.5). Se a
 * API estiver inerte (sem token), ainda responde 202, mas o tick é no-op no worker.
 */
@Controller("internal/pandape")
export class PandapeController {
  constructor(private readonly sync: PandapeSyncService) {}

  @Post("tick")
  @Public()
  @UseGuards(InternalTokenGuard)
  @HttpCode(202)
  async tick(): Promise<{ enfileirado: true }> {
    await this.sync.enfileirarTick();
    return { enfileirado: true };
  }
}
