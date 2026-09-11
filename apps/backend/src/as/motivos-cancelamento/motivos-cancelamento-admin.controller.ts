import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import {
  AtualizarMotivoCancelamentoVagaDto,
  CriarMotivoCancelamentoVagaDto,
} from "./motivos-cancelamento.dto";
import { MotivosCancelamentoVagaService } from "./motivos-cancelamento.service";

/**
 * ─ A ADMINISTRAÇÃO DOS MOTIVOS DE CANCELAMENTO DE VAGA: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ──────
 *
 * ┌─ `@Roles("SUPER_ADMIN")` NA PRÓPRIA CONTROLLER, E ELE NÃO É REDUNDANTE ────────────────────┐
 * │ O MENU SOZINHO NÃO SEGURA O MASTER, e isto está conferido no código, não suposto: o         │
 * │ `MenuGuard` deixa o MASTER passar por PERTENCER À ÁREA do menu, e há MASTER na área AS em    │
 * │ produção. Um menu de área AS, sozinho, entregaria a edição deste catálogo a eles.            │
 * │                                                                                             │
 * │ E O MOLDE MAIS PRÓXIMO ESTÁ ERRADO PARA ESTE CASO: `admin/motivos-declinio` não tem `@Roles` │
 * │ nenhum, e o `MenuGuard` é FAIL-OPEN para operação não reivindicada. Copiá-lo aqui deixaria a │
 * │ escrita aberta. O molde certo é `EtapasFunilAdminController`: quem segura rota é o `@Roles`, │
 * │ que é fail-closed no `RolesGuard`; o menu é a camada de UX que decide se o card aparece.     │
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
@Roles("SUPER_ADMIN")
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
