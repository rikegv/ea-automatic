/**
 * Regras puras das Não Conformidades (Fase 2C). Sem dependência de DB — testáveis isoladamente.
 * Modela o **modelo de duas vias**: Via 1 (NC comum, penaliza o consultor que gerou a admissão) e
 * Via 2 (liberação por determinação da diretoria — aprovada pela supervisão, não penaliza).
 */
import { TERMO_APTO_SEM_ASO } from "@ea/shared-types";
import type { NcLiberacao, NcStatus } from "@ea/shared-types";

export { TERMO_APTO_SEM_ASO };

/** Situação consolidada exibida na tela (deriva de status × liberação). */
export type NcSituacao =
  | "ABERTA"
  | "RESOLVIDA"
  | "AGUARDA_SUPERVISAO"
  | "LIBERADA_DIRETORIA"
  | "REPROVADA";

/**
 * Situação consolidada da NC. A liberação por diretoria tem prioridade sobre o estado de resolução:
 * uma NC aprovada é "Liberada pela diretoria" (exceção reconhecida), independentemente de resolvida.
 */
export function ncSituacao(status: NcStatus, liberacao: NcLiberacao): NcSituacao {
  if (liberacao === "APROVADA") return "LIBERADA_DIRETORIA";
  if (liberacao === "PENDENTE") return "AGUARDA_SUPERVISAO";
  if (status === "RESOLVIDA") return "RESOLVIDA";
  if (liberacao === "REPROVADA") return "ABERTA"; // reprovada volta a ser NC comum (Via 1)
  return "ABERTA";
}

/**
 * A NC penaliza o consultor (entra no contador de gestão)? Verdadeiro em tudo, EXCETO quando a
 * diretoria aprovou a liberação — exceção reconhecida, não desvio. NC resolvida ainda penaliza
 * (o registro permanece no histórico: aconteceu).
 */
export function penalizaConsultor(liberacao: NcLiberacao): boolean {
  return liberacao !== "APROVADA";
}
