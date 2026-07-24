"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Papel } from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { LogoEA } from "@/components/ui/LogoEA";
import { NavItem } from "@/components/ui/NavItem";
import { useLiberacaoCount } from "./LiberacaoAlerta";
import { useDiagnosticoAlerta } from "./DiagnosticoAlerta";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";

interface NavDef {
  href: string;
  icon: IconName;
  label: string;
  /** Código do menu (OST permissão de menu): a visibilidade segue `temMenu(codigo)`. */
  codigo: string;
  /** Faixa vermelha premium (tela crítica / principal indicador). */
  critical?: boolean;
}

const OPERACAO: NavDef[] = [
  { href: "/", icon: "home", label: "Início", codigo: "inicio" },
  { href: "/analise", icon: "chart", label: "Análise gerencial", codigo: "analise" },
  // 3º item, com destaque vermelho: é a tela crítica (pré-admissões aguardando liberação).
  { href: "/liberacao", icon: "clock", label: "Liberação Admissional", codigo: "liberacao", critical: true },
  { href: "/nova", icon: "plus", label: "Nova admissão", codigo: "nova" },
  { href: "/esteira", icon: "layers", label: "Esteira admissional", codigo: "esteira" },
  { href: "/nao-conformidades", icon: "alert", label: "Não conformidades", codigo: "nao-conformidades" },
  { href: "/gerenciador", icon: "table", label: "Gerenciador", codigo: "gerenciador" },
];

// Gerador de kit (motor de extração, OST): tela própria. Visibilidade agora pelo menu `gerador-kit`
// (OST permissão de menu), não mais só por `isAdmin`. Continua na navegação principal.
const GERADOR_KIT: NavDef = { href: "/gerador-kit", icon: "pen", label: "Gerador de kit", codigo: "gerador-kit" };

const PAPEL_ROTULO: Record<Papel, string> = {
  SUPER_ADMIN: "Super Admin",
  MASTER: "Master",
  COMUM: "Consultor",
};

const STORAGE_KEY = "ea-sidebar-pinned";

/** Códigos dos menus do grupo Administração (para decidir se o card "Menu Gerencial" aparece). */
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
  const { user, isAdmin, temMenu, logout } = useAuth();
  const liberacaoCount = useLiberacaoCount();
  const diagAlerta = useDiagnosticoAlerta();
  const pathname = usePathname();
  const router = useRouter();

  // Preferência de fixação (congelar) persistida por usuário em localStorage (mesmo padrão do tema).
  const [pinned, setPinned] = useState(true);
  const [hovering, setHovering] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setPinned(saved === "true");
  }, []);
  function togglePin() {
    setPinned((p) => {
      const next = !p;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }
  // Fixado = sempre expandido. Desafixado = recolhido; expande ao passar o mouse (temporário).
  const expanded = pinned || hovering;

  const name = user ? displayName(user.email) : "não informado";
  const initial = name.charAt(0).toUpperCase() || "?";
  const papel = user ? PAPEL_ROTULO[user.papel] : "";

  // Botão de recolher/fixar, reusado no topo (mesmo elemento nos dois estados do menu).
  const toggleBtn = (
    <button
      type="button"
      onClick={togglePin}
      aria-label={pinned ? "Recolher menu" : "Fixar menu expandido"}
      title={pinned ? "Recolher menu" : "Fixar menu expandido"}
      aria-pressed={pinned}
      className="grid h-8 w-8 flex-none place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
    >
      <Icon name={expanded ? "left" : "right"} className="h-[18px] w-[18px]" />
    </button>
  );

  return (
    <aside
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn(
        "glass side z-[20] m-4 mr-0 flex shrink-0 flex-col gap-1.5 transition-[width] duration-200",
        expanded ? "w-[248px] p-[22px_16px]" : "w-[76px] p-[22px_12px]",
      )}
    >
      {/* Topo: logo oficial do EA + botão recolher/fixar (setas). Expandido mostra o logo completo
          (símbolo + "EA AUTOMATIC"); recolhido mostra só o símbolo, empilhado sobre o botão. */}
      {expanded ? (
        <div className="mb-[18px] flex items-center justify-between">
          <LogoEA variant="full" className="ml-0.5" />
          {toggleBtn}
        </div>
      ) : (
        <div className="mb-[18px] flex flex-col items-center gap-2">
          <LogoEA variant="symbol" />
          {toggleBtn}
        </div>
      )}

      {/* OST permissão de menu: a barra mostra SÓ os menus que o usuário tem (admin vê tudo por
          bypass). O Gerador de kit deixou de depender de `isAdmin` e passou ao menu `gerador-kit`. */}
      <div className={cn("nav-label", !expanded && "hidden")}>Operação</div>
      {[...OPERACAO, GERADOR_KIT]
        .filter((n) => temMenu(n.codigo))
        .map((n) => (
          <NavItem
            key={n.href}
            {...n}
            active={isActive(pathname, n.href)}
            expanded={expanded}
            badge={n.href === "/liberacao" ? liberacaoCount : 0}
          />
        ))}

      {/* Administração: o card "Menu Gerencial" aparece para admin OU para quem tem ao menos um menu
          administrativo (ex.: a consultora de auditoria com Regras + Régua). */}
      {(isAdmin || ADMIN_MENUS.some((c) => temMenu(c))) && (
        <>
          <div className="nav-sep" />
          <div className={cn("nav-label", !expanded && "hidden")}>Administração</div>
          <NavItem
            href="/admin"
            icon="cog"
            label="Menu Gerencial"
            active={isActive(pathname, "/admin")}
            expanded={expanded}
            badge={diagAlerta.total}
          />
        </>
      )}

      <div className={cn("side-user mt-auto", !expanded && "justify-center !px-1.5")}>
        <div className="av">{initial}</div>
        {expanded && (
          <div className="leading-tight">
            <b className="block text-[13px] font-semibold">{name}</b>
            <small className="text-[11px] text-faint">{papel}</small>
          </div>
        )}
      </div>

      <div className={cn("mt-2 flex gap-2", expanded ? "" : "flex-col items-center")}>
        {expanded ? (
          <Button
            variant="secondary"
            className="flex-1 px-3 py-2 text-[13px]"
            onClick={() => logout().then(() => router.replace("/login"))}
          >
            Sair
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => logout().then(() => router.replace("/login"))}
            aria-label="Sair"
            title="Sair"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
          >
            <Icon name="logout" className="h-[17px] w-[17px]" />
          </button>
        )}
        <ThemeToggle />
      </div>
    </aside>
  );
}
