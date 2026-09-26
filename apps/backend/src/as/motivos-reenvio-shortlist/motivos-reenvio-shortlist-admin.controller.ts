import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import {
  AtualizarMotivoReenvioShortlistDto,
  CriarMotivoReenvioShortlistDto,
} from "./motivos-reenvio-shortlist.dto";
import { MotivosReenvioShortlistService } from "./motivos-reenvio-shortlist.service";

/**
 * ─ A ADMINISTRAÇÃO DOS MOTIVOS DE REENVIO: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ───────────────────
 *
 * ┌─ `@Roles("SUPER_ADMIN")` NA PRÓPRIA CONTROLLER, E ELE NÃO É REDUNDANTE ────────────────────┐
 * │ O MENU SOZINHO NÃO SEGURA O MASTER, e isto está conferido no código, não suposto: o         │
 * │ `MenuGuard` deixa o MASTER passar por PERTENCER À ÁREA do menu, e há MASTER na área AS em    │
 * │ produção. Um menu de área AS, sozinho, entregaria a edição deste catálogo a eles.            │
 * │                                                                                             │
 * │ E A REIVINDICAÇÃO DO MENU CONTINUA OBRIGATÓRIA, pelo lado oposto: o `MenuGuard` é FAIL-OPEN  │
 * │ para operação NÃO reivindicada, então sem a entrada em `domain/menus` esta rota nasceria     │
 * │ alcançável por qualquer autenticado que soubesse a URL. As duas camadas recusam por motivos  │
 * │ independentes, e nenhuma depende de a outra estar certa.                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE ISSO IMPORTA NUMA LISTA DE NOMES: o id daqui fica GRAVADO na shortlist, e quem edita esta
 * lista edita o vocabulário em que TODO reenvio passa a ser lido, inclusive os já gravados (a FK
 * resolve pelo nome de HOJE). É configuração de sistema, não operação de candidato.
 *
 * A LEITURA VIVE NA OUTRA CLASSE (`MotivosReenvioShortlistController`), aberta a qualquer
 * autenticado: fechar a leitura junto daria 403 no seletor de motivo para o consultor que reenvia.
 *
 * §A.6: nomes de motivo e um flag. Nenhum dado pessoal em nenhuma destas rotas.
 */
@Controller("admin/as/motivos-reenvio-shortlist")
@Roles("SUPER_ADMIN")
export class MotivosReenvioShortlistAdminController {
  constructor(private readonly motivos: MotivosReenvioShortlistService) {}

  /** ATIVOS E INATIVOS: a tela de administração precisa enxergar o que desligou para poder religar. */
  @Get()
  listar() {
    return this.motivos.list();
  }

  @Post()
  criar(@Body() dto: CriarMotivoReenvioShortlistDto) {
    return this.motivos.criar(dto);
  }

  /** Renomeia (corrige grafia) e liga/desliga. Nome repetido volta 409, nunca 500 do driver. */
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: AtualizarMotivoReenvioShortlistDto) {
    return this.motivos.atualizar(id, dto);
  }

  /** Volta o motivo à circulação, com o mesmo nome e sem tocar em shortlist nenhuma. */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.motivos.reativar(id);
  }

  /**
   * INATIVAÇÃO, e NÃO exclusão física (§A.3/§A.6). O DELETE só seta `ativo=false`: as shortlists já
   * enviadas apontam para esta linha pela FK `restrict`, e o gesto é reversível pelo `reativar`.
   */
  @Delete(":id")
  inativar(@Param("id") id: string) {
    return this.motivos.inativar(id);
  }
}
