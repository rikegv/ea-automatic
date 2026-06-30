import type { Origem } from "@ea/shared-types";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Marcador de PROCEDÊNCIA da admissão (Fase 5 / INT-1). Distingue admissões que entraram pelo
 * Pandapé das criadas manualmente no wizard. Discreto e informativo (tom accent — azul Soulan,
 * não-alarmante): renderiza um chip "Via Pandapé" SOMENTE quando `origem === "PANDAPE"`. Para
 * origem MANUAL (o default silencioso), não renderiza nada.
 *
 * Não é uma pill de status (não usa ponto colorido): é um selo de origem com ícone de elo,
 * sugerindo integração/vínculo com sistema externo.
 */
export function OrigemBadge({
  origem,
  className,
  iconOnly = false,
}: {
  origem?: Origem | null;
  className?: string;
  /** Apenas o ícone (com tooltip) — para colunas estreitas. */
  iconOnly?: boolean;
}) {
  if (origem !== "PANDAPE") return null;
  return (
    <span
      title="Admissão originada do Pandapé"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[rgba(34,176,219,0.28)] bg-[rgba(34,176,219,0.12)] px-1.5 py-[3px] text-[11px] font-semibold leading-none text-accent",
        className,
      )}
    >
      <Icon name="link" className="h-3 w-3 flex-none" />
      {!iconOnly && "Via Pandapé"}
    </span>
  );
}
