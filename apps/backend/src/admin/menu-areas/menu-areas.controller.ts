import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { MenuAreasService } from "../../auth/menu-areas.service";
import { DefinirAreasDoMenuDto, ImpactoAreasDoMenuDto } from "./menu-areas.dto";

/**
 * ÁREA POR MENU: a tela onde o diretor decide que áreas enxergam cada menu.
 *
 * EXCLUSIVA DO SUPER_ADMIN (§A.23), e aqui isso é mais forte do que a régua de sempre: esta tela
 * escreve a FONTE DA AUTORIZAÇÃO POR ÁREA. Quem a alcança redefine o que cada time enxerga no sistema
 * inteiro. Um Master que chegasse aqui poderia marcar todos os menus da Admissão como sendo também de
 * A&S e desfazer a segmentação sem tocar em usuário nenhum.
 *
 * POR QUE ELA EXISTE: até a frente anterior, a área de cada menu vivia em `domain/menus.ts`, e marcar
 * um menu para as duas áreas (o caso real é o dashboard de Alto Volume, que interessa aos dois times)
 * dependia da fábrica e de uma subida de versão. Agora a tabela manda e o diretor marca sozinho.
 *
 * O QUE ELA NÃO GOVERNA, e é limitação aceita pelo diretor: as 8 operações que só o `@Roles` protege
 * e que nenhum menu reivindica (trocar cliente, corrigir CPF, recusar e reativar liberação, deletar
 * admissão, decidir liberação de não conformidade, remover vínculo de cliente e os `add*` de
 * catálogo). Elas seguem carimbadas ADM em código (`AREA_POR_CONTROLLER`). Trazê-las para a tela
 * exigiria reivindicá-las por menu, que é frente própria.
 */
@Roles("SUPER_ADMIN")
@Controller("admin/menu-areas")
export class MenuAreasController {
  constructor(private readonly menuAreas: MenuAreasService) {}

  /** Catálogo com as áreas VIGENTES de cada menu, para a tela desenhar. */
  @Get()
  listar() {
    return this.menuAreas.listar();
  }

  /**
   * PRÉVIA DO IMPACTO, antes de salvar (decisão do diretor: mudar área TIRA acesso, e isso não pode
   * ser feito às cegas).
   *
   * Responde quem deixa de ver o menu, com nome e papel, e quantos passam a ver. É `POST` porque
   * recebe a marcação hipotética que a tela está montando, mas NÃO ESCREVE NADA: é uma simulação.
   */
  @Post(":codigo/impacto")
  impacto(@Param("codigo") codigo: string, @Body() dto: ImpactoAreasDoMenuDto) {
    return this.menuAreas.impacto(codigo, dto.areas);
  }

  /**
   * Grava as áreas do menu. O serviço recusa área vazia e recusa restringir o Início, e derruba o
   * cache, então a mudança vale na requisição seguinte, sem restart.
   */
  @Put(":codigo")
  async definir(@Param("codigo") codigo: string, @Body() dto: DefinirAreasDoMenuDto) {
    const areas = await this.menuAreas.definir(codigo, dto.areas);
    return { ok: true, codigo, areas };
  }
}
