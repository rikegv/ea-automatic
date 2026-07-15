"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon, type IconName } from "@/components/ui/Icon";

// Um card por tela do Menu Gerencial (padrão: ícone + título + descrição curta + seta). Ordem e
// lista completas conforme a OST de padronização.
const CARDS: { href: string; icon: IconName; title: string; desc: string }[] = [
  {
    href: "/admin/clientes",
    icon: "users",
    title: "Clientes",
    desc: "Código, CNPJ, razão social e operação.",
  },
  { href: "/admin/cargos", icon: "tag", title: "Cargos", desc: "Catálogo de cargos da admissão." },
  {
    href: "/admin/motivos-declinio",
    icon: "alert",
    title: "Motivos de declínio",
    desc: "Catálogo de motivos de declínio da admissão.",
  },
  {
    href: "/admin/regua",
    icon: "doc",
    title: "Régua documental",
    desc: "Exigência de cada documento por (cliente + cargo).",
  },
  {
    href: "/admin/kit-regras",
    icon: "layers",
    title: "Regras do kit",
    desc: "Documentos e régua padrão de cada tipo de kit.",
  },
  {
    href: "/admin/regras",
    icon: "check",
    title: "Regras de auditoria",
    desc: "Critério de validade de cada documento (motor de IA).",
  },
  {
    href: "/admin/usuarios",
    icon: "users",
    title: "Usuários",
    desc: "Cadastro, papéis, acesso e reset de senha.",
  },
];

/** Normaliza para busca: minúsculas, sem acento (mesmo comportamento das outras buscas). */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export default function AdminHome() {
  const [busca, setBusca] = useState("");

  // Busca só do Menu Gerencial: filtra os CARDS por título/descrição; os que não batem SOMEM (a tela
  // continua sendo de cards, não vira lista). Ao limpar, todos voltam.
  const visiveis = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return CARDS;
    return CARDS.filter((c) => norm(`${c.title} ${c.desc}`).includes(q));
  }, [busca]);

  return (
    <>
      <PageHead eyebrow="Administração" title="Menu Gerencial" />
      {/* Busca só do Menu Gerencial (não vai na fachada "Bom dia"): filtra os cards. */}
      <div className="mb-[18px]">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar tela do menu"
          aria-label="Buscar tela do menu"
          className="ds-input w-full rounded-full sm:w-80"
        />
      </div>

      {visiveis.length === 0 ? (
        <GlassCard className="panel">
          <p className="text-dim">Nenhuma tela corresponde à busca.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {visiveis.map((c) => (
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
      )}
    </>
  );
}
