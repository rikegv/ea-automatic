"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  /** Cor opcional do ponto (status) — mantém o seletor com a mesma leitura das pills. */
  color?: string;
}

/**
 * Seletor estilizado do design system (2C item 8). Substitui o `<select>` nativo — cujo dropdown
 * herda o tema do SO (cinza no modo escuro). Botão `.ds-select` + popover glass com a mesma
 * linguagem do restante do sistema. Fecha por clique-fora / Escape.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Selecionar…",
  disabled = false,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        className="ds-select flex w-full items-center justify-between gap-2 text-left"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={cn("flex min-w-0 items-center gap-2", !selected && "text-faint")}>
          {selected?.color && (
            <span
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: selected.color }}
            />
          )}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <Icon
          name="arr"
          className={cn("h-4 w-4 flex-none rotate-90 text-faint transition", open && "-rotate-90")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          id={listId}
          className="glass absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-auto p-1.5"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition hover:bg-[var(--surface-2)]",
                  active && "bg-[var(--surface-2)] font-semibold",
                )}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.color && (
                  <span
                    className="h-1.5 w-1.5 flex-none rounded-full"
                    style={{ background: o.color }}
                  />
                )}
                <span className="truncate">{o.label}</span>
                {active && <Icon name="check" className="ml-auto h-3.5 w-3.5 flex-none text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
