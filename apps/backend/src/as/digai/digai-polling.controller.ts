import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Public } from "../../auth/decorators";
import { InternalTokenGuard } from "../../pandape/internal-token.guard";
import { DigaiSchedulerService } from "./digai-scheduler.service";

/**
 * ─ O DISPARO MANUAL DA VARREDURA DO DIGAI ──────────────────────────────────────────────────────
 *
 * `POST /internal/digai/tick`, no molde exato de `/internal/clicksign/tick` e
 * `/internal/pandape/tick`: fora do JWT (`@Public()`) porque quem chama e um processo, e protegido
 * pelo segredo compartilhado do `InternalTokenGuard`. So ENFILEIRA e responde 202.
 *
 * ┌─ ELA NAO E O UNICO CAMINHO, E ESSA E A LICAO QUE A CASA JA PAGOU ────────────────────────────┐
 * │ Na Clicksign a rota interna ERA o unico caminho, dependente de um cron que nunca foi          │
 * │ instalado: 3 ticks em 28 dias, todos manuais. Aqui a cadencia vive no                          │
 * │ `DigaiSchedulerService`, dentro do Nest, e esta rota e disparo manual ou externo, para         │
 * │ antecipar um ciclo ou para um re-sync pontual.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA PASSA PELO SCHEDULER, E NAO DIRETO NA FILA, para respeitar o portao `DIGAI_POLLING_ATIVO`:
 * com o freio puxado, nem o disparo externo enfileira. Rota que furasse o portao faria do portao
 * uma sugestao.
 *
 * §A.6: a resposta e estado de enfileiramento. Nenhum dado de pessoa, nenhum id de candidato.
 */
@Controller()
export class DigaiPollingController {
  constructor(private readonly scheduler: DigaiSchedulerService) {}

  @Post("internal/digai/tick")
  @Public()
  @UseGuards(InternalTokenGuard)
  @HttpCode(202)
  async tick(): Promise<{ enfileirado: boolean; ligado: boolean }> {
    return this.scheduler.dispararCiclo();
  }
}
