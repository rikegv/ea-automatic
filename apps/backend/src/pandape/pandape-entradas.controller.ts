import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PandapeEntradaItem } from "@ea/shared-types";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { PandapeEntradaService } from "./pandape-entrada.service";
import { PandapeQueueService } from "./pandape-queue.service";

/**
 * ─ FILA DE ENTRADAS DO PANDAPÉ: a tela (OST do diretor, 15/09/2026) ────────────────────────────
 *
 * A lista do que o ATS mandou e ainda NÃO virou admissão. É fila de trabalho, não relatório: quem
 * zera sai, e quem sai é decidido pela régua única (`pendenteDeAdmissao`), nunca por uma consulta
 * que cada tela escreve do seu jeito (§A.19).
 *
 * RBAC: `@Roles("MASTER","SUPER_ADMIN")` NA CLASSE, o padrão do Diagnóstico. A tela mostra
 * identificador de sistema e DISPARA reprocessamento contra a API do Pandapé, cujo rate limit é
 * compartilhado com o webhook que alimenta a folha (§A.5): consultor não alcança isto. O menu entra
 * no catálogo e nasce só para o SUPER_ADMIN; quem libera é o diretor (§A.23).
 */
@Roles("MASTER", "SUPER_ADMIN")
@Controller("pandape-entradas")
export class PandapeEntradasController {
  private readonly logger = new Logger("PandapeEntradas");

  constructor(
    private readonly entradas: PandapeEntradaService,
    private readonly fila: PandapeQueueService,
  ) {}

  /**
   * A GRADE. Por padrão só as PENDENTES, que é o que faz dela uma fila.
   *
   * UM FILTRO SÓ, e ele é ESCOLHA DO DIRETOR (§A.30): a SITUAÇÃO (`desfecho`). Motivo, origem e
   * vaga são COLUNAS e continuam voltando no payload, mas NÃO são filtráveis: filtro de backend que
   * a tela não oferece é construção além da OST (§A.31), e quem decide por qual campo o time procura
   * de verdade é quem opera.
   *
   * O ÚNICO FILTRO QUE EXISTE JÁ NASCE MÚLTIPLO (§A.28), pelo `parseMulti` que a Esteira usa: o
   * parâmetro vira lista e a cláusula vira `in`. A régua de um valor só se espalha pela consulta,
   * pelo estado da tela e pela URL, e desfazer depois custa mais do que nascer certo.
   */
  @Get()
  listar(
    @Query("desfecho") desfecho?: string,
    @Query("incluirResolvidas") incluirResolvidas?: string,
  ): Promise<PandapeEntradaItem[]> {
    return this.entradas.listar({
      desfecho: parseMulti(desfecho),
      somentePendentes: incluirResolvidas === "1" ? false : true,
    });
  }

  /**
   * REPROCESSA um evento: enfileira o MESMO id de novo.
   *
   * ┌─ O SUFIXO NO jobId É O QUE FAZ O BOTÃO FUNCIONAR ─────────────────────────────────────────┐
   * │ `cand-<id>` é estável PARA SEMPRE, e o BullMQ recusa, CALADO, um `add` com jobId que ainda │
   * │ consta no conjunto de concluídos. Sem o sufixo, a tela diria "reprocessado" para uma coisa  │
   * │ que nunca rodou: um silêncio novo dentro da frente que existe para acabar com o silêncio.   │
   * │ O precedente é o `jobIdSufixo` do `enfileirarPullDocumentos`, reusado e não reinventado.    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A `origem` da linha NÃO vira MANUAL (§4-B/13): ela é do EVENTO e é imutável. Reprocessar
   * incrementa as tentativas; reescrever a origem apagaria o histórico do caso no primeiro clique.
   */
  @Post(":id/reprocessar")
  async reprocessar(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ enfileirado: boolean }> {
    const linha = await this.entradas.porId(id);
    if (!linha) throw new NotFoundException("Entrada não encontrada.");

    const ok = await this.fila.enfileirarCandidato(linha.idPrecollaborator, {
      jobIdSufixo: `manual-${Date.now()}`,
    });
    if (!ok) throw new ServiceUnavailableException("Fila indisponível; tente novamente.");

    await this.entradas.registrarTentativa(linha.idPrecollaborator);
    // TRILHA com autor e papel (§A.23/§5 do desenho). §A.6: id do ATS e id de usuário, nunca PII.
    this.logger.log(
      `Reprocesso manual da entrada ${linha.idPrecollaborator} por ${user.id} (${user.papel}).`,
    );
    return { enfileirado: true };
  }
}
