import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ProgressoRegua } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  documentosAdmissao,
  reguaDocumental,
  tiposDocumento,
} from "../db/schema";

// Régua padrão: a Carteira de Reservista (código RESERVISTA) só é OBRIGATÓRIA para o sexo
// MASCULINO. Para candidatas (ou quando o sexo ainda não foi informado) a linha do Reservista é
// removida do cálculo de pendências. Filtro em SQL para as consultas em lote; em memória na
// consulta por admissão. `is distinct from` trata o NULL como "não masculino".
const RESERVISTA_COD = "RESERVISTA";
const naoExigeReservista = sql`not (${tiposDocumento.codigo} = ${RESERVISTA_COD} and ${candidatos.sexo} is distinct from 'MASCULINO')`;
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
        codigo: tiposDocumento.codigo,
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
    // Sexo do candidato desta admissão (para o condicional do Reservista da régua padrão).
    const cand = await this.db
      .select({ sexo: candidatos.sexo })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .where(eq(admissoes.id, admissaoId))
      .limit(1);
    const masculino = cand[0]?.sexo === "MASCULINO";
    return linhas
      .filter((l) => !(l.codigo === RESERVISTA_COD && !masculino))
      .map((l) => ({ nome: l.nome, exigencia: l.exigencia, estado: l.estado ?? null }));
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
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .innerJoin(
        reguaDocumental,
        and(
          eq(reguaDocumental.codCliente, admissoes.codCliente),
          eq(reguaDocumental.cargoId, admissoes.cargoId),
          eq(reguaDocumental.exigencia, "OBRIGATORIO"),
        ),
      )
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, reguaDocumental.tipoDocumentoId))
      .leftJoin(
        documentosAdmissao,
        and(
          eq(documentosAdmissao.admissaoId, admissoes.id),
          eq(documentosAdmissao.tipoDocumentoId, reguaDocumental.tipoDocumentoId),
        ),
      )
      .where(and(inArray(admissoes.id, admissaoIds), naoExigeReservista));
    const set = new Set<string>();
    for (const l of linhas) if (l.estado !== "ENTREGUE") set.add(l.admissaoId);
    return set;
  }

  /**
   * Contador (por admissão) de documentos OBRIGATÓRIOS da régua ainda NÃO ENTREGUE (item 8 / F2 —
   * badge da fila de Auditoria). Espelha a query do `obrigatoriosPendentesSet`, mas conta em vez de
   * só marcar presença. Todos os ids consultados vêm no mapa (0 quando a régua está completa ou não
   * há obrigatório pendente). Sem PII (§A.6).
   */
  async obrigatoriosPendentesCountMap(admissaoIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (admissaoIds.length === 0) return map;
    for (const id of admissaoIds) map.set(id, 0);
    const linhas = await this.db
      .select({ admissaoId: admissoes.id, estado: documentosAdmissao.estado })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .innerJoin(
        reguaDocumental,
        and(
          eq(reguaDocumental.codCliente, admissoes.codCliente),
          eq(reguaDocumental.cargoId, admissoes.cargoId),
          eq(reguaDocumental.exigencia, "OBRIGATORIO"),
        ),
      )
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, reguaDocumental.tipoDocumentoId))
      .leftJoin(
        documentosAdmissao,
        and(
          eq(documentosAdmissao.admissaoId, admissoes.id),
          eq(documentosAdmissao.tipoDocumentoId, reguaDocumental.tipoDocumentoId),
        ),
      )
      .where(and(inArray(admissoes.id, admissaoIds), naoExigeReservista));
    for (const l of linhas) {
      if (l.estado !== "ENTREGUE") map.set(l.admissaoId, (map.get(l.admissaoId) ?? 0) + 1);
    }
    return map;
  }
}
