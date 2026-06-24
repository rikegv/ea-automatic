/** Junta classes condicionais (utilitário mínimo de UI). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
