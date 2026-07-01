"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";

const SUBNAV = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/regua", label: "Régua documental" },
  { href: "/admin/regras", label: "Regras de auditoria" },
  { href: "/admin/usuarios", label: "Usuários" },
];

/** Camada de administração: roda DENTRO do AppShell. Só guard de papel + sub-abas. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const pathname = usePathname();

  if (!isAdmin) {
    return (
      <>
        <PageHead eyebrow="Administração" title="Acesso restrito" />
        <GlassCard className="panel">
          <p className="text-dim">
            A administração de cadastros é exclusiva de Master / Super Admin.{" "}
            <Link href="/" className="text-accent underline">
              Voltar ao início
            </Link>
            .
          </p>
        </GlassCard>
      </>
    );
  }

  return (
    <>
      <div className="mb-[22px] flex flex-wrap gap-2">
        {SUBNAV.map((n) => {
          const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={cn("tab", active && "active")}>
              {n.label}
            </Link>
          );
        })}
      </div>
      {children}
    </>
  );
}
