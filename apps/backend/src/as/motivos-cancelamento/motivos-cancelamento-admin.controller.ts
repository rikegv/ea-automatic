import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  AtualizarMotivoCancelamentoVagaDto,
  CriarMotivoCancelamentoVagaDto,
} from "./motivos-cancelamento.dto";
import { MotivosCancelamentoVagaService } from "./motivos-cancelamento.service";

/**
 * ─ A ADMINISTRAÇÃO DOS MOTIVOS DE CANCELAMENTO DE VAGA: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ──────
 *
 * ┌─ QUEM SEGURA A PORTA É O MENU, NÃO O PAPEL (regra do diretor, 27/09/2026) ──────────────────┐
 * │ O `@Roles("SUPER_ADMIN")` QUE MORAVA AQUI FOI REMOVIDO: o Super Admin concede QUALQUER tela │
 * │ a QUALQUER usuário, e com o papel na classe a concessão do menu abria uma PORTA TRANCADA    │
 * │ (403 já no `@Get` que a tela lê ao abrir), com a marcação descartada em silêncio.           │
 * │                                                                                             │
 * │ A AUTORIDADE É O `MenuGuard`, que já reivindicava esta classe inteira                       │
 * │ (`MotivosCancelamentoVagaAdminController.*`, menu `as-motivos-cancelamento`). A             │
 * │ reivindicação NÃO é dispensável: o guard é FAIL-OPEN para operação não reivindicada, então  │
 * │ sem ela remover o papel teria aberto a escrita a qualquer autenticado, que é exatamente o   │
 * │ defeito do molde `admin/motivos-declinio`.                                                  │
 * │                                                                                             │
 * │ E O MASTER NÃO PASSA DE GRAÇA: o `MenuGuard` o deixa passar por PERTENCER À ÁREA, e há       │
 * │ MASTER na área AS em produção. Quem fecha esse atalho é a entrada nominal do código em      │
 * │ `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`.                                                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE ISSO IMPORTA MAIS DO QUE PARECE NUMA LISTA DE NOMES: é o NOME daqui que fica GRAVADO na
 * vaga cancelada, e o cancelamento é a segunda porta para o estado terminal da vaga. Quem edita esta
 * lista edita o vocabulário em que a trilha de cancelamento está escrita. É configuração de sistema,
 * não operação de vaga.
 *
 * A LEITURA VIVE NA OUTRA CLASSE (`MotivosCancelamentoVagaController`), aberta a qualquer
 * autenticado: fechar a leitura junto daria 403 no seletor de motivo para o consultor que precisa
 * cancelar a vaga.
 *
 * §A.6: nomes de motivo e um flag. Nenhum dado pessoal em nenhuma destas rotas.
 */
@Controller("admin/as/motivos-cancelamento")
export class MotivosCancelamentoVagaAdminController {
  constructor(private readonly motivos: MotivosCancelamentoVagaService) {}

  /** ATIVOS E INATIVOS: a tela de administração precisa enxergar o que desligou para poder religar. */
  @Get()
  listar() {
    return this.motivos.list();
  }

  @Post()
  criar(@Body() dto: CriarMotivoCancelamentoVagaDto) {
    return this.motivos.criar(dto);
  }

  /** Renomeia (corrige grafia) e liga/desliga. Nome repetido volta 409, nunca 500 do driver. */
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: AtualizarMotivoCancelamentoVagaDto) {
    return this.motivos.atualizar(id, dto);
  }

  /** Volta o motivo à circulação, com o mesmo nome e sem tocar em vaga nenhuma. */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.motivos.reativar(id);
  }

  /**
   * INATIVAÇÃO, e NÃO exclusão física (§A.3/§A.6). O DELETE só seta `ativo=false`: as vagas já
   * canceladas guardam o NOME do motivo e não são tocadas, e o gesto é reversível pelo `reativar`.
   */
  @Delete(":id")
  inativar(@Param("id") id: string) {
    return this.motivos.inativar(id);
  }
}
