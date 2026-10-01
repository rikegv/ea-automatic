import { Controller, Get, Inject, Query } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { parseMulti } from "../../common/parse-multi";
import { propostasDeClienteDasVagas } from "./vagas-revisao-proposta";

/**
 * O LOTE DE VAGAS PEDIDO. Lista de ids, no padrão `parseMulti` que a Esteira já usa (§A.28).
 *
 * `forbidNonWhitelisted` É GLOBAL (`main.ts`), então parâmetro não declarado aqui é 400, e não um
 * filtro ignorado em silêncio.
 */
export class PropostasDeClienteDaVagaDto {
  /** Separado por vírgula (`?vaga=a,b`), que é a forma que `parseMulti` quebra (§A.28). */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  vaga?: string;
}

/**
 * ─ A PROPOSTA DE CLIENTE PARA A TELA DE REVISÃO, E SÓ PARA ELA ─────────────────────────────────
 *
 * ┌─ POR QUE UMA CONTROLLER PRÓPRIA, E NÃO UM CAMPO NA LISTAGEM DA `VagasController` ────────────┐
 * │ A proposta tem LISTA BRANCA DE LEITORES, conferida por varredura de fonte: o de/para, o schema │
 * │ e a tela de revisão (`as/vagas/vagas-revisao*`). A `VagasService` e a `VagasController` NÃO    │
 * │ estão na lista, e não devem estar: são elas que escrevem e devolvem `cod_cliente`, e a regra    │
 * │ desta frente é que a proposta não tem caminho até lá. Pendurar o campo na listagem faria o      │
 * │ valor da planilha viajar no MESMO objeto que o cliente de verdade, que é a um descuido de       │
 * │ distância de um `??` entre os dois.                                                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ QUEM SEGURA A ROTA É O MENU `as-vagas-revisao`, E ISSO PRECISOU DE UMA DECISÃO ─────────────┐
 * │ Aquele menu tinha `operacoes: []` de propósito, porque as rotas da tela dele vivem na          │
 * │ `VagasController`, que o `as-vagas` já reivindica por inteiro, e DOIS menus reivindicando a    │
 * │ MESMA classe é defeito (`menuDaOperacao` responde UM, e qual depende da ordem do registro).    │
 * │                                                                                               │
 * │ ESTA CLASSE NÃO TEM ESSE PROBLEMA: ela é exclusiva da fila de revisão, ninguém mais a          │
 * │ reivindica, e sem a reivindicação o `MenuGuard` é FAIL-OPEN (`menuDaOperacao` devolve `null` e  │
 * │ o handler fica alcançável por qualquer sessão autenticada, com `curl`). Como ela devolve RAZÃO  │
 * │ SOCIAL de empresa, que em MEI é nome de pessoa natural (§A.6), deixá-la não reivindicada seria  │
 * │ o mesmo furo dos sete catálogos de A&S medido em 30/09.                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a rota NÃO loga, e devolve só o que a tela precisa para a pessoa reconhecer o cliente. Sem
 * ids pedidos, devolve vazio: varrer a tabela inteira entregaria proposta de vaga que ninguém pediu.
 */
@Controller("as/vagas/revisao/propostas-de-cliente")
export class VagasRevisaoPropostaController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  listar(@Query() dto: PropostasDeClienteDaVagaDto) {
    const ids = parseMulti(dto.vaga) ?? [];
    return propostasDeClienteDasVagas(this.db, ids);
  }
}
