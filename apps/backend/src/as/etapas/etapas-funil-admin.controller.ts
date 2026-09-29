import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import {
  CriarEtapaFunilDto,
  DefinirTomEtapaFunilDto,
  RenomearEtapaFunilDto,
  ReordenarEtapasFunilDto,
} from "./etapas-funil.dto";
import { EtapasFunilService } from "./etapas-funil.service";

/**
 * ─ O GERENCIADOR DAS ETAPAS DO FUNIL: A SUPERFÍCIE DE ESCRITA, E SÓ ELA ─────────────────────────
 *
 * ┌─ QUEM SEGURA A PORTA É O MENU, NÃO O PAPEL (regra do diretor, 27/09/2026) ────────────────────┐
 * │ O `@Roles("SUPER_ADMIN")` QUE MORAVA AQUI FOI REMOVIDO. A regra nova é que o Super Admin       │
 * │ concede QUALQUER tela a QUALQUER usuário, e com o papel na classe isso era impossível de       │
 * │ entregar: conceder o menu abria uma PORTA TRANCADA, e a marcação era descartada em silêncio    │
 * │ pelas listas de papel do domínio.                                                              │
 * │                                                                                                │
 * │ A AUTORIDADE PASSOU A SER O `MenuGuard`, que já reivindicava esta classe inteira               │
 * │ (`EtapasFunilAdminController.*`, menu `as-etapas`). Ele é FAIL-OPEN só para operação NÃO       │
 * │ reivindicada: sem aquela linha, remover o `@Roles` teria aberto a rota a QUALQUER AUTENTICADO. │
 * │ As duas mudanças só fazem sentido JUNTAS.                                                      │
 * │                                                                                                │
 * │ E O MASTER NÃO PASSA DE GRAÇA: `menu.guard.ts` o deixa passar por PERTENCER À ÁREA, e há       │
 * │ MASTER na área AS em produção. Quem fecha esse atalho é a entrada nominal do código em         │
 * │ `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, sem a qual todos eles ganhariam o catálogo sozinhos e   │
 * │ não sobraria decisão individual nenhuma para o diretor tomar.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE NÃO MUDOU: quem edita esta lista edita o VOCABULÁRIO em que todo o histórico de seleção está
 * escrito. Renomear uma etapa reescreve o nome dela em toda a linha do tempo de todo mundo que passou
 * por lá, e inativar tira a etapa de circulação para o time inteiro. É configuração de sistema, e o
 * catálogo segue RESTRITO: o que mudou é que a restrição passou a ser CONCEDÍVEL, pessoa a pessoa.
 *
 * A LEITURA VIVE NA OUTRA CLASSE (`EtapasFunilController`), aberta a qualquer autenticado: fechar a
 * leitura junto daria 403 no funil para o consultor que só precisa saber quais etapas existem. A
 * separação é afirmada, handler a handler, em `etapas-funil-menu.spec.ts`.
 *
 * §A.6: nenhum corpo aqui carrega dado pessoal, e nenhuma resposta devolve candidato. As contagens
 * que aparecem nas frases de recusa são NÚMEROS, sem nome e sem identificador.
 */
@Controller("admin/as/etapas")
export class EtapasFunilAdminController {
  constructor(private readonly etapas: EtapasFunilService) {}

  /** O código sai do rótulo e é imutável. Recriar uma inativada é recusado com o caminho certo. */
  @Post()
  criar(@Body() dto: CriarEtapaFunilDto) {
    return this.etapas.criar(dto);
  }

  /**
   * A ORDEM DO FUNIL. Recebe a lista COMPLETA de ids na ordem nova e reescreve `1..N`.
   *
   * ROTA DE CAMINHO FIXO ANTES DAS DE PARÂMETRO: sem isso o Nest casaria "ordem" como se fosse um
   * id, e o `ParseIntPipe` transformaria um erro de rota num 400 confuso.
   */
  @Patch("ordem")
  reordenar(@Body() dto: ReordenarEtapasFunilDto) {
    return this.etapas.reordenar(dto.ids);
  }

  /** Renomeia. O código NÃO muda: é a MESMA etapa, com o nome corrigido em todo o histórico. */
  @Patch(":id")
  renomear(@Param("id", ParseIntPipe) id: number, @Body() dto: RenomearEtapaFunilDto) {
    return this.etapas.renomear(id, dto);
  }

  /** A cor, da paleta fechada do design system. */
  @Patch(":id/tom")
  definirTom(@Param("id", ParseIntPipe) id: number, @Body() dto: DefinirTomEtapaFunilDto) {
    return this.etapas.definirTom(id, dto);
  }

  /** Onde a candidatura nasce. Exclusivo: marcar uma desmarca a anterior, na mesma transação. */
  @Patch(":id/inicial")
  definirInicial(@Param("id", ParseIntPipe) id: number) {
    return this.etapas.definirInicial(id);
  }

  /** Volta uma etapa inativada à circulação, com o mesmo código e o mesmo histórico. */
  @Patch(":id/reativar")
  reativar(@Param("id", ParseIntPipe) id: number) {
    return this.etapas.reativar(id);
  }

  /**
   * TIRA A ETAPA DE CIRCULAÇÃO, sem apagar nada. É a contraparte do `reativar`, e existe porque a
   * coluna Status da tela mostrava "Ativa" sem oferecer o caminho de volta: inativar só acontecia
   * como efeito colateral do `remover`, que APAGA quando não há histórico.
   *
   * MAIS SIMPLES QUE O `DELETE` DE PROPÓSITO (as três camadas não se aplicam: o verbo já disse que a
   * linha fica), e mesmo assim com as DUAS travas de integridade do catálogo, que são sobre o estado
   * em que ele fica e não sobre o caminho: nem a etapa INICIAL, nem a ÚLTIMA ATIVA.
   */
  @Patch(":id/inativar")
  inativar(@Param("id", ParseIntPipe) id: number) {
    return this.etapas.inativar(id);
  }

  /** As três camadas do apagar vivem no service (`remover`), com as travas e as frases. */
  @Delete(":id")
  remover(@Param("id", ParseIntPipe) id: number) {
    return this.etapas.remover(id);
  }
}
