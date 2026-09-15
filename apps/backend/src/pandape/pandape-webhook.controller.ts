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
import { PandapeEntradaService } from "./pandape-entrada.service";
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
  /**
   * `entradas` é opcional na assinatura e SEMPRE injetada em produção: a suíte que já existia
   * constrói o controller só com a fila, e torná-la obrigatória quebraria código validado sem
   * nenhum ganho (§A.26). Em produção o provider vem do `PandapeEntradaModule`.
   */
  constructor(
    private readonly queue: PandapeQueueService,
    private readonly entradas?: PandapeEntradaService,
  ) {}

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
      // Sem id não há evento identificável: 400 e NADA é gravado (linha órfã não se cria, e a chave
      // da tabela é justamente este id). Nunca logar o payload (§A.6).
      throw new BadRequestException("IdPreCollaborator ausente no payload");
    }

    // ─ A LINHA NASCE ANTES DA FILA, e a ordem é o requisito (OST 15/09/2026) ────────────────────
    // Gravar depois de enfileirar abre uma janela em que o job já existe e a linha não: o worker
    // pode rodar, terminar e tentar carimbar o desfecho de uma linha que ainda não foi criada. É a
    // mesma classe de erro da INT-4, onde notificar antes de gravar o envelope duplicava o envelope
    // na retentativa (§A.5). Registro primeiro, efeito depois.
    //
    // FALHAR AO REGISTRAR É FALHAR O WEBHOOK (decisão do coordenador): 503 e NÃO enfileira. O
    // Pandapé reenvia, que é o comportamento que a §A.5 já escolheu para a fila fora. Enfileirar com
    // o registro quebrado recriaria o buraco atual (job sem rastro durável) com a agravante de
    // ninguém saber.
    //
    // §A.6: atravessa uma lista FECHADA de identificadores de SISTEMA. O payload real do Pandapé é
    // gordo e tem dado pessoal dentro; ele não passa daqui.
    try {
      await this.entradas?.registrarRecebimento({ idPrecollaborator: id, origem: "WEBHOOK" });
    } catch {
      // Sem detalhe do erro no log: a mensagem do driver carrega o valor que violou a restrição.
      res.status(503);
      return { enfileirado: false };
    }

    const enfileirado = await this.queue.enfileirarCandidato(id);
    if (!enfileirado) {
      // Fila indisponível (Redis fora): NÃO perder o evento. 503 → o Pandapé reenvia (§A.5/§4).
      //
      // E A LINHA DIZ ISSO, em vez de ficar `RECEBIDO` para sempre: `NAO_ENFILEIRADO` é o desfecho
      // de "chegou e nenhum job chegou a existir". Sem ele a tela chamaria de outra coisa um evento
      // que ninguém sequer tentou processar, e a fila mentiria por omissão (§A.19). Não encerra a
      // linha: ela continua pendente, que é a verdade.
      // CAMINHO GUARDADO (RES-1), e não o `registrarDesfecho`: este desfecho é FRACO (nenhum job
      // chegou a existir), então ele só escreve sobre linha ainda sem história e NUNCA apaga o
      // motivo de uma linha pendente nem incrementa `tentativas`. O cenário é uma queda de Redis
      // com o Pandapé re-entregando: é quando a coluna Motivo mais precisa estar dizendo a verdade.
      //
      // MELHOR-ESFORÇO DE VERDADE, e o `try` cobre mais que a promessa rejeitada: o 503 já está
      // decidido e NADA aqui pode transformá-lo em 500. Sem logar payload nem detalhe do erro
      // (§A.6): a mensagem do driver carrega o valor que violou a restrição.
      try {
        await this.entradas?.registrarNaoEnfileirado(id);
      } catch {
        // segue para o 503
      }
      res.status(503);
      return { enfileirado: false };
    }

    // 202 Accepted = "aceito/enfileirado", resposta rápida sem aguardar o enriquecimento.
    // Se o suporte exigir 200 exato, é troca de 1 linha (@HttpCode(200)).
    res.status(202);
    return { enfileirado: true };
  }
}
