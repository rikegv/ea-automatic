import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";

export default function NovaAdmissaoPage() {
  return (
    <>
      <PageHead
        eyebrow="Nova admissão"
        title="Cadastro em etapas"
        subtitle="Wizard: cliente → vaga → candidato."
      />
      <GlassCard className="panel">
        <p className="text-dim">O wizard de cadastro (F6) entra na próxima OST funcional da Fase 2.</p>
      </GlassCard>
    </>
  );
}
