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
}: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
  /** Recolhido (false): só o ícone, centralizado; o label vira tooltip. */
  expanded?: boolean;
  /** Faixa vermelha premium (tela crítica): preenche a linha do item para chamar atenção. */
  critical?: boolean;
}) {
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
      title={expanded ? undefined : label}
    >
      <Icon name={icon} />
      {expanded && <span className="truncate">{label}</span>}
    </Link>
  );
}
