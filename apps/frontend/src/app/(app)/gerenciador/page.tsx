import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";

export default function GerenciadorPage() {
  return (
    <>
      <PageHead
        eyebrow="Gerenciador"
        title="Todas as admissões"
        subtitle="Tabela com filtros e busca global."
      />
      <GlassCard className="panel">
        <p className="text-dim">O gerenciador (F10) com dados reais entra na próxima OST funcional da Fase 2.</p>
      </GlassCard>
    </>
  );
}
