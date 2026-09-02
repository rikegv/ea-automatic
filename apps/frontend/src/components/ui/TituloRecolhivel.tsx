"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * TÍTULO QUE RECOLHE a seção abaixo dele. É o MESMO gesto da ficha do cliente
 * (`admin/clientes`, o `FragmentRow`): a setinha `›` que gira 90 graus ao abrir, `aria-expanded`
 * para o leitor de tela, e o conteúdo aparecendo e sumindo sem sair do lugar. Aqui ela vive no
 * título da seção em vez da primeira célula da linha, porque no Alto Volume o que cansa de rolar é
 * a TABELA inteira, não uma linha dela.
 *
 * POR QUE UM COMPONENTE, e não a marcação repetida quatro vezes: quatro cópias divergem no primeiro
 * ajuste, e aí o mesmo gesto passa a se comportar diferente em cada seção da mesma tela.
 *
 * O BOTÃO É SÓ O TÍTULO, de propósito. A linha do título carrega outros controles ("não usar
 * grupos", "usar grupos de entrada", "Adicionar ao grupo"), e uma área clicável cobrindo a linha
 * inteira faria cada um desses cliques recolher a seção junto.
 *
 * §A.11: sem travessão. §A.24: o rótulo é título, então vem em Title Case de quem o usa.
 */
export function TituloRecolhivel({
  aberto,
  onToggle,
  children,
  className,
  rotuloAcessivel,
}: {
  aberto: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  /** O que o leitor de tela anuncia. Sem ele, sobra só a setinha. */
  rotuloAcessivel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={aberto}
      aria-label={aberto ? `Recolher ${rotuloAcessivel}` : `Expandir ${rotuloAcessivel}`}
      title={aberto ? "Clique para recolher" : "Clique para expandir"}
      className={cn(
        "inline-flex items-center gap-1.5 font-[inherit] text-[inherit] uppercase tracking-[inherit] transition hover:text-text",
        className,
      )}
    >
      <span className={`inline-block leading-none transition-transform ${aberto ? "rotate-90" : ""}`}>
        ›
      </span>
      {children}
    </button>
  );
}
