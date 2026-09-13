import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { CriarSegmentoDto, RenomearSegmentoDto, ReordenarSegmentosDto } from "./segmentos.dto";
import { SegmentosService } from "./segmentos.service";

/**
 * ─ O GERENCIADOR DE SEGMENTOS: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ───────────────────────────────
 *
 * ┌─ `@Roles("SUPER_ADMIN")` NA PRÓPRIA CONTROLLER ───────────────────────────────────────────────┐
 * │ O MENU SOZINHO NÃO SEGURA O MASTER, e isto está conferido no código, não suposto:             │
 * │ `menu.guard.ts` deixa o MASTER passar por PERTENCER À ÁREA do menu ("MASTER manda na área     │
 * │ inteira: dentro dela, segue sem depender de marcação"), e há MASTER na área AS em produção.   │
 * │ Um menu de área AS, sozinho, entregaria este catálogo a eles.                                 │
 * │                                                                                                │
 * │ POR QUE ISSO IMPORTA AQUI: quem edita esta lista edita a CLASSIFICAÇÃO DA CARTEIRA INTEIRA.   │
 * │ Renomear um segmento reescreve o nome dele em todo cliente e em toda vaga que já apontam, e   │
 * │ inativar tira o segmento de circulação para o time todo. É configuração de sistema, não        │
 * │ operação de vaga.                                                                              │
 * │                                                                                                │
 * │ O `@Roles` É A AUTORIDADE (fail-closed no `RolesGuard`); o menu é a camada de UX que decide se │
 * │ o card aparece. Mesmo padrão do `LinhasServicoAdminController` e do `EtapasFunilAdminController`│
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O `DELETE` EXISTE, E SÓ ALCANÇA QUEM NUNCA FOI USADO ────────────────────────────────────────┐
 * │ Ele é para o erro de digitação recém-cometido, não para "tirar de circulação": para isso é o  │
 * │ `inativar`, que preserva o rótulo dos cadastros antigos. A recusa conta CLIENTES **e** VAGAS  │
 * │ (o molde contava só vagas, e por isso deixava um 500 de FK escapar) e diz o caminho certo.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum corpo aqui carrega dado pessoal, e nenhuma resposta devolve cliente nem vaga. As
 * contagens que aparecem nas frases de recusa são NÚMEROS, sem nome e sem identificador.
 */
@Controller("admin/as/segmentos")
@Roles("SUPER_ADMIN")
export class SegmentosAdminController {
  constructor(private readonly segmentos: SegmentosService) {}

  /** O código sai do rótulo e é imutável. Recriar um inativado é recusado com o caminho certo. */
  @Post()
  criar(@Body() dto: CriarSegmentoDto) {
    return this.segmentos.criar(dto);
  }

  /**
   * A ORDEM DO SELETOR. Recebe a lista COMPLETA de ids na ordem nova e reescreve `1..N`.
   *
   * ROTA DE CAMINHO FIXO ANTES DAS DE PARÂMETRO: sem isso o Nest casaria "ordem" como se fosse um
   * id, e o `ParseIntPipe` transformaria um erro de rota num 400 confuso.
   */
  @Patch("ordem")
  reordenar(@Body() dto: ReordenarSegmentosDto) {
    return this.segmentos.reordenar(dto.ids);
  }

  /** Renomeia. O código NÃO muda: é o MESMO segmento, com o nome corrigido em todos os cadastros. */
  @Patch(":id")
  renomear(@Param("id", ParseIntPipe) id: number, @Body() dto: RenomearSegmentoDto) {
    return this.segmentos.renomear(id, dto);
  }

  /** Volta um segmento inativado à circulação, com o mesmo código e os mesmos cadastros apontando. */
  @Patch(":id/reativar")
  reativar(@Param("id", ParseIntPipe) id: number) {
    return this.segmentos.reativar(id);
  }

  /** Tira de circulação sem apagar nada. RECUSA quando cliente ou vaga ainda apontam (etapa fantasma). */
  @Patch(":id/inativar")
  inativar(@Param("id", ParseIntPipe) id: number) {
    return this.segmentos.inativar(id);
  }

  /** Apaga de verdade, e só quem NUNCA foi usado. As travas e as frases vivem no service. */
  @Delete(":id")
  remover(@Param("id", ParseIntPipe) id: number) {
    return this.segmentos.remover(id);
  }
}
