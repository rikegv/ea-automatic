import { Controller, Get, Query } from "@nestjs/common";
import { VagaStatusService, type AsVagaStatusLinha } from "./vaga-status.service";

/**
 * ─ A LEITURA DO CATÁLOGO DE STATUS. CLASSE SEPARADA, E A SEPARAÇÃO É A REGRA ───────────────────
 *
 * ┌─ POR QUE DUAS CONTROLLERS E NÃO UMA ───────────────────────────────────────────────────────────┐
 * │ O `MenuGuard` resolve a permissão por NOME DE CLASSE (`menuDaOperacao`, em `domain/menus`).    │
 * │ Uma classe só, reivindicada com `.*` pelo menu de administração, fecharia JUNTO este `GET`, e a│
 * │ Central de Vagas inteira (a pill de status, o filtro por status, o seletor do movimento manual)│
 * │ passaria a dar 403 para quem apenas precisa SABER quais status existem.                        │
 * │                                                                                                 │
 * │ ESTA CLASSE NÃO É REIVINDICADA POR MENU NENHUM, e isso é DELIBERADO, no mesmo tratamento das   │
 * │ demais leituras de catálogo do sistema ("LER catálogo é dado de TRABALHO e continua ABERTO a   │
 * │ qualquer autenticado", `domain/menus`). "Aberto" aqui é a AUSÊNCIA de uma reivindicação, e     │
 * │ ausência não se defende sozinha: é por isso que existe `vaga-status-menu.spec.ts`, que afirma  │
 * │ handler a handler que esta classe resolve para `null` e a de escrita para `as-status-vaga`.    │
 * │ Reivindicar esta aqui quebra o teste antes de quebrar a operação.                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PAYLOAD É O CATÁLOGO INTEIRO, os quatro flags incluídos, e isso é NECESSÁRIO e não vazamento: é
 * com eles que a tela sabe quais status oferecer no movimento manual (`movivelManualmente`) e por
 * que um destino não aparece. São propriedades da LISTA, não de nenhuma vaga e de nenhuma pessoa.
 * NÃO sai daqui contagem de vagas por status: isso é volume operacional e pertence à Central de
 * Vagas, que já é gatada. §A.6: nenhum dado pessoal, nem direto nem agregado.
 */
@Controller("as/status-vaga")
export class VagaStatusController {
  constructor(private readonly status: VagaStatusService) {}

  /**
   * OS ATIVOS por padrão. `?incluirInativos=1` existe para o HISTÓRICO: a vaga que ficou parada num
   * status desativado precisa do rótulo dele, senão a pill mostra o código cru.
   */
  @Get()
  listar(@Query("incluirInativos") incluirInativos?: string): Promise<AsVagaStatusLinha[]> {
    return this.status.listar(incluirInativos === "1" || incluirInativos === "true");
  }
}
