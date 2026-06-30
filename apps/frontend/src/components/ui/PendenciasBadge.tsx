import { Icon } from "@/components/ui/Icon";
import type { PillTone } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";

/**
 * Badge CLICÁVEL de pendências obrigatórias (Fase 4 — ajustes visuais, T2).
 * Diferencia-se das pills de status (sólidas, não-clicáveis): ícone de alerta + borda pontilhada
 * + cursor-pointer/hover, deixando claro que é interativo (abre o modal de pendências). A cor
 * segue o tom do sinalizador (mesma leitura semântica do Design System).
 */
const TONE_VAR: Record<PillTone, string> = {
  ok: "var(--ok)",
  wn: "var(--warn)",
  or: "var(--warn-2)",
  dg: "var(--danger)",
  nt: "var(--dim)",
  in: "var(--accent)",
};

export function PendenciasBadge({
  tone,
  label,
  onClick,
  title = "Ver pendências obrigatórias",
  className,
}: {
  tone: PillTone;
  label: string;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  const color = TONE_VAR[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{ color, borderColor: color }}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed bg-transparent px-2.5 py-[5px] text-[12px] font-semibold leading-none transition hover:bg-[var(--surface-2)]",
        className,
      )}
    >
      <Icon name="alert" className="h-3.5 w-3.5 flex-none" />
      {label}
    </button>
  );
}
