import { BadRequestException, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { parseMulti } from "../../common/parse-multi";
import type { AuthUser } from "../../auth/auth.types";
import type { CampoDeDivergencia, EscopoDeDivergencia } from "@ea/shared-types";
import {
  CAMPOS_VALIDOS,
  ESCOPOS_VALIDOS,
  FiltroDeDivergenciasDto,
} from "./ingestao-divergencias.dto";
import { IngestaoDivergenciasService } from "./ingestao-divergencias.service";

/**
 * ─ A FILA DE DIVERGENCIAS DA INGESTAO: A SUPERFICIE HTTP ───────────────────────────────────────
 *
 * ┌─ QUEM SEGURA ESTAS ROTAS É O MENU, E NAO UM `@Roles` ───────────────────────────────────────┐
 * │ Mesma escolha da `MotivosDescarteAdminController` e da `BeneficiosFilaController`: o          │
 * │ `MenuGuard` reivindica esta classe inteira pelo menu `divergencias-ingestao`                  │
 * │ (`domain/menus`), e ele é FAIL-OPEN só para operação NÃO REIVINDICADA. Reivindicada, quem não │
 * │ tem o menu não alcança a rota nem digitando a URL.                                            │
 * │                                                                                             │
 * │ POR QUE ISSO IMPORTA AQUI: a lista devolve NOME DE CANDIDATO junto do cliente e da vaga. Uma  │
 * │ classe não reivindicada seria alcançável por qualquer sessão autenticada com um `curl`, que é  │
 * │ o mesmo furo que a `ComerciaisService` e a `AltoVolumeController.listarVinculos` já pagaram.   │
 * │                                                                                             │
 * │ UM `@Roles` SOZINHO NÃO SERVIA: o diretor decide, usuário por usuário, quem trabalha esta      │
 * │ fila (§A.23), e papel no handler entregaria uma PORTA TRANCADA a quem recebesse o menu. O menu │
 * │ nasce visível só para o SUPER_ADMIN, e quem libera é o diretor. Menu novo que não aparece      │
 * │ para os demais NÃO é bug.                                                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhuma rota daqui loga. Os valores que descem são código, rótulo de vaga ou número, e o
 * nome do candidato desce porque é o que faz o time reconhecer a linha, atrás do menu.
 */
@Controller("as/ingestao/divergencias")
export class IngestaoDivergenciasController {
  constructor(private readonly divergencias: IngestaoDivergenciasService) {}

  /**
   * A FILA, com filtro MÚLTIPLO (§A.28).
   *
   * A MULTIPLICIDADE É QUEBRADA AQUI, com o MESMO `parseMulti` da Esteira e do painel do Portal, e a
   * cláusula vira `in (...)` no serviço. O VALOR FORA DO VOCABULARIO VIRA 400, e não é ignorado em
   * silêncio: filtro descartado calado devolve a lista INTEIRA para quem pediu um recorte, o que é
   * pior do que um erro, porque parece ter funcionado.
   */
  @Get()
  listar(@Query() dto: FiltroDeDivergenciasDto) {
    return this.divergencias.listar({
      escopo: this.peneirar(parseMulti(dto.escopo), ESCOPOS_VALIDOS, "escopo") as
        | EscopoDeDivergencia[]
        | undefined,
      campo: this.peneirar(parseMulti(dto.campo), CAMPOS_VALIDOS, "campo") as
        | CampoDeDivergencia[]
        | undefined,
      /*
       * O CLIENTE NAO TEM VOCABULARIO A CONFERIR: o valor é o NOME (o contrato não carrega
       * `clienteId`), e nome é dado, não lista fechada. Ele viaja como PARAMETRO da consulta, então
       * não há escape a acertar nem injeção possível; valor que não existe simplesmente não casa.
       */
      cliente: parseMulti(dto.cliente),
      /*
       * A VAGA É CONFERIDA NA FORMA, e isso não é preciosismo: o valor entra na consulta com `::uuid`,
       * e um texto qualquer ali estoura 22P02 no driver, ou seja 500 em vez de 400. A régua é a mesma
       * do `@IsUUID` dos outros DTOs, aplicada onde o valor chega em lista.
       */
      vaga: this.exigirUuids(parseMulti(dto.vaga)),
      // O PADRÃO É A FILA (`ABERTAS`): quem abre a tela quer o que tem de resolver.
      estado: dto.estado ?? "ABERTAS",
    });
  }

  /**
   * O CATALOGO DAS OPCOES DOS FILTROS DE CLIENTE E DE VAGA (§A.37).
   *
   * ┌─ O NOME DO METODO É `opcoes`, E ELE NAO PODE MUDAR SEM MUDAR O MENU ───────────────────────┐
   * │ O menu `divergencias-ingestao` reivindica as operações NOMINALMENTE                          │
   * │ (`IngestaoDivergenciasController.opcoes`, e não um coringa da classe), e o `MenuGuard` é      │
   * │ FAIL-OPEN para operação NÃO reivindicada: renomear este método deixaria a rota alcançável por │
   * │ qualquer sessão autenticada, sem nada ficar vermelho.                                         │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * DECLARADO DEPOIS DO `@Get()` DE LISTA E ANTES DE QUALQUER `:id`: o Nest casa rotas na ORDEM de
   * declaração, e um `@Get(":id")` de segmento único declarado acima engoliria "opcoes" como se fosse
   * um id. Hoje não existe nenhum, e esta linha é o aviso para quem for acrescentar o primeiro.
   */
  @Get("opcoes")
  opcoes() {
    return this.divergencias.opcoes();
  }

  /** MANTER O EA: fecha a linha e não escreve nada no dado. */
  @Post(":id/manter-ea")
  manterEa(@Param("id") id: string, @Req() req: Request) {
    return this.divergencias.manterEa(id, this.autor(req).id);
  }

  /**
   * ADOTAR O ATS: aplica o valor pelo CAMINHO HUMANO normal, com autor e trilha, e só então fecha.
   *
   * CAMPO SEM CAMINHO HUMANO PARA O ESTADO ATUAL DA LINHA VOLTA 409, com a frase dizendo onde a
   * correção se faz à mão (ver `aplicarPeloCaminhoHumano`). Escrever a coluna direto daria o valor
   * certo com a procedência errada, que é o defeito que esta fila existe para matar.
   */
  @Post(":id/adotar-ats")
  adotarAts(@Param("id") id: string, @Req() req: Request) {
    return this.divergencias.adotarAts(id, this.autor(req).id);
  }

  /**
   * O AUTOR VEM DA SESSÃO, E NUNCA DO CORPO. É ele que assina o movimento de etapa, a alocação e o
   * rastro de redução de meta: aceitar o id do corpo deixaria qualquer um assinar em nome de outro.
   */
  private autor(req: Request): AuthUser {
    const user = (req as Request & { user?: AuthUser }).user;
    if (!user) throw new BadRequestException("Sessão sem usuário.");
    return user;
  }

  /** A forma do uuid, conferida ANTES de a consulta o converter: texto torto ali seria 500. */
  private exigirUuids(valores: string[] | undefined): string[] | undefined {
    if (!valores) return undefined;
    const forma = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (valores.some((v) => !forma.test(v))) {
      throw new BadRequestException("Filtro de vaga com identificador inválido.");
    }
    return valores;
  }

  /** Os valores que não estão no vocabulário viram 400, e nunca filtro descartado em silêncio. */
  private peneirar(
    valores: string[] | undefined,
    validos: readonly string[],
    nome: string,
  ): string[] | undefined {
    if (!valores) return undefined;
    const fora = valores.filter((v) => !validos.includes(v));
    if (fora.length > 0) throw new BadRequestException(`Filtro de ${nome} com valor desconhecido.`);
    return valores;
  }
}
