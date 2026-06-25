import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { KpiCard, type KpiTag } from "@/components/ui/KpiCard";
import type { IconName } from "@/components/ui/Icon";

interface Kpi {
  icon: IconName;
  value: number;
  label: string;
  tag?: KpiTag;
}

// Dados MOCK nesta fase (casca visual). Substituídos por dados reais em fase posterior.
const KPIS: Kpi[] = [
  { icon: "layers", value: 142, label: "Admissões ativas", tag: { text: "+8%", tone: "up" } },
  { icon: "clock", value: 11, label: "SLA vencido", tag: { text: "11", tone: "dn" } },
  { icon: "check", value: 87, label: "Concluídas no mês", tag: { text: "mês", tone: "up" } },
  { icon: "doc", value: 53, label: "Em auditoria" },
  { icon: "heart", value: 38, label: "Em exame" },
  { icon: "pen", value: 21, label: "Em cadastro" },
];

const BARS = [
  { label: "S1", height: 55 },
  { label: "S2", height: 72 },
  { label: "S3", height: 48 },
  { label: "S4", height: 88 },
  { label: "S5", height: 67 },
  { label: "S6", height: 95 },
];

export default function AnalisePage() {
  return (
    <>
      <PageHead
        eyebrow="Análise gerencial"
        title="Indicadores da operação"
        subtitle="Visão consolidada — atualizada em tempo real."
      />

      <div className="mb-[26px] grid grid-cols-2 gap-[14px] sm:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k) => (
          <KpiCard key={k.label} icon={k.icon} value={k.value} label={k.label} tag={k.tag} />
        ))}
      </div>

      <GlassCard className="panel">
        <h3>Volume de admissões</h3>
        <p className="psub">Por semana — últimas 6 semanas</p>
        <div className="bars">
          {BARS.map((b) => (
            <div key={b.label} className="bar-wrap">
              <div className="bar" style={{ height: `${b.height}%` }} />
              <small>{b.label}</small>
            </div>
          ))}
        </div>
      </GlassCard>
    </>
  );
}
