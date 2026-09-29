import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../../auth/decorators";
import { chaveDoJobDigai, identificadoresDoEvento } from "../../domain/digai";
import { DigaiWebhookGuard } from "./digai-webhook.guard";

/**
 * ─ O RECEPTOR DO EVENTO `NEW_APPLICATION` DO DIGAI ─────────────────────────────────────────────
 *
 * Rota real: `POST /api/webhooks/digai` (o prefixo global "api" vem do `main.ts`). O Digai chama
 * quando o candidato finaliza a triagem.
 *
 * O FLUXO E: valida ORIGEM (guard proprio) -> extrai os IDS TECNICOS -> ENFILEIRA -> responde 202.
 *
 * ┌─ O ENRIQUECIMENTO E DO WORKER, E NUNCA DA ROTA ──────────────────────────────────────────────┐
 * │ Esta controller NAO recebe o cliente do Digai, e a ausencia e o desenho: processar sincrono    │
 * │ aqui segura o fornecedor no timeout dele (transformando qualquer lentidao nossa em reentrega)  │
 * │ e, pior, fura o teto de vazao, porque quem roda sob o limiter e a FILA. Sem a dependencia no   │
 * │ construtor, "a rota nao chama o Digai" deixa de ser disciplina e vira impossibilidade.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IDEMPOTENCIA E PELO PAR DE IDS TECNICOS, E NUNCA POR HASH DO CORPO ───────────────────────┐
 * │ Hash do corpo obrigaria a GUARDAR ou a RE-SERIALIZAR o corpo, que e exatamente o que nao pode │
 * │ existir, e ainda mudaria no dia em que o fornecedor acrescentasse um campo qualquer ao evento, │
 * │ fazendo a MESMA entrega virar duas. A chave e derivada do `userId`, que a varredura provou     │
 * │ estavel (o CPF aparece depois no MESMO registro).                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E SAO TRES CAMINHOS DE VAZAMENTO, cada um com trava propria:
 *   (a) o PAYLOAD DO JOB, que fica no Redis sem TTL: so a lista fechada de ids atravessa;
 *   (b) o STACK TRACE, porque `throw new Error(...corpo...)` poe o corpo no log E no `failedReason`:
 *       a excecao daqui diz o MOTIVO, nunca o corpo, e nada aqui serializa o `body`;
 *   (c) o `detail` do driver do Postgres, que devolve o VALOR que violou a restricao: nenhuma
 *       escrita acontece nesta rota, e a que acontece rio abaixo passa por `traduzirErroDeBanco`.
 *
 * O CORPO NAO PERSISTE em lugar nenhum: nem coluna, nem tabela de recebimento, nem arquivo. Ele sai
 * de escopo no mesmo tick.
 */

/** A porta da fila, reduzida ao que a rota usa. Interface, e nao classe, para o teste nao subir Redis. */
export interface PortaDaFilaDigai {
  enfileirarEvento(payload: unknown, opcoes?: { jobId?: string }): Promise<boolean>;
}

/**
 * O TOKEN DA PORTA, e ele existe para QUEBRAR UM CICLO DE IMPORTACAO.
 *
 * Interface de TypeScript nao sobrevive a compilacao, entao o Nest nao a injeta por tipo. A saida
 * obvia seria tipar o construtor com `DigaiFilaService`, e ela criaria um ciclo REAL de modulos: o
 * servico de fila importa esta interface daqui, e esta controller passaria a importar a classe de
 * la. Com o token, a controller depende so do CONTRATO, e quem resolve a implementacao e o modulo.
 */
export const PORTA_DA_FILA_DIGAI = "PORTA_DA_FILA_DIGAI";

@Controller("webhooks/digai")
export class DigaiWebhookController {
  constructor(@Inject(PORTA_DA_FILA_DIGAI) private readonly fila: PortaDaFilaDigai) {}

  @Post()
  @Public()
  /*
   * PIPE PERMISSIVO, pela mesma razao do receptor do Pandape: o `ValidationPipe` global roda com
   * `forbidNonWhitelisted`, e o evento real do fornecedor e gordo. Recusar por campo desconhecido
   * daria 400 num evento legitimo. Quem peneira o conteudo e `identificadoresDoEvento`, que e
   * allowlist, e nao o pipe.
   */
  @UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false, transform: true }))
  @UseGuards(DigaiWebhookGuard)
  async receber(
    @Body() corpo: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ enfileirado: boolean }> {
    const ids = identificadoresDoEvento(corpo);
    if (ids === null) {
      /*
       * A FRASE NAO CARREGA O CORPO, e este e o ponto (b) acima. O jeito mais natural de escrever
       * esta linha seria interpolar o payload para "facilitar o diagnostico", e ele acabaria no log
       * permanente da aplicacao, no stack trace e no `failedReason` do job, de uma vez so. Quem
       * investiga tem o horario e a origem; o corpo nao acrescenta nada que valha isso.
       */
      throw new BadRequestException("Evento do Digai sem identificador tecnico valido");
    }

    const enfileirado = await this.fila.enfileirarEvento(ids, {
      jobId: chaveDoJobDigai({ userId: ids.userId }),
    });
    if (!enfileirado) {
      // Fila indisponivel (Redis fora): 503, para o fornecedor reentregar. Perder o evento em
      // silencio seria perder a pessoa, porque o Digai nao reenvia por conta propria depois.
      res.status(503);
      return { enfileirado: false };
    }

    // 202 Accepted = "aceito e enfileirado", sem aguardar o enriquecimento.
    res.status(202);
    return { enfileirado: true };
  }
}
