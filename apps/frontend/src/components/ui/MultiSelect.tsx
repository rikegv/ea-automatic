"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface MultiOption {
  value: string;
  label: string;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Seletor MÚLTIPLO do design system (W3 — benefícios). Mesmo padrão do `Select`: botão `.ds-select`
 * + popover glass em portal (z-60, sobrepõe). Busca interna, marca/desmarca por item, mostra as
 * escolhas como chips. Com `onAdd` (admin), cria um item novo a partir da busca.
 */
export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Selecionar…",
  className,
  ariaLabel,
  onAdd,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  onAdd?: (nome: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selset = useMemo(() => new Set(values), [values]);
  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    return q ? options.filter((o) => norm(o.label).includes(q)) : options;
  }, [options, query]);

  const reposicionar = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };
  useLayoutEffect(() => {
    if (open) reposicionar();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposicionar);
    window.addEventListener("scroll", reposicionar, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposicionar);
      window.removeEventListener("scroll", reposicionar, true);
    };
  }, [open]);

  function toggle(v: string) {
    onChange(selset.has(v) ? values.filter((x) => x !== v) : [...values, v]);
  }

  const termo = query.trim();
  const podeAdicionar =
    Boolean(onAdd) &&
    termo.length >= 2 &&
    !options.some((o) => o.label.toLowerCase() === termo.toLowerCase());
  async function adicionar() {
    if (!onAdd || !termo) return;
    setAdding(true);
    try {
      await onAdd(termo);
      setQuery("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        className="ds-select flex w-full items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
      >
        <span className={cn("min-w-0 truncate", values.length === 0 && "text-faint")}>
          {values.length === 0 ? placeholder : `${values.length} selecionado(s)`}
        </span>
        <Icon
          name="arr"
          className={cn("h-4 w-4 flex-none rotate-90 text-faint transition", open && "-rotate-90")}
        />
      </button>

      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex max-w-full items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[12px]"
            >
              <span className="min-w-0 truncate">{options.find((o) => o.value === v)?.label ?? v}</span>
              <button
                type="button"
                className="flex-none text-faint hover:text-danger"
                aria-label={`Remover ${v}`}
                onClick={() => toggle(v)}
              >
                <Icon name="x" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-multiselectable="true"
            className="glass fixed z-[60] overflow-hidden p-1.5 !bg-[var(--surface-2)]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="px-1 pb-1.5">
              <input
                autoFocus
                className="ds-input !py-2 text-[13px]"
                placeholder="Buscar…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="max-h-60 overflow-auto">
              {filtradas.length === 0 && !podeAdicionar ? (
                <div className="px-3 py-2 text-[13px] text-faint">Nenhum resultado.</div>
              ) : (
                filtradas.map((o) => {
                  const on = selset.has(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition hover:bg-[var(--surface)]"
                      onClick={() => toggle(o.value)}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 flex-none place-items-center rounded border",
                          on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)]",
                        )}
                      >
                        {on && <Icon name="check" className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })
              )}
            </div>
            {podeAdicionar && (
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-accent transition hover:bg-[var(--surface)] disabled:opacity-50"
                disabled={adding}
                onClick={adicionar}
              >
                <Icon name="plus" className="h-3.5 w-3.5 flex-none" />
                {adding ? "Adicionando…" : `Adicionar “${termo}”`}
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
