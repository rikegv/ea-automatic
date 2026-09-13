import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import type { AsComercialGravado } from "./comerciais.service";
import { Roles } from "../../auth/decorators";
import { CriarComercialDto, RenomearComercialDto, ReordenarComerciaisDto } from "./comerciais.dto";
import { ComerciaisService } from "./comerciais.service";

/**
 * ─ O GERENCIADOR DE COMERCIAIS: A ÚNICA CONTROLLER DESTE CATÁLOGO, LEITURA INCLUÍDA ────────────
 *
 * ┌─ AQUI A LEITURA **NÃO** SE SEPARA EM UMA CLASSE ABERTA, E ESSA É A DECISÃO DA ONDA (§A.6) ────┐
 * │ Os quatro catálogos vizinhos (etapas, status, motivos, linhas de serviço) têm DUAS classes: a │
 * │ escrita fechada e a leitura ABERTA a qualquer sessão autenticada, porque a lista deles é      │
 * │ inócua ("SouFast", "Triagem"). **ESTE CATÁLOGO É A FOLHA DO TIME COMERCIAL.** Copiar o molde  │
 * │ entregaria a lista inteira de nomes a qualquer sessão válida, incluindo os COMUM da Admissão, │
 * │ que não têm nada com A&S, num `curl`.                                                          │
 * │                                                                                                │
 * │ O REPOSITÓRIO JÁ JULGOU ISSO DUAS VEZES DO MESMO JEITO: `GerencialController.nomes` e         │
 * │ `AltoVolumeController.pessoasDaLoja` foram reivindicados por menu JUSTAMENTE por devolverem   │
 * │ nome, e o `as-candidatos` fechou a controller inteira, leitura incluída, por ser a primeira   │
 * │ superfície de A&S com dado pessoal. Esta é a terceira aplicação da mesma régua.                │
 * │                                                                                                │
 * │ QUEM PRECISA DA LISTA E NÃO É O GERENCIADOR A RECEBE POR SUPERFÍCIE JÁ GATADA:                 │
 * │   . o FILTRO e os SELETORES da Central De Vagas, por `VagasService.opcoes()`, que já vive      │
 * │     atrás de `VagasController.*` (menu `as-vagas`) e já devolve exatamente este tipo de par    │
 * │     em `consultores: { id, nome }[]`;                                                          │
 * │   . o SELETOR do cadastro de cliente, por rota do próprio módulo de clientes, gatada.          │
 * │ Nenhuma rota nova aberta, em lugar nenhum.                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `@Roles("SUPER_ADMIN")` NA PRÓPRIA CONTROLLER, e o menu NÃO substitui isso ──────────────────┐
 * │ `menu.guard.ts` deixa o MASTER passar por PERTENCER À ÁREA do menu ("MASTER manda na área     │
 * │ inteira: dentro dela, segue sem depender de marcação"), e há MASTER na área AS em produção.   │
 * │ Um menu de área AS, sozinho, entregaria esta lista a eles. O `@Roles` é a autoridade           │
 * │ (fail-closed no `RolesGuard`); o menu é a camada de UX que decide se o card aparece.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O `DELETE` EXISTE E SÓ ALCANÇA QUEM NUNCA FOI USADO: ele é para o nome digitado errado, não para
 * "fulano saiu da empresa", que é o `inativar` (preserva de quem era cada cliente). A recusa conta
 * CLIENTES **e** VAGAS, com NÚMERO e sem nome.
 */
@Controller("admin/as/comerciais")
@Roles("SUPER_ADMIN")
export class ComerciaisAdminController {
  constructor(private readonly comerciais: ComerciaisService) {}

  /**
   * A LISTA PARA A TELA DO GERENCIADOR, e ela mora AQUI, atrás do `@Roles`, e não numa classe
   * aberta: é a metade da decisão explicada no cabeçalho.
   *
   * `?incluirInativos=1` para o gerenciador mostrar quem saiu (é ele quem reativa).
   */
  @Get()
  listar(@Query("incluirInativos") incluirInativos?: string): Promise<AsComercialGravado[]> {
    return this.comerciais.listar(incluirInativos === "1" || incluirInativos === "true");
  }

  /** Nasce no fim da lista. Sem checagem de nome repetido: homônimo é caso real (ver o service). */
  @Post()
  criar(@Body() dto: CriarComercialDto) {
    return this.comerciais.criar(dto);
  }

  /**
   * A ORDEM DO SELETOR. Recebe a lista COMPLETA de ids na ordem nova e reescreve `1..N`.
   *
   * ROTA DE CAMINHO FIXO ANTES DAS DE PARÂMETRO: sem isso o Nest casaria "ordem" como se fosse um
   * id, e o `ParseIntPipe` transformaria um erro de rota num 400 confuso.
   */
  @Patch("ordem")
  reordenar(@Body() dto: ReordenarComerciaisDto) {
    return this.comerciais.reordenar(dto.ids);
  }

  /** Corrige a pessoa INTEIRA: sem código imutável ao lado, não sobra nome antigo em canto nenhum. */
  @Patch(":id")
  renomear(@Param("id", ParseIntPipe) id: number, @Body() dto: RenomearComercialDto) {
    return this.comerciais.renomear(id, dto);
  }

  /** Volta um comercial inativado à circulação, com o mesmo id e os mesmos cadastros apontando. */
  @Patch(":id/reativar")
  reativar(@Param("id", ParseIntPipe) id: number) {
    return this.comerciais.reativar(id);
  }

  /** Tira de circulação. RECUSA quem ainda tem carteira, com CONTAGEM e sem nome (§A.6). */
  @Patch(":id/inativar")
  inativar(@Param("id", ParseIntPipe) id: number) {
    return this.comerciais.inativar(id);
  }

  /** Apaga de verdade, e só quem NUNCA foi usado (o nome digitado errado). Ver o service. */
  @Delete(":id")
  remover(@Param("id", ParseIntPipe) id: number) {
    return this.comerciais.remover(id);
  }
}
