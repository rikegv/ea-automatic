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

/**
 * VÍNCULO (OST Onda 3, item 7). A régua candidata de uma admissão é a do CLIENTE (linha com vínculo
 * nulo, que é como as 3.586 existentes ficaram) MAIS a do vínculo que a admissão aponta. Quando as
 * duas cobrem o MESMO documento, quem vence é a do vínculo, e esse desempate é feito por
 * `porDocumento` logo abaixo, não em SQL: sem ele o documento entraria duas vezes e o contador de
 * pendências passaria a mentir.
 *
 * Admissão com ponteiro nulo (todas as de hoje) casa só com a linha de cliente, ou seja, nada muda.
 */
const REGUA_DO_VINCULO_DA_ADMISSAO = sql`(${reguaDocumental.clienteVinculoId} is null or ${reguaDocumental.clienteVinculoId} = ${admissoes.clienteVinculoId})`;

/** Uma linha por (admissão + documento): a do vínculo tem precedência sobre a do cliente. */
function porDocumento<
  T extends { admissaoId: string; tipoDocumentoId: string; clienteVinculoId: string | null },
>(linhas: T[]): T[] {
  const escolhido = new Map<string, T>();
  for (const l of linhas) {
    const chave = `${l.admissaoId}|${l.tipoDocumentoId}`;
    const atual = escolhido.get(chave);
    if (!atual || (l.clienteVinculoId !== null && atual.clienteVinculoId === null)) {
      escolhido.set(chave, l);
    }
  }
  return [...escolhido.values()];
}
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
        tipoDocumentoId: reguaDocumental.tipoDocumentoId,
        clienteVinculoId: reguaDocumental.clienteVinculoId,
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
        and(
          eq(reguaDocumental.codCliente, codCliente),
          eq(reguaDocumental.cargoId, cargoId),
          // VÍNCULO (item 7): mesma régua candidata das consultas em lote, resolvida aqui pelo
          // ponteiro da PRÓPRIA admissão, sem mudar a assinatura do método nem a de quem o chama.
          sql`(${reguaDocumental.clienteVinculoId} is null or ${reguaDocumental.clienteVinculoId} = (select ${admissoes.clienteVinculoId} from ${admissoes} where ${admissoes.id} = ${admissaoId}))`,
        ),
      );
    // Sexo do candidato desta admissão (para o condicional do Reservista da régua padrão).
    const cand = await this.db
      .select({ sexo: candidatos.sexo })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .where(eq(admissoes.id, admissaoId))
      .limit(1);
    const masculino = cand[0]?.sexo === "MASCULINO";
    // Desempate por documento (vínculo vence cliente) ANTES do recorte do Reservista: sem ele, um
    // documento definido nos dois níveis apareceria duas vezes no progresso ("11/10").
    return porDocumento(linhas.map((l) => ({ ...l, admissaoId })))
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
      .select({
        admissaoId: admissoes.id,
        estado: documentosAdmissao.estado,
        tipoDocumentoId: reguaDocumental.tipoDocumentoId,
        clienteVinculoId: reguaDocumental.clienteVinculoId,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .innerJoin(
        reguaDocumental,
        and(
          eq(reguaDocumental.codCliente, admissoes.codCliente),
          eq(reguaDocumental.cargoId, admissoes.cargoId),
          eq(reguaDocumental.exigencia, "OBRIGATORIO"),
          REGUA_DO_VINCULO_DA_ADMISSAO,
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
    for (const l of porDocumento(linhas)) if (l.estado !== "ENTREGUE") set.add(l.admissaoId);
    return set;
  }

  /**
   * Contador (por admissão) de documentos OBRIGATÓRIOS da régua ainda NÃO ENTREGUE (item 8 / F2 —
   * badge da fila de Auditoria). Espelha a query do `obrigatoriosPendentesSet`, mas conta em vez de
   * só marcar presença. Todos os ids consultados vêm no mapa (0 quando a régua está completa ou não
   * há obrigatório pendente). Sem PII (§A.6).
   */
  /**
   * PROGRESSO da régua obrigatória por admissão (OST B1 / Bloco 6): quantos obrigatórios já estão
   * ENTREGUE e quantos são no total. É o que a coluna Status da aba Auditoria exibe como "9/10",
   * para o trabalho da IA parar de ser invisível: hoje toda admissão mostra "Análise Pendente",
   * tenha faltando um documento ou dez.
   *
   * Mesma query do contador de pendentes (mesma régua, mesmo recorte de Reservista), contando os
   * dois lados em vez de só o que falta. Sem PII (§A.6).
   */
  async progressoObrigatoriosMap(
    admissaoIds: string[],
  ): Promise<Map<string, { entregues: number; total: number; inconformes: number; recebidos: number }>> {
    const map = new Map<
      string,
      { entregues: number; total: number; inconformes: number; recebidos: number }
    >();
    if (admissaoIds.length === 0) return map;
    for (const id of admissaoIds) map.set(id, { entregues: 0, total: 0, inconformes: 0, recebidos: 0 });
    const linhas = await this.db
      .select({
        admissaoId: admissoes.id,
        estado: documentosAdmissao.estado,
        tipoDocumentoId: reguaDocumental.tipoDocumentoId,
        clienteVinculoId: reguaDocumental.clienteVinculoId,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .innerJoin(
        reguaDocumental,
        and(
          eq(reguaDocumental.codCliente, admissoes.codCliente),
          eq(reguaDocumental.cargoId, admissoes.cargoId),
          eq(reguaDocumental.exigencia, "OBRIGATORIO"),
          REGUA_DO_VINCULO_DA_ADMISSAO,
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
    for (const l of porDocumento(linhas)) {
      const atual = map.get(l.admissaoId) ?? {
        entregues: 0,
        total: 0,
        inconformes: 0,
        recebidos: 0,
      };
      atual.total += 1;
      if (l.estado === "ENTREGUE") atual.entregues += 1;
      // RECEBIDO é diferente de APROVADO: o documento chegou, mesmo que tenha sido reprovado ou que
      // a IA ainda não o tenha julgado. É o que separa "o candidato não mandou nada" de "mandou e
      // estamos trabalhando". Sem isto, um documento aguardando auditoria faria a admissão parecer
      // que não recebeu nada, e a entrega já aconteceu.
      if (l.estado === "ENTREGUE" || l.estado === "INCONFORME" || l.estado === "AGUARDANDO_AUDITORIA") {
        atual.recebidos += 1;
      }
      // REPROVADO conta separado do não recebido: os dois "faltam", mas exigem ações OPOSTAS. Não
      // recebido é aguardar/cobrar o candidato; INCONFORME é o time entrar e atuar (reauditar,
      // validar por humano, pedir reenvio). Sem este número, a lista não distingue os dois.
      if (l.estado === "INCONFORME") atual.inconformes += 1;
      map.set(l.admissaoId, atual);
    }
    return map;
  }

  async obrigatoriosPendentesCountMap(admissaoIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (admissaoIds.length === 0) return map;
    for (const id of admissaoIds) map.set(id, 0);
    const linhas = await this.db
      .select({
        admissaoId: admissoes.id,
        estado: documentosAdmissao.estado,
        tipoDocumentoId: reguaDocumental.tipoDocumentoId,
        clienteVinculoId: reguaDocumental.clienteVinculoId,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .innerJoin(
        reguaDocumental,
        and(
          eq(reguaDocumental.codCliente, admissoes.codCliente),
          eq(reguaDocumental.cargoId, admissoes.cargoId),
          eq(reguaDocumental.exigencia, "OBRIGATORIO"),
          REGUA_DO_VINCULO_DA_ADMISSAO,
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
    for (const l of porDocumento(linhas)) {
      if (l.estado !== "ENTREGUE") map.set(l.admissaoId, (map.get(l.admissaoId) ?? 0) + 1);
    }
    return map;
  }
}
