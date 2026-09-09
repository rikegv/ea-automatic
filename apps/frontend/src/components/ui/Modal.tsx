"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Casca padrão de modal (ajustes-2B-2C / G3). Overlay + painel glass renderizados em **portal**
 * (z-index alto, fora de qualquer stacking context). O painel usa `--surface-2` (mais opaco) para
 * ler como superfície limpa do design system no **tema claro**: corrige o "fundo cinza de sistema
 * antigo". Selects internos (z-60) sobrepõem o modal (z-55).
 *
 * ─ O CLIQUE FORA NÃO FECHA, e isso vale para o SISTEMA INTEIRO ────────────────────────────────
 *
 * O overlay tinha `onClick={onClose}`, então qualquer encostada fora do painel fechava o modal e
 * **jogava fora tudo o que a pessoa tinha digitado**, sem aviso e sem desfazer. Aconteceu no
 * cadastro de candidato, com o formulário preenchido. Fechar é decisão, não é escorregão do
 * ponteiro: o modal sai pelo "Cancelar" ou pelo "Salvar", que são os botões que a pessoa escolhe.
 *
 * A TECLA ESCAPE CONTINUA FECHANDO, de propósito. Ela é gesto deliberado (ninguém encosta o dedo
 * no Escape sem querer) e é a saída de teclado que a acessibilidade de um `role="dialog"` espera.
 *
 * Sem `onClick` no overlay, o `stopPropagation` do painel deixou de ter função e saiu junto: ele
 * existia só para impedir que o clique de dentro subisse até o fechamento do overlay.
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
    >
      <div
        className={cn(
          "glass !bg-[var(--surface-2)] panel max-h-[88vh] w-full overflow-auto",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
