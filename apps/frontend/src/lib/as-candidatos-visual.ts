/**
 * O TOM VISUAL DA CENTRAL DE CANDIDATOS, em um lugar só.
 *
 * §A.12: o ícone da pill acompanha o ESTADO REAL, nunca é fixo. Quem escolhe o ícone é a
 * `StatusPill` a partir do tom, então basta o tom estar certo aqui: êxito é check verde, trabalho em
 * andamento é exclamação amarela, encerrado sem êxito é X vermelho.
 *
 * Este arquivo é separado do cliente HTTP de propósito: ele é importado por componentes de
 * renderização, e não deveria arrastar junto o módulo que fala com a rede.
 */

import type { CandidaturaEtapa, CandidaturaSituacao, VagaStatus } from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";

/**
 * A SITUAÇÃO manda no tom, porque ela é o que diz se o processo deu certo, segue vivo ou acabou.
 *  - Aprovado e Contratado: êxito, check verde.
 *  - Descartado: encerrado sem êxito, X vermelho.
 *  - Desistiu: também encerrado sem êxito, e vermelho pelo mesmo motivo. A pessoa saiu, e pintar de
 *    neutro faria a fila parecer viva onde ela não está.
 *  - Em Seleção: trabalho em andamento, exclamação amarela.
 */
export function tomDaSituacao(s: CandidaturaSituacao): PillTone {
  if (s === "APROVADO" || s === "CONTRATADO") return "ok";
  if (s === "DESCARTADO" || s === "DESISTIU") return "dg";
  return "wn";
}

/**
 * A ETAPA é posição no funil, não julgamento: ela não tem "certo" nem "errado". O azul do sistema
 * (`in`) é o que lê como informação, e a última etapa ganha o verde porque chegar na Aprovação é o
 * fim bom do caminho.
 */
export function tomDaEtapa(e: CandidaturaEtapa): PillTone {
  return e === "APROVACAO" ? "ok" : "in";
}

/**
 * TOM DA PILL POR STATUS DA VAGA (§A.12: o ícone acompanha o estado real, nunca é fixo).
 *
 * SUBIU DA CENTRAL DE VAGAS PARA CÁ, sem alterar um único valor (§A.26): o resumo da vaga passou a
 * ser mostrado também DENTRO da Central de Candidatos (o modal sobreposto do "Ver vaga"), e duas
 * cópias do mesmo mapa fariam a mesma vaga aparecer com cores diferentes em duas telas. A Central de
 * Vagas importa daqui e continua chamando o mapa de `TOM_STATUS`, como sempre chamou.
 *
 * Entregue é o êxito da vaga (check verde); aberta é trabalho em andamento (exclamação amarela);
 * cancelada é o X vermelho; fechada é encerramento neutro; vaga banco é estado próprio, em azul.
 * RASCUNHO é neutro de propósito: não é trabalho em andamento (a vaga nem foi publicada) nem êxito
 * nem encerramento. É a vaga que ainda não começou.
 */
export const TOM_STATUS_VAGA: Record<VagaStatus, PillTone> = {
  RASCUNHO: "nt",
  ABERTA: "wn",
  ENTREGUE: "ok",
  FECHADA: "nt",
  CANCELADA: "dg",
  VAGA_BANCO: "in",
};

/** O tom de um status de vaga. Forma de função, para casar com `tomDaEtapa` e `tomDaSituacao`. */
export function tomDoStatusVaga(s: VagaStatus): PillTone {
  return TOM_STATUS_VAGA[s];
}
