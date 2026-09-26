import { Controller, Get, Query } from "@nestjs/common";
import type { AsEtapaFunil } from "@ea/shared-types";
import { EtapasFunilService } from "./etapas-funil.service";

/**
 * ─ A LEITURA DO CATÁLOGO DE ETAPAS. CLASSE SEPARADA, E A SEPARAÇÃO É A REGRA ────────────────────
 *
 * ┌─ POR QUE DUAS CONTROLLERS E NÃO UMA ───────────────────────────────────────────────────────────┐
 * │ O `MenuGuard` resolve a permissão por NOME DE CLASSE (`menuDaOperacao`, em `domain/menus`).    │
 * │ Uma classe só, reivindicada com `.*` pelo menu de administração, fecharia JUNTO este `GET`, e o│
 * │ funil inteiro (a pill da etapa, os cards do mover, o seletor do lote) passaria a dar 403 para o│
 * │ consultor COMUM que precisa apenas SABER quais etapas existem.                                  │
 * │                                                                                                 │
 * │ ESTA CLASSE NÃO É REIVINDICADA POR MENU NENHUM, e isso é DELIBERADO, no mesmo tratamento das   │
 * │ demais leituras de catálogo do sistema (`domain/menus`, linhas 16-18: "LER catálogo é dado de  │
 * │ TRABALHO e continua ABERTO a qualquer autenticado"). "Aberto" aqui é a AUSÊNCIA de uma          │
 * │ reivindicação, e ausência não se defende sozinha: por isso existe `etapas-funil-menu.spec.ts`, │
 * │ que afirma handler a handler que esta classe resolve para `null` e a de escrita para           │
 * │ `as-etapas`. Reivindicar esta aqui quebra o teste antes de quebrar a operação.                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PAYLOAD É CONGELADO NOS SETE CAMPOS DO CATÁLOGO (`AsEtapaFunil`): id, código, rótulo, ordem,
 * tom, inicial e ativa. NÃO sai daqui contagem de candidatura por etapa: isso é VOLUME DE PIPELINE
 * de A&S, e volume de pipeline pertence à superfície gatada, não a uma rota que todo autenticado
 * alcança. §A.6: nenhum dado pessoal, nem direto nem agregado.
 */
@Controller("as/etapas")
export class EtapasFunilController {
  constructor(private readonly etapas: EtapasFunilService) {}

  /**
   * AS ATIVAS por padrão. `?incluirInativas=1` existe para o HISTÓRICO: a linha do tempo de quem
   * passou por uma etapa desativada precisa do rótulo dela, senão mostra o código cru.
   */
  @Get()
  listar(@Query("incluirInativas") incluirInativas?: string): Promise<AsEtapaFunil[]> {
    return this.etapas.listar(incluirInativas === "1" || incluirInativas === "true");
  }

  /**
   * ─ EM QUAIS ETAPAS SE MARCA ENTREVISTA (Frente E, ponto 8) ────────────────────────────────────
   *
   * ROTA PRÓPRIA, E SÓ OS CÓDIGOS, e as duas coisas são a mesma decisão: o payload do `GET
   * /as/etapas` é CONGELADO em sete campos por um teste que existe justamente para pegar o campo a
   * mais (`etapas-funil.leitura-sem-contagem.spec.ts`), e acrescentar o flag lá derrubaria aquele
   * teste com razão. Aqui o recorte é explícito e mínimo: uma lista de códigos, sem rótulo, sem
   * ordem e sem contagem nenhuma.
   *
   * PARA QUE A TELA PRECISA: decidir se o controle de "marcar entrevista" aparece para a etapa em
   * que a pessoa está. Sem ela, a tela compararia com `"ENTREVISTA_SOULAN"`, que é exatamente o
   * literal de catálogo que esta frente inteira existe para não escrever.
   *
   * ABERTA, como a listagem ao lado e pela mesma razão: é dado de TRABALHO do consultor COMUM, e
   * fechá-la esconderia o botão de quem marca entrevista. §A.6: uma lista de códigos de etapa.
   */
  @Get("com-entrevista")
  async comEntrevista(): Promise<string[]> {
    return [...(await this.etapas.codigosComEntrevista())];
  }
}
