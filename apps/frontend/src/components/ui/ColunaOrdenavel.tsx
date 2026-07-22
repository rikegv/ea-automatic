"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Ordenacao } from "@/lib/ordenacao";

/**
 * Célula de cabeçalho CLICÁVEL para ordenar a tabela. Par visual do `useOrdenacao`.
 *
 * Serve às duas famílias de tabela do sistema sem adaptação:
 *  - grid (`.list-head > span`): usar `as="span"`, o padrão;
 *  - `<table class="ds-table">`: usar `as="th"`.
 * Em ambos os casos o elemento externo é o mesmo de antes, então o layout de colunas e a divisória
 * do §A.12 continuam valendo. O clique fica num <button> de verdade (teclado e leitor de tela).
 */
export function ColunaOrdenavel<T>({
  ord,
  chave,
  children,
  as: Tag = "span",
  className,
  style,
}: {
  ord: Ordenacao<T>;
  chave: string;
  children: ReactNode;
  as?: "span" | "th";
  className?: string;
  style?: CSSProperties;
}) {
  const ativa = ord.ordem?.chave === chave;
  const dir = ativa ? ord.ordem!.dir : null;

  return (
    <Tag
      className={className}
      style={style}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => ord.alternar(chave)}
        // O cabeçalho é caixa alta e pequeno (§A.12): herda tudo do pai para o botão não destoar.
        className={cn(
          "inline-flex w-full items-center justify-center gap-1 font-[inherit] text-[inherit] uppercase tracking-[inherit] transition hover:text-text",
          ativa ? "text-accent" : "text-[inherit]",
        )}
        title={
          ativa
            ? dir === "asc"
              ? "Ordenado do menor para o maior. Clique para inverter."
              : "Ordenado do maior para o menor. Clique para inverter."
            : "Clique para ordenar por esta coluna"
        }
      >
        <span className="truncate">{children}</span>
        <SetaOrdenacao dir={dir} />
      </button>
    </Tag>
  );
}

/**
 * Indicador de ordenação. Fora da coluna ativa fica um par de setas apagado, que é a afordância de
 * "esta coluna ordena"; na coluna ativa só a seta da direção corrente acende.
 */
function SetaOrdenacao({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      viewBox="0 0 10 14"
      aria-hidden="true"
      className="h-[11px] w-[9px] flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6l3-3 3 3" className={cn(dir === "desc" && "opacity-20", !dir && "opacity-30")} />
      <path d="M2 8l3 3 3-3" className={cn(dir === "asc" && "opacity-20", !dir && "opacity-30")} />
    </svg>
  );
}
