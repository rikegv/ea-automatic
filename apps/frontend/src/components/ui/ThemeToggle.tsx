"use client";

import { useTheme } from "@/lib/theme-context";
import { Icon } from "./Icon";

/** Alterna entre tema claro (padrão) e escuro; persistência via ThemeProvider. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-secondary grid h-9 w-9 place-items-center ${className ?? ""}`}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
    >
      <Icon name={isDark ? "sun" : "moon"} width={17} height={17} />
    </button>
  );
}
