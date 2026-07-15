"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";

/** Camada de administração: roda DENTRO do AppShell. Só guard de papel + botão de voltar. A navegação
 * do Menu Gerencial é 100% pelos cards (as abas de texto foram removidas). */
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
      {/* Botão premium de voltar ao Menu Gerencial: aparece em toda tela interna (não na própria
          Visão geral do menu), já que as abas de texto do topo foram removidas. */}
      {pathname !== "/admin" && (
        <div className="mb-[18px]">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-dim transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)] hover:text-accent"
          >
            <Icon name="left" className="h-[18px] w-[18px]" />
            Menu Gerencial
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
