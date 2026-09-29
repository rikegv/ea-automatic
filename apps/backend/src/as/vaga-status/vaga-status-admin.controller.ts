import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { AtualizarVagaStatusDto, CriarVagaStatusDto } from "./vaga-status.dto";
import { VagaStatusService } from "./vaga-status.service";

/**
 * ─ O GERENCIADOR DE STATUS DA VAGA: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ──────────────────────────
 *
 * ┌─ QUEM SEGURA A PORTA É O MENU, NÃO O PAPEL (regra do diretor, 27/09/2026) ────────────────────┐
 * │ O `@Roles("SUPER_ADMIN")` QUE MORAVA AQUI FOI REMOVIDO: o Super Admin concede QUALQUER tela a  │
 * │ QUALQUER usuário, e com o papel na classe a concessão abria uma porta trancada. A autoridade   │
 * │ passou a ser o `MenuGuard`, que já reivindicava esta classe inteira                            │
 * │ (`VagaStatusAdminController.*`, menu `as-status-vaga`). Sem aquela reivindicação, remover o    │
 * │ `@Roles` teria ABERTO a rota a qualquer autenticado: o guard é fail-open para operação sem     │
 * │ dono.                                                                                          │
 * │                                                                                                │
 * │ O MENU SOZINHO NÃO SEGURA O MASTER, e isto foi conferido no código, não suposto:               │
 * │ `menu.guard.ts` deixa o MASTER passar por PERTENCER À ÁREA do menu ("MASTER manda na área      │
 * │ inteira: dentro dela, segue sem depender de marcação"), e há MASTER na área AS em produção.    │
 * │ Quem fecha esse atalho é a entrada nominal do código em                                        │
 * │ `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, sem a qual todos eles ganhariam este catálogo sozinhos. │
 * │                                                                                                │
 * │ POR QUE ISSO IMPORTA MAIS AQUI DO QUE NO CATÁLOGO DE ETAPAS: as etapas são POSIÇÃO no funil, e │
 * │ o pior que uma edição errada faz é bagunçar a fila. AQUI OS CAMPOS SÃO TRAVAS. Ligar           │
 * │ `recebeCandidato` num status terminal devolve alocação a vaga encerrada (o furo de 09/09);     │
 * │ desligar `movivelManualmente` no status de ABERTURA transforma em zumbi toda vaga que estiver  │
 * │ num status do diretor, porque fechar e cancelar exigem o papel ABERTURA. É configuração de     │
 * │ sistema com efeito de trava, não operação de vaga. O catálogo segue RESTRITO: o que mudou é    │
 * │ que a restrição passou a ser CONCEDÍVEL, pessoa a pessoa, pela tela do diretor.                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A LEITURA VIVE NA OUTRA CLASSE (`VagaStatusController`), aberta a qualquer autenticado: fechar a
 * leitura junto daria 403 na pill de status da Central de Vagas para o consultor que só precisa
 * saber quais status existem.
 *
 * §A.6: nenhum corpo aqui carrega dado pessoal, e nenhuma resposta devolve vaga ou candidato. As
 * contagens que aparecem nas frases de recusa são NÚMEROS, sem id e sem nome.
 */
@Controller("admin/as/status-vaga")
export class VagaStatusAdminController {
  constructor(private readonly status: VagaStatusService) {}

  /** O código sai do rótulo e é imutável. Nasce sempre LIVRE. Recriar um inativo é recusado. */
  @Post()
  criar(@Body() dto: CriarVagaStatusDto) {
    return this.status.criar(dto);
  }

  /**
   * RÓTULO, ORDEM, COR e, SÓ NA LINHA DO DIRETOR, os três flags de comportamento. O que não vale
   * para aquela linha é descartado pelo service, não recusado (ver `atualizar`).
   */
  @Patch(":id")
  atualizar(@Param("id", ParseIntPipe) id: number, @Body() dto: AtualizarVagaStatusDto) {
    return this.status.atualizar(id, dto);
  }

  /** Tira de circulação sem apagar. Recusa linha de papel e status com vaga dentro. */
  @Patch(":id/inativar")
  inativar(@Param("id", ParseIntPipe) id: number) {
    return this.status.inativar(id);
  }

  /** Volta um status inativado à circulação, com o mesmo código e o mesmo histórico. */
  @Patch(":id/reativar")
  reativar(@Param("id", ParseIntPipe) id: number) {
    return this.status.reativar(id);
  }

  /** As três camadas do apagar vivem no service (`remover`), com as travas e as frases. */
  @Delete(":id")
  remover(@Param("id", ParseIntPipe) id: number) {
    return this.status.remover(id);
  }
}
