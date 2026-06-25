import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon, type IconName } from "@/components/ui/Icon";

const CARDS: { href: string; icon: IconName; title: string; desc: string }[] = [
  { href: "/admin/clientes", icon: "users", title: "Clientes", desc: "Código, CNPJ, razão social e operação." },
  { href: "/admin/cargos", icon: "tag", title: "Cargos", desc: "Catálogo de cargos da admissão." },
  {
    href: "/admin/regua",
    icon: "doc",
    title: "Régua documental",
    desc: "Exigência de cada documento por (cliente + cargo).",
  },
];

export default function AdminHome() {
  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Cadastros"
        subtitle="Clientes, cargos e régua documental — base do processo admissional."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
