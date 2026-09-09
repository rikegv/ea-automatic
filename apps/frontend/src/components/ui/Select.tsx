"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { calcularPosicaoPopover, type PosicaoPopover } from "@/lib/popover-posicao";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  /** Cor opcional do ponto (status): mantém o seletor com a mesma leitura das pills. */
  color?: string;
  /**
   * TEXTO EXTRA QUE A BUSCA ENCONTRA, sem aparecer na opção.
   *
   * ┌─ O CASO QUE OBRIGOU ESTE CAMPO, e ele é a UF ──────────────────────────────────────────────┐
   * │ O diretor pediu que a UF mostrasse SÓ A SIGLA ("SP"), sem repetir "São Paulo". Trocar o     │
   * │ rótulo pelo nome resolve o que se vê e QUEBRA o que se digita: a busca filtra por `label`,  │
   * │ então com a sigla no rótulo, procurar por "São Paulo" deixaria de achar o estado.           │
   * │                                                                                            │
   * │ Ver uma coisa e procurar por outra é normal em seletor de sigla, e é isso que este campo    │
   * │ resolve: o rótulo fica curto e a busca continua achando pelo nome inteiro.                  │
   * │                                                                                            │
   * │ ELE É OPCIONAL E ADITIVO: nenhum dos seletores que já existem muda de comportamento por     │
   * │ causa desta linha, porque quem não o informa continua sendo procurado só pelo rótulo.       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  busca?: string;
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
  const [pos, setPos] = useState<PosicaoPopover | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const comBusca = searchable ?? (Boolean(onAdd) || options.length > 8);

  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    // O RÓTULO E O TEXTO EXTRA, nesta ordem: quem informa `busca` é achado pelos dois, e quem não
    // informa continua sendo achado só pelo rótulo, exatamente como antes.
    return options.filter((o) => norm(o.label).includes(q) || norm(o.busca ?? "").includes(q));
  }, [options, query]);

  /**
   * Posiciona o popover a partir do botão (position fixed), com a régua de
   * `lib/popover-posicao`: ela decide o lado (para baixo, ou invertido para cima quando embaixo não
   * cabe) e o TETO DE ALTURA, que é o que impede o menu de passar da borda da janela. O mesmo
   * cálculo serve o `MultiSelect`: duas cópias divergiriam no primeiro ajuste.
   */
  const reposicionar = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(calcularPosicaoPopover(r, { largura: window.innerWidth, altura: window.innerHeight }));
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

  /**
   * `top` OU `bottom`, nunca os dois. Abrindo para baixo, o menu é preso pelo TOPO e cresce para
   * baixo; invertido, é preso pelo RODAPÉ e cresce para cima sozinho, sem ninguém precisar medir a
   * altura dele antes de desenhar (que exigiria um segundo passe de render, com o menu piscando na
   * posição errada no primeiro).
   */
  const posicaoVertical = pos ? (pos.paraCima ? { bottom: pos.bottom } : { top: pos.top }) : {};

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
            /*
              FLEX EM COLUNA porque o teto de altura agora é do POPOVER INTEIRO, e não da lista: o
              campo de busca e o botão de adicionar ficam fixos, e é a lista que encolhe e rola por
              dentro quando o espaço aperta. Sem isto, apertar o teto cortaria a busca junto.
            */
            className={cn(
              "glass fixed z-[60] flex flex-col overflow-hidden p-1.5 !bg-[var(--surface-2)]",
              menuFit && "w-max",
            )}
            /*
              `top` OU `bottom`, nunca os dois: a régua devolve um deles conforme o lado escolhido.
              O `maxWidth` substitui o antigo `max-w-[min(92vw,560px)]` do modo `menuFit` porque ele
              é MEDIDO (a borda direita real, descontada a posição do menu) em vez de estimado, e
              deixar os dois brigando faria a classe vencer a conta em uma tela e perder na outra.
            */
            style={
              menuFit
                ? {
                    ...posicaoVertical,
                    left: pos.left,
                    minWidth: pos.largura,
                    maxWidth: Math.min(pos.larguraMax, 560),
                    maxHeight: pos.alturaMax,
                  }
                : {
                    ...posicaoVertical,
                    left: pos.left,
                    width: pos.largura,
                    maxHeight: pos.alturaMax,
                  }
            }
          >
            {comBusca && (
              <div className="flex-none px-1 pb-1.5">
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
            {/* `min-h-0` é o que deixa a lista ENCOLHER dentro do flex; sem ele o filho
                mantém a altura do conteúdo e estoura o teto do popover em silêncio. O `max-h-60`
                fica: em tela com espaço, o menu continua exatamente do tamanho de antes. */}
            <div className="max-h-60 min-h-0 flex-1 overflow-auto">
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
                className="mt-1 flex w-full flex-none items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-50"
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
