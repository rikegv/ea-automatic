import {
  CLICKSIGN_STATUS_LABEL,
  type ClicksignStatus,
} from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";

/**
 * Tom da pill por status do envelope Clicksign (INT-4 / §A.5). Mapeia os 4 valores oficiais aos
 * tons do Design System: sem envelope → neutro (nt, discreto/escondível), aguardando assinatura →
 * amarelo (wn), assinado → verde (ok), cancelado → neutro (nt).
 */
export const CLICKSIGN_TONE: Record<ClicksignStatus, PillTone> = {
  SEM_ENVELOPE: "nt",
  AGUARDANDO_ASSINATURA: "wn",
  ASSINADO: "ok",
  CANCELADO: "nt",
};

/** {tone,label} de um status Clicksign (aceita string crua; cai em neutro se desconhecido). */
export function clicksignPill(codigo: string): { tone: PillTone; label: string } {
  const cs = codigo as ClicksignStatus;
  if (cs in CLICKSIGN_STATUS_LABEL) {
    return { tone: CLICKSIGN_TONE[cs], label: CLICKSIGN_STATUS_LABEL[cs] };
  }
  return { tone: "nt", label: codigo };
}

/** Status que possuem envelope ativo passível de reenvio por correção (§A.5 INT-4). */
export function temEnvelopeReenviavel(status: string): boolean {
  return status === "AGUARDANDO_ASSINATURA" || status === "CANCELADO";
}
