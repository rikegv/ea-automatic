import { cn } from "@/lib/cn";
import { GlassCard } from "./GlassCard";
import { Icon, type IconName } from "./Icon";

export interface KpiTag {
  text: string;
  tone: "up" | "warn" | "dn";
}

/** Card de indicador: ícone + tag opcional + número grande (Manrope) + label. */
export function KpiCard({
  icon,
  value,
  label,
  tag,
}: {
  icon: IconName;
  value: string | number;
  label: string;
  tag?: KpiTag;
}) {
  return (
    <GlassCard className="kpi">
      <div className="k-top">
        <div className="k-ico">
          <Icon name={icon} />
        </div>
        {tag && <span className={cn("tag", tag.tone)}>{tag.text}</span>}
      </div>
      <div className="num">{value}</div>
      <div className="lbl">{label}</div>
    </GlassCard>
  );
}
