"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Casca padrão de modal (ajustes-2B-2C / G3). Overlay + painel glass renderizados em **portal**
 * (z-index alto, fora de qualquer stacking context). O painel usa `--surface-2` (mais opaco) para
 * ler como superfície limpa do design system no **tema claro** — corrige o "fundo cinza de sistema
 * antigo". Fecha por clique-fora e Escape. Selects internos (z-60) sobrepõem o modal (z-55).
 */
export function Modal({
  onClose,
  children,
  className,
  ariaLabel,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[55] grid place-items-center bg-[rgba(7,17,31,0.55)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
    >
      <div
        className={cn(
          "glass !bg-[var(--surface-2)] panel max-h-[88vh] w-full overflow-auto",
          className,
        )}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
