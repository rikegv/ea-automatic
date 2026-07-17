import { FAROL_GLOBAL, FAROL_GLOBAL_LABEL, type FarolGlobal } from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";

/**
 * Tom da pill por farol global (§A.3). Mapeia os 5 valores oficiais aos tons do Design System:
 * em admissão → azul (in), banco-aguardar → neutro (nt), concluída → verde (ok),
 * declinou → vermelho (dg), rescisão → laranja (or).
 */
export const FAROL_TONE: Record<FarolGlobal, PillTone> = {
  EM_ADMISSAO: "in",
  BANCO_AGUARDAR: "nt",
  ADMISSAO_CONCLUIDA: "ok",
  DECLINOU: "dg",
  RESCISAO: "or",
  // Pré-admissão aguardando liberação: neutro (é uma sala de espera, não um estado do processo vivo).
  AGUARDANDO_LIBERACAO: "nt",
  // Liberação recusada: vermelho (encerrada por recusa, como o declínio).
  LIBERACAO_RECUSADA: "dg",
};

/** {tone,label} de um farol (aceita string crua do backend; cai em neutro se desconhecido). */
export function farolPill(codigo: string): { tone: PillTone; label: string } {
  const fg = codigo as FarolGlobal;
  if (fg in FAROL_GLOBAL_LABEL) {
    return { tone: FAROL_TONE[fg], label: FAROL_GLOBAL_LABEL[fg] };
  }
  return { tone: "nt", label: codigo };
}

/**
 * Opções de farol para <Select> (edição/filtro do Gerenciador). Exclui AGUARDANDO_LIBERACAO: é
 * estado de SISTEMA (pré-admissão do Pandapé), não uma escolha manual — atribuí-lo pelo lápis
 * arrancaria a admissão da esteira. A liberação é feita na tela de Liberação Admissional, não aqui.
 */
export const FAROL_SELECT_OPTIONS = FAROL_GLOBAL.filter(
  (value) => value !== "AGUARDANDO_LIBERACAO" && value !== "LIBERACAO_RECUSADA",
).map((value) => ({
  value,
  label: FAROL_GLOBAL_LABEL[value],
}));
