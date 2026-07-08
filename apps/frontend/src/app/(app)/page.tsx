"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { RadarBanner } from "@/components/home/RadarBanner";
import { Icon, type IconName } from "@/components/ui/Icon";

interface QuickCard {
  href: string;
  icon: IconName;
  title: string;
  desc: string;
}

const CARDS: QuickCard[] = [
  {
    href: "/nova",
    icon: "plus",
    title: "Nova admissão",
    desc: "Cadastrar candidato em três etapas: cliente, vaga e dados pessoais.",
  },
  {
    href: "/esteira",
    icon: "layers",
    title: "Esteira admissional",
    desc: "Faróis de auditoria, exame e cadastro: operação por frente.",
  },
  {
    href: "/gerenciador",
    icon: "table",
    title: "Gerenciador",
    desc: "Todas as admissões em tabela, com filtros e busca global.",
  },
  {
    href: "/analise",
    icon: "chart",
    title: "Análise gerencial",
    desc: "KPIs da operação e volume de admissões por período.",
  },
];

/** Saudação por horário: leve, sem dependência de dados reais nesta fase. */
function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function primeiroNome(email: string): string {
  const local = email.split("@")[0] ?? email;
  const first = local.split(/[._-]+/)[0] ?? local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default function HomePage() {
  const { user } = useAuth();
  const nome = user ? primeiroNome(user.email) : "";

  return (
    <>
      <PageHead
        eyebrow="Painel inicial"
        title={`${saudacao()}, ${nome}`}
        subtitle="O que está acontecendo na esteira agora."
      />

      <RadarBanner />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CARDS.map((c) => (
          <GlassCard key={c.href} as={Link} href={c.href} className="qcard block">
            <div className="q-ico">
              <Icon name={c.icon} />
            </div>
            <span className="arr">
              <Icon name="arr" width={18} height={18} />
            </span>
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
          </GlassCard>
        ))}
      </div>
    </>
  );
}
