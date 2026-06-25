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
}: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={cn("nav-item", active && "active")} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}
