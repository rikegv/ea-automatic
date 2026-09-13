import { Controller, Get, Query } from "@nestjs/common";
import type { AsSegmento } from "@ea/shared-types";
import { SegmentosService } from "./segmentos.service";

/**
 * ─ A LEITURA DO CATÁLOGO DE SEGMENTOS. CLASSE SEPARADA, E A SEPARAÇÃO É A REGRA ────────────────
 *
 * ┌─ POR QUE DUAS CONTROLLERS E NÃO UMA ──────────────────────────────────────────────────────────┐
 * │ O `MenuGuard` resolve a permissão por NOME DE CLASSE (`menuDaOperacao`, em `domain/menus`).   │
 * │ Uma classe só, reivindicada com `.*` pelo menu de administração, fecharia JUNTO este `GET`, e │
 * │ quem perderia seria quem NÃO administra catálogo: o seletor de segmento na ficha da vaga e o  │
 * │ FILTRO por segmento da Central de Vagas passariam a dar 403 para o consultor COMUM, que é     │
 * │ exatamente quem usa a Central. A tela não mostraria erro, mostraria filtro vazio.             │
 * │                                                                                                │
 * │ ESTA CLASSE NÃO É REIVINDICADA POR MENU NENHUM, e isso é DELIBERADO, no mesmo tratamento das  │
 * │ demais leituras de catálogo (`domain/menus`: "LER catálogo é dado de TRABALHO e continua      │
 * │ ABERTO a qualquer autenticado"). A escrita, essa sim, é `@Roles("SUPER_ADMIN")` na outra       │
 * │ classe.                                                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E É ELE QUE SERVE O FILTRO, o que a §A.37 exige EXPLICITAMENTE ──────────────────────────────┐
 * │ "O catálogo do filtro vem de um ENDPOINT, nunca das linhas carregadas." Derivar as opções das │
 * │ vagas já carregadas encolheria a lista assim que o primeiro valor fosse escolhido, e não      │
 * │ haveria como somar o segundo sem limpar o filtro.                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PAYLOAD É CONGELADO NOS CINCO CAMPOS DO CATÁLOGO (`AsSegmento`): id, código, rótulo, ordem e
 * ativo. NÃO sai daqui contagem de clientes nem de vagas por segmento: isso é volume de operação, e
 * volume pertence à superfície gatada, não a uma rota que todo autenticado alcança. §A.6: nenhum
 * dado pessoal, nem direto nem agregado.
 */
@Controller("as/segmentos")
export class SegmentosController {
  constructor(private readonly segmentos: SegmentosService) {}

  /**
   * OS ATIVOS por padrão. `?incluirInativos=1` existe para o HISTÓRICO: a ficha de um cliente
   * cadastrado num segmento que saiu de circulação precisa do rótulo dele, senão mostra vazio no
   * lugar da classificação.
   */
  @Get()
  listar(@Query("incluirInativos") incluirInativos?: string): Promise<AsSegmento[]> {
    return this.segmentos.listar(incluirInativos === "1" || incluirInativos === "true");
  }
}
