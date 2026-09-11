import { Controller, Get, Query } from "@nestjs/common";
import type { AsLinhaDeServico } from "@ea/shared-types";
import { LinhasServicoService } from "./linhas-servico.service";

/**
 * ─ A LEITURA DO CATÁLOGO DE LINHAS DE SERVIÇO. CLASSE SEPARADA, E A SEPARAÇÃO É A REGRA ────────
 *
 * ┌─ POR QUE DUAS CONTROLLERS E NÃO UMA ──────────────────────────────────────────────────────────┐
 * │ O `MenuGuard` resolve a permissão por NOME DE CLASSE (`menuDaOperacao`, em `domain/menus`).   │
 * │ Uma classe só, reivindicada com `.*` pelo menu de administração, fecharia JUNTO este `GET`, e │
 * │ o seletor da ABERTURA DE VAGA passaria a dar 403 para o consultor COMUM, que é exatamente     │
 * │ quem abre vaga. E como a linha de serviço é OBRIGATÓRIA para publicar, o 403 não seria um     │
 * │ campo vazio: seria a abertura de vaga inteira travada para o time.                            │
 * │                                                                                                │
 * │ ESTA CLASSE NÃO É REIVINDICADA POR MENU NENHUM, e isso é DELIBERADO, no mesmo tratamento das  │
 * │ demais leituras de catálogo (`domain/menus`: "LER catálogo é dado de TRABALHO e continua      │
 * │ ABERTO a qualquer autenticado"). "Aberto" aqui é a AUSÊNCIA de uma reivindicação, e ausência  │
 * │ não se defende sozinha: por isso existe `linhas-servico-menu.spec.ts`, que afirma handler a   │
 * │ handler que esta classe resolve para `null` e a de escrita para `as-linhas-servico`.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PAYLOAD É CONGELADO NOS CINCO CAMPOS DO CATÁLOGO (`AsLinhaDeServico`): id, código, rótulo, ordem
 * e ativo. NÃO sai daqui contagem de vagas por linha: isso é volume de operação de A&S, e volume
 * pertence à superfície gatada, não a uma rota que todo autenticado alcança. §A.6: nenhum dado
 * pessoal, nem direto nem agregado.
 */
@Controller("as/linhas-servico")
export class LinhasServicoController {
  constructor(private readonly linhas: LinhasServicoService) {}

  /**
   * AS ATIVAS por padrão. `?incluirInativas=1` existe para o HISTÓRICO: a ficha de uma vaga antiga
   * precisa do rótulo da linha desativada, senão mostra vazio no lugar da classificação.
   */
  @Get()
  listar(@Query("incluirInativas") incluirInativas?: string): Promise<AsLinhaDeServico[]> {
    return this.linhas.listar(incluirInativas === "1" || incluirInativas === "true");
  }
}
