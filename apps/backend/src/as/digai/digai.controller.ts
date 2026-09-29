import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { chaveDoJobDigai, identificadoresDoEvento } from "../../domain/digai";
import { ReprocessarEventoDigaiDto } from "./digai.dto";
import { DigaiFilaService } from "./digai-fila.service";
import { DigaiImportacaoService } from "./digai-importacao.service";

/**
 * ─ A SUPERFICIE DE OPERACAO DA INGESTAO DO DIGAI, E ELA E SO DE SUPER ADMIN ────────────────────
 *
 * ┌─ POR QUE `@Roles("SUPER_ADMIN")` E NAO O MenuGuard ──────────────────────────────────────────┐
 * │ O `MenuGuard` resolve por menu REIVINDICADO, e ele e FAIL-OPEN para operacao sem dono: uma    │
 * │ controller que nenhum menu reivindica fica aberta a QUALQUER autenticado. Esta frente nao tem │
 * │ menu (a OST nao pede tela, e menu novo e decisao do diretor, §A.23), entao o papel e a unica  │
 * │ tranca disponivel, e ela tem de estar aqui.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTA ROTA NAO FAZ ────────────────────────────────────────────────────────────────────┐
 * │ Ela NAO processa sincrono. O reprocessamento vira JOB, pela mesma razao do receptor: quem roda │
 * │ sob o limiter e a fila, e uma leitura disparada de dentro de uma rota fura o teto de vazao.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhuma resposta daqui devolve dado de pessoa. O que sai e estado da integracao e
 * confirmacao de enfileiramento.
 */
@Controller("admin/as/digai")
@Roles("SUPER_ADMIN")
export class DigaiController {
  constructor(
    private readonly fila: DigaiFilaService,
    private readonly importacao: DigaiImportacaoService,
  ) {}

  /**
   * O ESTADO DA INTEGRACAO, sem nunca dizer QUAL e a credencial.
   *
   * O sistema pode afirmar QUE a credencial esta configurada; jamais qual ela e, nem truncada
   * (protocolo, secao 5). Os dois portoes aparecem separados de proposito: "tem token" e "escreve
   * no banco" sao decisoes distintas, e junta-las esconderia justamente a que importa.
   */
  @Get("estado")
  estado(): { ativa: boolean } {
    return { ativa: this.importacao.ativa };
  }

  /**
   * REPROCESSA UM EVENTO CONHECIDO, pela mesma chave da fila.
   *
   * Existe porque o Digai entrega o evento UMA VEZ: se a fila estava fora do ar naquele minuto, nao
   * ha reentrega automatica. Idempotente pelo `jobId` derivado do `userId`, entao clicar duas vezes
   * nao cria duas pessoas.
   *
   * ┌─ ESTA ROTA ATRAVESSA O MESMO FUNIL DO WEBHOOK, E ELA NAO ATRAVESSAVA (veto 2, 29/09) ──────┐
   * │ Antes ela montava o payload A MAO a partir do DTO e o entregava direto a fila. O caminho do │
   * │ WEBHOOK estava certo (la `identificadoresDoEvento` roda), e este era a porta dos fundos: o  │
   * │ DTO cobrava so o alfabeto, onze digitos cabem nele, e um documento colado no campo virava a │
   * │ chave `digai-<documento>` no Redis e o valor do payload, por 24h a 48h, fora do alcance do  │
   * │ expurgo.                                                                                     │
   * │                                                                                              │
   * │ SAO DUAS FECHADURAS E AS DUAS FICAM, porque protegem coisas diferentes: o DTO recusa na      │
   * │ BORDA (a resposta de 400 sai antes de o valor existir em qualquer lugar) e o funil garante   │
   * │ que o objeto que vai para a FILA foi montado pelo mesmo codigo nas duas portas. Montar o     │
   * │ payload a mao aqui e no webhook eram duas construcoes da mesma coisa, e elas divergiram.     │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Post("reprocessar")
  async reprocessar(@Body() corpo: ReprocessarEventoDigaiDto): Promise<{ enfileirado: boolean }> {
    const ids = identificadoresDoEvento({
      screeningId: corpo.screeningId,
      userId: corpo.userId,
      attemptId: corpo.attemptId,
    });
    if (ids === null) {
      // A FRASE NAO REPETE O VALOR RECUSADO: se ele for um documento, ecoa-lo na resposta de 400
      // publicaria exatamente o que a regra existe para barrar, e mensagem de erro e de onde o dado
      // mais facilmente cai num log de aplicacao.
      throw new BadRequestException("Identificador tecnico invalido para reprocessamento");
    }
    const enfileirado = await this.fila.enfileirarEvento(ids, {
      jobId: chaveDoJobDigai({ userId: ids.userId }),
    });
    return { enfileirado };
  }
}
