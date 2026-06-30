import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { ProgressoRegua } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, documentosAdmissao, reguaDocumental, tiposDocumento } from "../db/schema";
import {
  calcularProgressoRegua,
  faltantesObrigatorios,
  type DocReguaEstado,
} from "../domain/regua";

/**
 * Serviço de completude da régua obrigatória (§A.3 regra 4 / F2). Extraído da `EsteiraService`
 * para ser reusado por Esteira (gatilho NC-1 / flag da fila) e Auditoria (barra de progresso e
 * disparo do arquivamento no Drive). A consulta vive aqui; o cálculo é delegado a `domain/regua.ts`
 * (puro, testável). Sem PII — só nomes de tipo de documento e estado (§A.6).
 */
@Injectable()
export class ReguaCompletudeService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Linhas da régua (cliente+cargo) com o estado de cada documento na admissão. */
  private async docsRegua(
    admissaoId: string,
    codCliente: string,
    cargoId: string,
  ): Promise<DocReguaEstado[]> {
    const linhas = await this.db
      .select({
        nome: tiposDocumento.nome,
        exigencia: reguaDocumental.exigencia,
        estado: documentosAdmissao.estado,
      })
      .from(reguaDocumental)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, reguaDocumental.tipoDocumentoId))
      .leftJoin(
        documentosAdmissao,
        and(
          eq(documentosAdmissao.admissaoId, admissaoId),
          eq(documentosAdmissao.tipoDocumentoId, reguaDocumental.tipoDocumentoId),
        ),
      )
      .where(
        and(eq(reguaDocumental.codCliente, codCliente), eq(reguaDocumental.cargoId, cargoId)),
      );
    return linhas.map((l) => ({ nome: l.nome, exigencia: l.exigencia, estado: l.estado ?? null }));
  }

  /** Nomes dos documentos OBRIGATÓRIOS ainda não ENTREGUE (insumo do gatilho NC-1). */
  async faltantesObrigatorios(
    admissaoId: string,
    codCliente: string,
    cargoId: string,
  ): Promise<string[]> {
    return faltantesObrigatorios(await this.docsRegua(admissaoId, codCliente, cargoId));
  }

  /** Progresso da régua obrigatória de uma admissão (barra "X de Y" — F2). */
  async progresso(
    admissaoId: string,
    codCliente: string,
    cargoId: string,
  ): Promise<ProgressoRegua> {
    return calcularProgressoRegua(await this.docsRegua(admissaoId, codCliente, cargoId));
  }

  /**
   * Conjunto de admissões (entre as informadas) com ≥1 obrigatório pendente — flag da fila de
   * Auditoria. Consulta em lote, idêntica em comportamento à versão anterior da `EsteiraService`.
   */
  async obrigatoriosPendentesSet(admissaoIds: string[]): Promise<Set<string>> {
    if (admissaoIds.length === 0) return new Set();
    const linhas = await this.db
      .select({ admissaoId: admissoes.id, estado: documentosAdmissao.estado })
      .from(admissoes)
      .innerJoin(
        reguaDocumental,
        and(
          eq(reguaDocumental.codCliente, admissoes.codCliente),
          eq(reguaDocumental.cargoId, admissoes.cargoId),
          eq(reguaDocumental.exigencia, "OBRIGATORIO"),
        ),
      )
      .leftJoin(
        documentosAdmissao,
        and(
          eq(documentosAdmissao.admissaoId, admissoes.id),
          eq(documentosAdmissao.tipoDocumentoId, reguaDocumental.tipoDocumentoId),
        ),
      )
      .where(inArray(admissoes.id, admissaoIds));
    const set = new Set<string>();
    for (const l of linhas) if (l.estado !== "ENTREGUE") set.add(l.admissaoId);
    return set;
  }
}
