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
};

/** {tone,label} de um farol (aceita string crua do backend; cai em neutro se desconhecido). */
export function farolPill(codigo: string): { tone: PillTone; label: string } {
  const fg = codigo as FarolGlobal;
  if (fg in FAROL_GLOBAL_LABEL) {
    return { tone: FAROL_TONE[fg], label: FAROL_GLOBAL_LABEL[fg] };
  }
  return { tone: "nt", label: codigo };
}

/** Opções de farol para <Select> (value/label dos 5 valores oficiais). */
export const FAROL_SELECT_OPTIONS = FAROL_GLOBAL.map((value) => ({
  value,
  label: FAROL_GLOBAL_LABEL[value],
}));
