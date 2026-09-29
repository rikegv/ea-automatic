import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  AtualizarMotivoReenvioShortlistDto,
  CriarMotivoReenvioShortlistDto,
} from "./motivos-reenvio-shortlist.dto";
import { MotivosReenvioShortlistService } from "./motivos-reenvio-shortlist.service";

/**
 * ─ A ADMINISTRAÇÃO DOS MOTIVOS DE REENVIO: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ───────────────────
 *
 * ┌─ QUEM SEGURA A PORTA É O MENU, NÃO O PAPEL (regra do diretor, 27/09/2026) ──────────────────┐
 * │ O `@Roles("SUPER_ADMIN")` QUE MORAVA AQUI FOI REMOVIDO: o Super Admin concede QUALQUER tela │
 * │ a QUALQUER usuário, e com o papel na classe a concessão do menu abria uma PORTA TRANCADA    │
 * │ (403 já no `@Get` que a tela de administração lê ao abrir).                                 │
 * │                                                                                             │
 * │ A REIVINDICAÇÃO DO MENU PASSOU A SER A AUTORIDADE, e ela nunca foi dispensável: o            │
 * │ `MenuGuard` é FAIL-OPEN para operação NÃO reivindicada, então sem a entrada em               │
 * │ `domain/menus` (`MotivosReenvioShortlistAdminController.*`, menu `as-motivos-reenvio`) esta  │
 * │ rota ficaria alcançável por qualquer autenticado que soubesse a URL.                         │
 * │                                                                                             │
 * │ E O MASTER NÃO PASSA DE GRAÇA: o `MenuGuard` o deixa passar por PERTENCER À ÁREA, e há       │
 * │ MASTER na área AS em produção. Quem fecha esse atalho é a entrada nominal do código em      │
 * │ `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`.                                                      │
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
