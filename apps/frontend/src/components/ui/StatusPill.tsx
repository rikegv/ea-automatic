import { Icon, type IconName } from "@/components/ui/Icon";
import type { PillTone } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";

/**
 * Pill de status com ÍCONE DINÂMICO (padrão único de tabela, §A.12). O ícone acompanha o estado
 * real, nunca é fixo: completo/ok = check (verde); recusado/declinado = X (vermelho); qualquer
 * pendente/em andamento = exclamação (amarela). Substitui o ponto neutro da <Pill> nas colunas de
 * status/frente de todas as tabelas do sistema. A cor vem do tom (mesma leitura do Design System).
 */
const ICON_BY_TONE: Record<PillTone, IconName> = {
  ok: "check",
  dg: "x",
  wn: "alert",
  or: "alert",
  nt: "alert",
  in: "alert",
};

/** Nome do ícone dinâmico de um tom (exposto para reuso em badges/células fora da pill). */
export function statusIconName(tone: PillTone): IconName {
  return ICON_BY_TONE[tone];
}

export function StatusPill({
  tone,
  label,
  className,
  title,
  icon,
}: {
  tone: PillTone;
  label: string;
  className?: string;
  title?: string;
  /**
   * Ícone explícito, para o estado que o tom sozinho não descreve. O padrão continua sendo o
   * ícone dinâmico do tom (§A.12) e nenhum chamador existente muda: só quem PASSA o nome sai da
   * tabela acima. Existe para o caso informativo, em que o alerta do mapa diria o contrário do
   * rótulo (uma abstenção deliberada não é pendência).
   */
  icon?: IconName;
}) {
  return (
    <span className={cn("pill", tone, "whitespace-nowrap", className)} title={title ?? label}>
      <Icon name={icon ?? ICON_BY_TONE[tone]} className="h-3 w-3 flex-none" />
      {label}
    </span>
  );
}
