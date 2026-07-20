"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

/** Linha de navegação da sidebar; ativo destaca fundo + borda + ícone accent. */
export function NavItem({
  href,
  icon,
  label,
  active,
  expanded = true,
  critical = false,
  badge = 0,
}: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
  /** Recolhido (false): só o ícone, centralizado; o label vira tooltip. */
  expanded?: boolean;
  /** Faixa vermelha premium (tela crítica): preenche a linha do item para chamar atenção. */
  critical?: boolean;
  /** Contador (Parte 3): >0 mostra o número; 0 esconde. Recolhido vira um ponto sobre o ícone. */
  badge?: number;
}) {
  const temBadge = badge > 0;
  return (
    <Link
      href={href}
      className={cn(
        "nav-item",
        active && "active",
        !expanded && "justify-center",
        critical && "nav-item-critical",
      )}
      aria-current={active ? "page" : undefined}
      title={expanded ? undefined : temBadge ? `${label} (${badge})` : label}
    >
      <span className="relative flex-none">
        <Icon name={icon} />
        {/* Recolhido: sem espaço para o número, um ponto sobre o ícone sinaliza pendência. */}
        {!expanded && temBadge && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-[var(--danger)]" />
        )}
      </span>
      {expanded && <span className="truncate">{label}</span>}
      {expanded && temBadge && (
        <span className="ml-auto flex-none rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-danger">
          {badge}
        </span>
      )}
    </Link>
  );
}
