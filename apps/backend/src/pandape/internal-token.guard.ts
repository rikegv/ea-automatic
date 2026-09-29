import { timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

/**
 * Guard de rota interna (cron/scheduler → EA). Valida o header `x-internal-token` contra
 * `INTERNAL_TOKEN` (mesmo segredo do par com o ai-service, §A.2). Usado junto de `@Public()` para
 * que a rota do tick fique fora do JWT mas ainda protegida por segredo compartilhado. Rejeita (401)
 * se o token diferir OU se `INTERNAL_TOKEN` não estiver configurado (fail-closed — nunca abre sem
 * segredo).
 *
 * COMPARTILHADO por `/internal/pandape/tick`, `/internal/clicksign/tick` e `/internal/digai/tick`.
 * Um guard por integração seria três mecanismos para a mesma coisa, e é contra isso que o próprio
 * `digai-webhook.guard.ts` argumenta: quando são vários, um deles fica frouxo sem os outros
 * acusarem.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperado = (this.config.get<string>("INTERNAL_TOKEN") ?? "").trim();
    if (!esperado) {
      // Fail-closed: sem segredo configurado, a rota interna fica fechada.
      throw new UnauthorizedException("Rota interna indisponível");
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers["x-internal-token"];
    const recebido = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!recebido || !igualdadeConstante(recebido, esperado)) {
      throw new UnauthorizedException("Token interno inválido");
    }
    return true;
  }
}

/**
 * COMPARAÇÃO EM TEMPO CONSTANTE (veto do `seguranca`, 29/09/2026).
 *
 * O `!==` de string SAI NO PRIMEIRO BYTE DIFERENTE, e a diferença de tempo entre errar no primeiro
 * caractere e errar no último é mensurável pela rede: quem chuta o segredo byte a byte aprende o
 * token com O(n) tentativas em vez de O(256^n). O veto não foi importado de fora, ele é do próprio
 * repositório: `as/digai/digai-webhook.guard.ts` e `pandape/pandape-webhook.guard.ts` já faziam
 * assim, e esta rota, que é a irmã delas, tinha ficado com o `!==`.
 *
 * O CURTO-CIRCUITO POR TAMANHO VEM ANTES POR NECESSIDADE: `timingSafeEqual` LANÇA quando os buffers
 * têm comprimentos diferentes, e um `throw` aqui viraria 500 em vez de 401. O comprimento vaza, e
 * isso é aceito pelos três guards da casa: saber o TAMANHO de um segredo não o revela.
 *
 * O COMPORTAMENTO É O MESMO: mesmo booleano, mesmo 401, mesma mensagem. Só o tempo muda.
 */
function igualdadeConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
