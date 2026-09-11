import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import {
  CriarLinhaServicoDto,
  RenomearLinhaServicoDto,
  ReordenarLinhasServicoDto,
} from "./linhas-servico.dto";
import { LinhasServicoService } from "./linhas-servico.service";

/**
 * ─ O GERENCIADOR DAS LINHAS DE SERVIÇO: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ──────────────────────
 *
 * ┌─ `@Roles("SUPER_ADMIN")` NA PRÓPRIA CONTROLLER ───────────────────────────────────────────────┐
 * │ O MENU SOZINHO NÃO SEGURA O MASTER, e isto está conferido no código, não suposto:             │
 * │ `menu.guard.ts` deixa o MASTER passar por PERTENCER À ÁREA do menu ("MASTER manda na área     │
 * │ inteira: dentro dela, segue sem depender de marcação"), e há MASTER na área AS em produção.   │
 * │ Um menu de área AS, sozinho, entregaria este catálogo a eles.                                 │
 * │                                                                                                │
 * │ POR QUE ISSO IMPORTA AQUI: quem edita esta lista edita a CLASSIFICAÇÃO DA OPERAÇÃO INTEIRA.   │
 * │ Renomear uma linha reescreve o nome dela em toda vaga que já aponta para ela, e inativar tira │
 * │ a linha de circulação para o time todo, num campo que é OBRIGATÓRIO para publicar vaga. É     │
 * │ configuração de sistema, não operação de vaga.                                                 │
 * │                                                                                                │
 * │ O `@Roles` É A AUTORIDADE (fail-closed no `RolesGuard`); o menu é a camada de UX que decide se │
 * │ o card aparece. Mesmo padrão do `EtapasFunilAdminController`.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A LEITURA VIVE NA OUTRA CLASSE (`LinhasServicoController`), aberta a qualquer autenticado: fechar
 * a leitura junto travaria a abertura de vaga do consultor. A separação é afirmada, handler a
 * handler, em `linhas-servico-menu.spec.ts`.
 *
 * §A.6: nenhum corpo aqui carrega dado pessoal, e nenhuma resposta devolve candidato. As contagens
 * que aparecem nas frases de recusa são NÚMEROS, sem nome e sem identificador.
 */
@Controller("admin/as/linhas-servico")
@Roles("SUPER_ADMIN")
export class LinhasServicoAdminController {
  constructor(private readonly linhas: LinhasServicoService) {}

  /** O código sai do rótulo e é imutável. Recriar uma inativada é recusado com o caminho certo. */
  @Post()
  criar(@Body() dto: CriarLinhaServicoDto) {
    return this.linhas.criar(dto);
  }

  /**
   * A ORDEM DO SELETOR. Recebe a lista COMPLETA de ids na ordem nova e reescreve `1..N`.
   *
   * ROTA DE CAMINHO FIXO ANTES DAS DE PARÂMETRO: sem isso o Nest casaria "ordem" como se fosse um
   * id, e o `ParseIntPipe` transformaria um erro de rota num 400 confuso.
   */
  @Patch("ordem")
  reordenar(@Body() dto: ReordenarLinhasServicoDto) {
    return this.linhas.reordenar(dto.ids);
  }

  /** Renomeia. O código NÃO muda: é a MESMA linha, com o nome corrigido em todas as vagas. */
  @Patch(":id")
  renomear(@Param("id", ParseIntPipe) id: number, @Body() dto: RenomearLinhaServicoDto) {
    return this.linhas.renomear(id, dto);
  }

  /** Volta uma linha inativada à circulação, com o mesmo código e as mesmas vagas apontando. */
  @Patch(":id/reativar")
  reativar(@Param("id", ParseIntPipe) id: number) {
    return this.linhas.reativar(id);
  }

  /** Tira de circulação sem apagar nada. Recusa a ÚLTIMA ATIVA: sem linha, nenhuma vaga publica. */
  @Patch(":id/inativar")
  inativar(@Param("id", ParseIntPipe) id: number) {
    return this.linhas.inativar(id);
  }

  /** Apaga de verdade, e só quem NUNCA foi usada. As travas e as frases vivem no service. */
  @Delete(":id")
  remover(@Param("id", ParseIntPipe) id: number) {
    return this.linhas.remover(id);
  }
}
