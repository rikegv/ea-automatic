import { and, inArray, isNull, type SQL } from "drizzle-orm";
import { FAROIS_VIVOS } from "../domain/admissao";
import { admissoes } from "./schema";

/**
 * FILTROS DE ADMISSÃO PARA OS PROCESSOS AUTOMÁTICOS (OST admissão pausada, Bloco 2).
 *
 * A contraparte SQL de `admissaoOperavel` (domain/admissao). O predicado puro serve para decidir
 * sobre uma linha já carregada; estes servem para NÃO CARREGAR a linha, que é o que a maioria dos
 * automáticos precisa.
 *
 * POR QUE ISTO EXISTE, e não um `AND pausada_em IS NULL` copiado em cada query: o levantamento achou
 * três cópias locais de `FAROIS_VIVOS` e três automáticos (tick do Clicksign, fila de disparo,
 * gate do kit) que não olhavam farol NENHUM. Cada processo novo escrito à mão é uma chance de nascer
 * ignorando a pausa. Com o helper, respeitar a pausa é o caminho mais curto.
 *
 * O QUE FICA DE FORA, de propósito: a AUDITORIA. Ela continua durante a pausa por decisão do
 * diretor (a pausa é sobre o cliente, não sobre a análise documental), então auditoria/reauditoria
 * NÃO usam estes filtros. Se um dia alguém quiser pausar a auditoria também, o lugar é aqui.
 */

/** A admissão não está pausada. Use quando o farol já foi filtrado (ou não importa). */
export function naoPausada(): SQL {
  return isNull(admissoes.pausadaEm);
}

/**
 * A admissão é OPERÁVEL por automático: viva pelo farol E não pausada. É o filtro padrão de
 * scheduler, coleta e fila.
 */
export function admissaoOperavelSql(): SQL {
  return and(inArray(admissoes.farolGlobal, [...FAROIS_VIVOS]), isNull(admissoes.pausadaEm))!;
}
