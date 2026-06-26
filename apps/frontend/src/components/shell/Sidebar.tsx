"use client";

import { useRouter, usePathname } from "next/navigation";
import type { Papel } from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { Brand } from "@/components/ui/Brand";
import { NavItem } from "@/components/ui/NavItem";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/Button";
import type { IconName } from "@/components/ui/Icon";

interface NavDef {
  href: string;
  icon: IconName;
  label: string;
}

const OPERACAO: NavDef[] = [
  { href: "/", icon: "home", label: "Início" },
  { href: "/analise", icon: "chart", label: "Análise gerencial" },
  { href: "/nova", icon: "plus", label: "Nova admissão" },
  { href: "/esteira", icon: "layers", label: "Esteira admissional" },
  { href: "/nao-conformidades", icon: "alert", label: "Não conformidades" },
  { href: "/gerenciador", icon: "table", label: "Gerenciador" },
];

const PAPEL_ROTULO: Record<Papel, string> = {
  SUPER_ADMIN: "Super Admin",
  MASTER: "Master",
  COMUM: "Consultor",
};

/** Deriva um nome de exibição a partir do e-mail (sem cadastro de nome na Fase 1A). */
function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const name = user ? displayName(user.email) : "—";
  const initial = name.charAt(0).toUpperCase() || "?";
  const papel = user ? PAPEL_ROTULO[user.papel] : "";

  return (
    <aside className="glass side z-[1] m-4 mr-0 flex w-[248px] shrink-0 flex-col gap-1.5 p-[22px_16px]">
      <Brand className="mb-[22px] ml-1.5 mt-1" />

      <div className="nav-label">Operação</div>
      {OPERACAO.map((n) => (
        <NavItem key={n.href} {...n} active={isActive(pathname, n.href)} />
      ))}

      {isAdmin && (
        <>
          <div className="nav-sep" />
          <div className="nav-label">Administração</div>
          <NavItem href="/admin" icon="cog" label="Cadastros" active={isActive(pathname, "/admin")} />
        </>
      )}

      <div className="side-user mt-auto">
        <div className="av">{initial}</div>
        <div className="leading-tight">
          <b className="block text-[13px] font-semibold">{name}</b>
          <small className="text-[11px] text-faint">{papel}</small>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1 px-3 py-2 text-[13px]"
          onClick={() => logout().then(() => router.replace("/login"))}
        >
          Sair
        </Button>
        <ThemeToggle />
      </div>
    </aside>
  );
}
