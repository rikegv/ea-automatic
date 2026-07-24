"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";

/** Códigos dos menus do grupo Administração (define quem pode ABRIR o Menu Gerencial). */
const ADMIN_MENUS = [
  "clientes",
  "cargos",
  "escalas",
  "motivos-declinio",
  "tarifas",
  "regua",
  "kit-regras",
  "regras",
  "usuarios",
];

/** Camada de administração: roda DENTRO do AppShell. Botão de voltar + guard de ACESSO À CAMADA.
 * OST permissão de menu: deixou de ser exclusiva de admin. Entra quem é admin OU tem ao menos um menu
 * administrativo (ex.: a consultora de auditoria com Regras + Régua). O guard POR TELA (no layout do
 * app) e o BACKEND barram cada tela específica que o usuário não tenha. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin, temMenu } = useAuth();
  const pathname = usePathname();

  const podeAdministracao = isAdmin || ADMIN_MENUS.some((c) => temMenu(c));
  if (!podeAdministracao) {
    return (
      <>
        <PageHead eyebrow="Administração" title="Acesso restrito" />
        <GlassCard className="panel">
          <p className="text-dim">
            Você não tem nenhum menu administrativo liberado.{" "}
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
