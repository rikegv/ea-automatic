import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/**
 * ─ O GUARD DE ORIGEM DO RECEPTOR DO DIGAI: UM MECANISMO SO, E FAIL-CLOSED ──────────────────────
 *
 * A rota do receptor sai do JWT global (`@Public()`) e e protegida AQUI, por UM mecanismo:
 * o token compartilhado `DIGAI_WEBHOOK_TOKEN`, conferido contra o header `x-digai-webhook-token`.
 *
 * ┌─ POR QUE A ALLOWLIST DE IP DO PANDAPE NAO E COPIADA PARA CA ─────────────────────────────────┐
 * │ O `PandapeWebhookGuard` autoriza por token OU por IP, e a allowlist de IP existe la por uma   │
 * │ razao especifica: o box do Fernando esta atras de NAT e o PHP so enxerga o IP interno, o que  │
 * │ fez o modelo de la ser token-only na pratica, com `PANDAPE_WEBHOOK_IPS` VAZIO de proposito.   │
 * │ Copiar o desenho para ca criaria um SEGUNDO caminho de autorizacao que ninguem precisa, e     │
 * │ cada caminho a mais e uma chance a mais de um deles ficar frouxo sem que o outro acuse.       │
 * │ `DIGAI_WEBHOOK_IPS` nem e lido: nao existe variavel que ligue essa porta.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FAIL-CLOSED SEM CREDENCIAL, E A CONDICAO E REAL ────────────────────────────────────────────┐
 * │ Sem o token configurado, a rota responde 401 e nao 200. Rota publica que autoriza porque      │
 * │ "ainda nao ha token" e uma porta aberta esperando alguem descobrir a URL, e o estado de hoje  │
 * │ E esse: a integracao nasce inerte.                                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nunca loga o token, o IP nem o corpo. As mensagens sao genericas de proposito, porque
 * mensagem de recusa detalhada conta ao atacante qual das duas coisas ele errou.
 */
@Injectable()
export class DigaiWebhookGuard implements CanActivate {
  /** O nome do header, declarado uma vez. E a unica coisa sobre a credencial que pode ser dita. */
  static readonly HEADER = "x-digai-webhook-token";

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperado = (this.config.get<string>("DIGAI_WEBHOOK_TOKEN") ?? "").trim();
    if (esperado.length === 0) {
      throw new UnauthorizedException("Receptor do Digai indisponivel");
    }

    const req = context.switchToHttp().getRequest<Request>();
    const cru = req.headers?.[DigaiWebhookGuard.HEADER];
    const apresentado = (Array.isArray(cru) ? cru[0] : cru)?.trim() ?? "";
    if (apresentado.length === 0 || !this.igualdadeConstante(apresentado, esperado)) {
      throw new UnauthorizedException("Origem do evento nao autorizada");
    }
    return true;
  }

  /**
   * COMPARACAO EM TEMPO CONSTANTE, e o curto-circuito por TAMANHO vem antes por necessidade: o
   * `timingSafeEqual` LANCA quando os buffers tem comprimentos diferentes, e um `throw` aqui viraria
   * 500 em vez de 401.
   *
   * `===` DE STRING SAI NO PRIMEIRO CARACTERE DIFERENTE, e a diferenca de tempo entre errar no
   * primeiro e errar no ultimo e mensuravel pela rede. O precedente da casa e o mesmo
   * (`pandape-webhook.guard.ts`).
   */
  private igualdadeConstante(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
