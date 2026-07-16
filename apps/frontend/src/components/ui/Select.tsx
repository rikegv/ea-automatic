"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  /** Cor opcional do ponto (status): mantém o seletor com a mesma leitura das pills. */
  color?: string;
}

/** Normaliza para busca: minúsculas, sem acento. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Seletor estilizado do design system (2C/ajustes-2B-2C). Substitui o `<select>` nativo, cujo
 * dropdown herda o tema do SO (cinza no modo escuro). Botão `.ds-select` + popover glass renderizado
 * em **portal** (position fixed, z-index alto) para **sobrepor qualquer bloco** e não ser cortado por
 * `overflow`/stacking de containers. Com `searchable` (auto p/ listas longas), abre com campo de
 * busca que filtra a lista em tempo real (G2). Fecha por clique-fora / Escape.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Selecionar…",
  disabled = false,
  className,
  ariaLabel,
  searchable,
  onAdd,
  menuFit = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Mostra campo de busca interno. Auto-ativado quando há mais de 8 opções. */
  searchable?: boolean;
  /** Quando fornecido (admin), permite criar um item novo a partir da busca. */
  onAdd?: (nome: string) => void | Promise<void>;
  /**
   * Popover ajusta a largura ao MAIOR rótulo (em vez de ficar preso à largura do gatilho), mostrando
   * o texto completo das opções sem corte. Usado onde a coluna é estreita (barra de Avanço da
   * Esteira). O gatilho recolhido segue truncando; só a lista aberta cresce.
   */
  menuFit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const comBusca = searchable ?? (Boolean(onAdd) || options.length > 8);

  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q));
  }, [options, query]);

  // Posiciona o popover a partir do botão (position fixed).
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
    function onReflow() {
      reposicionar();
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    // captura scroll de qualquer container ancestral
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  function abrir() {
    if (disabled) return;
    setQuery("");
    setOpen((v) => !v);
  }

  function escolher(v: string) {
    onChange(v);
    setOpen(false);
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
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={abrir}
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

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className={cn(
              "glass fixed z-[60] overflow-hidden p-1.5 !bg-[var(--surface-2)]",
              menuFit && "w-max max-w-[min(92vw,560px)]",
            )}
            style={
              menuFit
                ? { top: pos.top, left: pos.left, minWidth: pos.width }
                : { top: pos.top, left: pos.left, width: pos.width }
            }
          >
            {comBusca && (
              <div className="px-1 pb-1.5">
                <input
                  autoFocus
                  className="ds-input !py-2 text-[13px]"
                  placeholder="Buscar…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filtradas.length === 1) escolher(filtradas[0].value);
                  }}
                />
              </div>
            )}
            <div className="max-h-60 overflow-auto">
              {filtradas.length === 0 && !podeAdicionar ? (
                <div className="px-3 py-2 text-[13px] text-faint">Nenhum resultado.</div>
              ) : (
                filtradas.map((o) => {
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
                      onClick={() => escolher(o.value)}
                    >
                      {o.color && (
                        <span
                          className="h-1.5 w-1.5 flex-none rounded-full"
                          style={{ background: o.color }}
                        />
                      )}
                      <span className={menuFit ? "whitespace-nowrap" : "truncate"}>{o.label}</span>
                      {active && (
                        <Icon name="check" className="ml-auto h-3.5 w-3.5 flex-none text-accent" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {podeAdicionar && (
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-50"
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
