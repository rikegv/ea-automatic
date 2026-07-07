import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { extrairIdPreCollaborator, type PandapeWebhookPayload } from "./dto/pandape-webhook.dto";
import { PandapeQueueService } from "./pandape-queue.service";
import { PandapeWebhookGuard } from "./pandape-webhook.guard";

/**
 * Endpoint RECEPTOR do webhook do Pandapé (INT-1 / §A.5). Rota real: `POST /api/webhooks/pandape`
 * (prefixo global "api" em main.ts). Recebe o evento "Candidato enviado para admissão", cujo payload
 * traz `IdPreCollaborator` (confirmado pelo suporte).
 *
 * Fluxo: valida origem (PandapeWebhookGuard) → extrai o id (400 se ausente) → ENFILEIRA na fila BullMQ
 * existente → responde RÁPIDO, sem aguardar o enriquecimento (o worker faz o resto: cria
 * candidato+admissão+frentes+pull de docs, idempotente).
 *
 * `@Public()` só pula o JWT global; a proteção da rota é o guard de origem próprio. OriginGuard/
 * throttler globais permanecem intactos.
 *
 * IDEMPOTÊNCIA: o controller NÃO deduplica. Webhook duplicado é coberto rio abaixo pelo
 * `jobId: cand-${id}` (dedup de jobs em voo) + o unique `idPrecollaborator` em `integracao_pandape`
 * (uma admissão por pré-colaborador). Duas entregas do mesmo evento → dois enfileiramentos → um único
 * efeito. Ver `pandape-sync.service.spec.ts`.
 *
 * PIPE PERMISSIVO: o ValidationPipe global (`forbidNonWhitelisted: true`) rejeitaria o payload real
 * (muitos campos) com 400. Este handler sobrescreve com um pipe não-estrito.
 */
@Controller("webhooks/pandape")
export class PandapeWebhookController {
  constructor(private readonly queue: PandapeQueueService) {}

  @Post()
  @Public()
  @UseGuards(PandapeWebhookGuard)
  @UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false, transform: true }))
  async receber(
    @Body() payload: PandapeWebhookPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ enfileirado: boolean }> {
    const id = extrairIdPreCollaborator(payload);
    if (!id) {
      // Sem id não há o que sincronizar — nunca logar o payload (§A.6).
      throw new BadRequestException("IdPreCollaborator ausente no payload");
    }

    const enfileirado = await this.queue.enfileirarCandidato(id);
    if (!enfileirado) {
      // Fila indisponível (Redis fora): NÃO perder o evento. 503 → o Pandapé reenvia (§A.5/§4).
      res.status(503);
      return { enfileirado: false };
    }

    // 202 Accepted = "aceito/enfileirado", resposta rápida sem aguardar o enriquecimento.
    // Se o suporte exigir 200 exato, é troca de 1 linha (@HttpCode(200)).
    res.status(202);
    return { enfileirado: true };
  }
}
