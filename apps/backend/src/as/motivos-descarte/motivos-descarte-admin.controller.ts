import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { AtualizarMotivoDescarteDto, CriarMotivoDescarteDto } from "./motivos-descarte.dto";
import { MotivosDescarteService } from "./motivos-descarte.service";

/**
 * ─ A ADMINISTRAÇÃO DOS MOTIVOS DE DESCARTE: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ──────────────────
 *
 * ┌─ QUEM SEGURA ESTA ROTA É O MENU, E NÃO O PAPEL (decisão do diretor) ───────────────────────┐
 * │ O `@Roles("SUPER_ADMIN")` QUE MORAVA AQUI FOI REMOVIDO DE PROPÓSITO. O diretor pediu que    │
 * │ este catálogo continuasse RESTRITO e passasse a ser CONCEDÍVEL: ele decide, um a um, quem   │
 * │ edita a lista. Com o papel na classe, conceder o menu entregava uma PORTA TRANCADA, e o 403 │
 * │ acontecia no CARREGAMENTO da tela (ela lê o `GET` daqui ao abrir), não só ao salvar.        │
 * │                                                                                             │
 * │ A AUTORIDADE PASSA A SER O `MenuGuard`, que já reivindica esta classe inteira pelo menu     │
 * │ `as-motivos-descarte` (`MotivosDescarteAdminController.*`, em `domain/menus`). Ele é        │
 * │ FAIL-OPEN só para operação NÃO REIVINDICADA, e esta é reivindicada: quem não tem o menu não │
 * │ alcança a rota nem digitando a URL.                                                          │
 * │                                                                                             │
 * │ E O ATALHO DO MASTER FOI FECHADO NOMINALMENTE, que é o que faz a decisão do diretor valer:  │
 * │ o `MenuGuard` deixa o MASTER passar sem marcação quando o menu está FORA de                 │
 * │ `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, e há MASTER na área AS em produção. Sem a entrada    │
 * │ nominal daquela lista, TODO MASTER ganharia este catálogo sozinho e não haveria decisão     │
 * │ individual nenhuma a tomar. NÃO TIRE `as-motivos-descarte` DAQUELA LISTA.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE ISSO IMPORTA MAIS DO QUE PARECE NUMA LISTA DE NOMES: é o NOME daqui que fica GRAVADO na
 * candidatura encerrada, e quem edita esta lista edita o vocabulário em que TODO descarte passa a
 * ser escrito. É configuração de sistema, não operação de candidato.
 *
 * A LEITURA VIVE NA OUTRA CLASSE (`MotivosDescarteController`), aberta a qualquer autenticado, e
 * ela NÃO é reivindicada por menu nenhum: fechar a leitura junto daria 403 no seletor de motivo
 * para o consultor que precisa descartar, e o `MenuGuard` resolve por NOME DE CLASSE.
 *
 * §A.6: nomes de motivo e um flag. Nenhum dado pessoal em nenhuma destas rotas.
 */
@Controller("admin/as/motivos-descarte")
export class MotivosDescarteAdminController {
  constructor(private readonly motivos: MotivosDescarteService) {}

  /** ATIVOS E INATIVOS: a tela de administração precisa enxergar o que desligou para poder religar. */
  @Get()
  listar() {
    return this.motivos.list();
  }

  @Post()
  criar(@Body() dto: CriarMotivoDescarteDto) {
    return this.motivos.criar(dto);
  }

  /** Renomeia (corrige grafia) e liga/desliga. Nome repetido volta 409, nunca 500 do driver. */
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: AtualizarMotivoDescarteDto) {
    return this.motivos.atualizar(id, dto);
  }

  /** Volta o motivo à circulação, com o mesmo nome e sem tocar em candidatura nenhuma. */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.motivos.reativar(id);
  }

  /**
   * INATIVAÇÃO, e NÃO exclusão física (§A.3/§A.6). O DELETE só seta `ativo=false`: as candidaturas
   * já encerradas guardam o NOME do motivo e não são tocadas, e o gesto é reversível pelo
   * `reativar`.
   */
  @Delete(":id")
  inativar(@Param("id") id: string) {
    return this.motivos.inativar(id);
  }
}
