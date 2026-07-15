"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { Button } from "./Button";

/**
 * Gatilho + modal de FILTROS padrão do sistema (Bloco B), idêntico nas três telas (Esteira, Não
 * Conformidades, Gerenciador). Substitui a antiga faixa de filtros na tela por:
 *  - um ÍCONE de filtro com animação sutil de atenção (sobe/desce em loop, `.filtro-flutua`);
 *  - um BADGE com a contagem de filtros ativos (indicador de filtro aplicado);
 *  - ao clicar, o modal premium padrão (`Modal`) com TODOS os filtros da tela (passados como
 *    `children`), cada um multi-select. Rodapé com "Limpar filtros" e "Fechar".
 *
 * Os filtros aplicam ao vivo (a tela recarrega ao mudar cada estado); o modal só agrupa e apresenta.
 */
export function FiltroTrigger({
  count,
  onLimpar,
  children,
  className,
}: {
  count: number;
  onLimpar: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ativo = count > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ativo ? `Filtros (${count} ativo${count > 1 ? "s" : ""})` : "Abrir filtros"}
        title={
          ativo ? `${count} filtro${count > 1 ? "s" : ""} ativo${count > 1 ? "s" : ""}` : "Filtrar"
        }
        className={cn(
          "relative grid h-11 w-11 flex-none place-items-center rounded-xl border transition",
          ativo
            ? "border-[var(--accent)] bg-[var(--surface-2)] text-accent"
            : "border-[var(--border)] bg-[var(--surface)] text-dim hover:bg-[var(--surface-2)] hover:text-text",
          className,
        )}
      >
        <Icon name="filter" className="filtro-flutua h-[19px] w-[19px]" />
        {ativo && (
          <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold leading-none text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} className="max-w-lg" ariaLabel="Filtros">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--sico)] text-accent">
              <Icon name="filter" className="h-4 w-4" />
            </span>
            <h3 className="!mb-0">Filtros</h3>
            {ativo && (
              <span className="ml-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[12px] font-semibold text-dim">
                {count} ativo{count > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="grid gap-3.5">{children}</div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onLimpar}
              disabled={!ativo}
              className="text-sm text-dim transition hover:text-danger disabled:opacity-40 disabled:hover:text-dim"
            >
              Limpar filtros
            </button>
            <Button onClick={() => setOpen(false)} className="px-5 py-2.5">
              Fechar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Rótulo de um campo de filtro dentro do modal (label acima do controle). */
export function FiltroCampo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}
