import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { DicasDocumentoService } from "./dicas-documento.service";
import { UpsertDicaDocumentoDto } from "./dicas-documento.dto";
import { parseMulti } from "../../common/parse-multi";

/**
 * DICAS DE DOCUMENTO: a tela onde o diretor escreve, por TIPO, como o documento tem de estar para
 * passar na auditoria. Mesmo desenho dos catálogos vizinhos (`admin/cargos`, `admin/escalas`,
 * `admin/motivos-declinio`).
 *
 * ┌─ A CLASSE É REIVINDICADA POR NOME NO MENU, E ISSO NÃO É FORMALIDADE (exigência S12) ────────┐
 * │ O `MenuGuard` indexa por `Controller.handler`, e OPERAÇÃO QUE NENHUM MENU REIVINDICA PASSA  │
 * │ LIVRE. Esta controller não tem `@Roles`, então sem a linha `DicasDocumentoController.*` no  │
 * │ registro (`domain/menus.ts`, menu `dicas-documento`) qualquer sessão autenticada escreveria │
 * │ o texto que aparece na tela PÚBLICA do candidato. Coringa de outro menu não alcança classe  │
 * │ nova: classe nova é operação nova.                                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.23: o menu novo foi REGISTRADO e nada mais. Ele nasce visível só para o SUPER_ADMIN, nenhum
 * seed foi rodado, e quem libera quem enxerga é o DIRETOR, pela tela dele. Menu que não aparece
 * para os demais NÃO é bug.
 *
 * TODA A CONTROLLER É GATADA, LEITURA INCLUÍDA, e aqui o `list` não é "catálogo de trabalho" como
 * as GETs abertas de clientes e cargos: ele é a tela de gestão inteira (todos os tipos ativos mais
 * o texto de cada um). Quem precisa da dica para TRABALHAR é o candidato, e ele a recebe pela
 * trilha do portal, na admissão dele, sem passar por aqui.
 */
@Controller("admin/dicas-documento")
export class DicasDocumentoController {
  constructor(private readonly dicas: DicasDocumentoService) {}

  /**
   * O CATÁLOGO DOS FILTROS (§A.37), por ENDPOINT e não derivado das linhas carregadas.
   *
   * DECLARADA ANTES DAS ROTAS DE PARÂMETRO de propósito: a controller não tem `@Get(":id")` hoje,
   * mas o dia em que alguém acrescentar um, `filtros` já está na frente e não vira id.
   */
  @Get("filtros")
  filtros() {
    return this.dicas.catalogoDeFiltros();
  }

  /**
   * Todos os tipos ATIVOS, com a dica quando existir (nulo = ainda não tem, e a tela oferece).
   *
   * OS DOIS FILTROS SÃO MÚLTIPLOS (§A.28), pelo mesmo `parseMulti` que a Esteira e o painel do
   * Portal usam: o parâmetro aceita vírgula e a cláusula vira `IN`. Sem parâmetro nenhum, a lista
   * é a de sempre, byte a byte. Quem valida o CONTEÚDO é o service, que descarta valor fora do
   * contrato e id que não tem forma de UUID em vez de deixar o Postgres derrubar a tela.
   */
  @Get()
  list(
    @Query("situacoes") situacoes?: string,
    @Query("documentos") documentos?: string,
  ) {
    return this.dicas.list({
      situacoes: parseMulti(situacoes),
      documentos: parseMulti(documentos),
    });
  }

  /**
   * GRAVA a dica do tipo, criando ou substituindo. `PUT` porque a chave é o TIPO e a operação é
   * idempotente: mandar o mesmo texto duas vezes deixa o mesmo estado.
   */
  @Put(":tipoDocumentoId")
  upsert(
    @Param("tipoDocumentoId", ParseUUIDPipe) tipoDocumentoId: string,
    @Body() dto: UpsertDicaDocumentoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dicas.upsert(tipoDocumentoId, dto, user.id);
  }

  /**
   * Reativa a dica (volta a aparecer para o candidato).
   *
   * O AUTOR VIAJA JUNTO pelo mesmo `@CurrentUser()` do `upsert`, e não é enfeite: reativar é ATO DE
   * PUBLICAÇÃO, e sem ele a tela creditaria a republicação a quem escreveu o texto da vez anterior.
   */
  @Patch(":tipoDocumentoId/reativar")
  reativar(
    @Param("tipoDocumentoId", ParseUUIDPipe) tipoDocumentoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dicas.reativar(tipoDocumentoId, user.id);
  }

  /** INATIVAÇÃO, nunca exclusão física (§A.6): o texto fica guardado e reativar devolve tudo. */
  @Delete(":tipoDocumentoId")
  remove(
    @Param("tipoDocumentoId", ParseUUIDPipe) tipoDocumentoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dicas.inativar(tipoDocumentoId, user.id);
  }
}
