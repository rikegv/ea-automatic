"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * COMBOBOX PREMIUM DO A&S: um seletor só, do qual todas as telas de Atração e Seleção puxam.
 *
 * POR QUE UM COMPONENTE NOVO, E NÃO UMA EDIÇÃO DO `Select` DO DS: o `Select` é consumido por 19
 * telas já validadas (Esteira, Gerenciador, Nova Admissão, Administração). Mexer nele para acertar
 * o A&S mudaria o comportamento de tudo isso de uma vez (§A.26). Este arquivo nasce separado, é
 * usado só pelo A&S, e não altera nenhuma linha do `Select` existente.
 *
 * O QUE ELE CORRIGE EM RELAÇÃO AO QUE ESTAVA NA TELA:
 * 1. O gatilho parecia um campo de texto com uma seta escura de sistema, a mesma leitura da caixa
 *    padrão do navegador. Agora é um controle: chevron leve, borda que reage ao mouse, anel de foco
 *    na cor de destaque e valor escolhido em peso maior que o placeholder.
 * 2. Teclado completo. Setas para andar, Home e End para as pontas, Enter para escolher, Esc para
 *    fechar devolvendo o foco ao gatilho, Tab fecha sem escolher.
 * 3. Busca por digitação quando a lista passa de 8 itens, com contagem de resultados.
 * 4. Seleção múltipla no MESMO componente, com chips no gatilho e caixas de marcação na lista.
 * 5. O popover vira para cima quando não cabe embaixo, então a última opção nunca fica fora da tela.
 *
 * §A.11 (sem travessão), §A.24 (title case em título e tag).
 */

export interface ComboOption {
  value: string;
  label: string;
  /** Texto de apoio à direita do rótulo (código do cliente, sigla, unidade). */
  hint?: string;
  /** Ponto colorido, para o seletor ler igual às pills de status. */
  color?: string;
  disabled?: boolean;
}

interface ComboboxBase {
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Liga o campo ao rótulo da tela, para leitor de tela e para o clique no rótulo. */
  id?: string;
  /** Força o campo de busca. Sem isso, ele aparece sozinho acima de 8 opções. */
  searchable?: boolean;
  /** Estado de erro: borda e anel na cor de alerta, mais `aria-invalid`. */
  invalido?: boolean;
  /** Mostra o botão de limpar quando há escolha. */
  limpavel?: boolean;
}

type ComboboxSingle = ComboboxBase & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
};

type ComboboxMulti = ComboboxBase & {
  multiple: true;
  value: string[];
  onChange: (values: string[]) => void;
};

export type ComboboxProps = ComboboxSingle | ComboboxMulti;

/** Normaliza para busca: minúsculas, sem acento. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function Chevron({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(
        "h-4 w-4 flex-none text-faint transition-transform duration-200",
        aberto && "-rotate-180",
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Marca({ tipo, on }: { tipo: "check" | "box"; on: boolean }) {
  if (tipo === "box") {
    return (
      <span
        className={cn(
          "grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] border transition",
          on
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[var(--border-strong)]",
        )}
      >
        {on && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
    );
  }
  return on ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-auto h-4 w-4 flex-none text-accent"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : null;
}

export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder = "Selecionar",
    disabled = false,
    className,
    ariaLabel,
    id,
    searchable,
    invalido = false,
    limpavel = false,
  } = props;
  const multiple = props.multiple === true;
  const selecionados = useMemo<string[]>(
    () => (props.multiple === true ? props.value : props.value ? [props.value] : []),
    [props.multiple, props.value],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const uid = useId().replace(/[:]/g, "");
  const listaId = `${uid}-lista`;
  const comBusca = searchable ?? options.length > 8;
  const selSet = useMemo(() => new Set(selecionados), [selecionados]);

  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(`${o.label} ${o.hint ?? ""}`).includes(q));
  }, [options, query]);

  const habilitadas = useMemo(
    () => filtradas.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled),
    [filtradas],
  );

  // ---- posicionamento (portal, position fixed, vira para cima quando não cabe) ----
  const reposicionar = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const folga = 12;
    const abaixo = window.innerHeight - r.bottom - folga;
    const acima = r.top - folga;
    const paraCima = abaixo < 240 && acima > abaixo;
    setPos({
      left: r.left,
      width: r.width,
      ...(paraCima
        ? { bottom: window.innerHeight - r.top + 6, maxHeight: Math.max(180, acima) }
        : { top: r.bottom + 6, maxHeight: Math.max(180, abaixo) }),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposicionar();
  }, [open, reposicionar]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onReflow() {
      reposicionar();
    }
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, reposicionar]);

  // Ao abrir: foco na busca e cursor na opção já escolhida.
  useEffect(() => {
    if (!open) return;
    const alvo = filtradas.findIndex((o) => selSet.has(o.value) && !o.disabled);
    setAtivo(alvo >= 0 ? alvo : (habilitadas[0]?.i ?? 0));
    if (comBusca) window.setTimeout(() => buscaRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Mantém a opção do cursor visível durante a navegação por teclado.
  useEffect(() => {
    if (!open) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${ativo}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [ativo, open]);

  function abrir() {
    if (disabled) return;
    setQuery("");
    setOpen((v) => !v);
  }

  function fechar(devolverFoco = true) {
    setOpen(false);
    if (devolverFoco) triggerRef.current?.focus();
  }

  function escolher(opt: ComboOption) {
    if (opt.disabled) return;
    if (props.multiple === true) {
      const atual = props.value;
      props.onChange(
        atual.includes(opt.value) ? atual.filter((v) => v !== opt.value) : [...atual, opt.value],
      );
      return;
    }
    props.onChange(opt.value);
    fechar();
  }

  function limpar() {
    if (props.multiple === true) props.onChange([]);
    else props.onChange("");
  }

  function andar(passo: number) {
    if (habilitadas.length === 0) return;
    const posAtual = habilitadas.findIndex(({ i }) => i === ativo);
    const proximo = habilitadas[
      Math.min(Math.max((posAtual < 0 ? 0 : posAtual) + passo, 0), habilitadas.length - 1)
    ];
    if (proximo) setAtivo(proximo.i);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setQuery("");
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        andar(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        andar(-1);
        break;
      case "Home":
        e.preventDefault();
        if (habilitadas[0]) setAtivo(habilitadas[0].i);
        break;
      case "End":
        e.preventDefault();
        if (habilitadas.length) setAtivo(habilitadas[habilitadas.length - 1].i);
        break;
      case "Enter": {
        e.preventDefault();
        e.stopPropagation();
        const opt = filtradas[ativo];
        if (opt) escolher(opt);
        break;
      }
      case "Escape":
        /*
         * O Escape PARA AQUI (pego na prova visual). Sem o stopPropagation, o mesmo Escape que
         * fecha a lista subia até o modal da trilha e abria "Descartar Esta Vaga?": quem só queria
         * desistir da lista era perguntado se queria jogar fora a vaga inteira.
         */
        e.preventDefault();
        e.stopPropagation();
        fechar();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const unico = !multiple ? options.find((o) => o.value === selecionados[0]) : undefined;
  const vazio = selecionados.length === 0;
  const temLimpar = limpavel && !vazio && !disabled;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listaId : undefined}
        aria-activedescendant={open && filtradas[ativo] ? `${uid}-op-${ativo}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalido || undefined}
        onClick={abrir}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-[14px] transition",
          "bg-[var(--input-bg)] text-[var(--text)]",
          invalido ? "border-[var(--danger)]" : "border-[var(--border)]",
          !disabled && !invalido && "hover:border-[var(--border-strong)]",
          !disabled && "cursor-pointer",
          open &&
            !invalido &&
            "border-[var(--accent)] bg-[var(--input-bg-focus)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
          open &&
            invalido &&
            "shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_18%,transparent)]",
          !open &&
            "focus-visible:border-[var(--accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
          "outline-none",
          disabled && "cursor-default opacity-55",
        )}
      >
        {multiple && !vazio ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {selecionados.slice(0, 3).map((v) => {
              const o = options.find((x) => x.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex max-w-[180px] items-center rounded-lg bg-[var(--surface-2)] px-2 py-0.5 text-[12.5px]"
                >
                  <span className="truncate">{o?.label ?? v}</span>
                </span>
              );
            })}
            {selecionados.length > 3 && (
              <span className="text-[12.5px] text-dim">
                mais {selecionados.length - 3}
              </span>
            )}
          </span>
        ) : (
          <span
            className={cn(
              "flex min-w-0 items-center gap-2",
              vazio ? "text-faint" : "font-medium text-[var(--text)]",
            )}
          >
            {unico?.color && (
              <span
                className="h-2 w-2 flex-none rounded-full"
                style={{ background: unico.color }}
              />
            )}
            <span className="truncate">{unico?.label ?? placeholder}</span>
            {unico?.hint && <span className="flex-none text-[12.5px] text-faint">{unico.hint}</span>}
          </span>
        )}

        <span className="flex flex-none items-center gap-1.5">
          {temLimpar && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar seleção"
              title="Limpar seleção"
              className="grid h-5 w-5 place-items-center rounded-md text-faint transition hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
              onClick={(e) => {
                e.stopPropagation();
                limpar();
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </span>
          )}
          <Chevron aberto={open} />
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="glass fixed z-[70] flex flex-col overflow-hidden p-1.5 !bg-[var(--surface-2)] shadow-[0_18px_50px_rgba(8,30,50,0.22)]"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            onKeyDown={onKeyDown}
          >
            {comBusca && (
              <div className="px-1 pb-1.5">
                <input
                  ref={buscaRef}
                  className="ds-input !py-2 text-[13px]"
                  placeholder="Digite para filtrar"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setAtivo(0);
                  }}
                  aria-label="Filtrar opções"
                />
              </div>
            )}

            <div ref={listaRef} id={listaId} role="listbox" aria-multiselectable={multiple} className="min-h-0 flex-1 overflow-auto">
              {filtradas.length === 0 ? (
                <div className="px-3 py-3 text-[13px] text-faint">
                  Nenhum resultado para essa busca.
                </div>
              ) : (
                filtradas.map((o, i) => {
                  const on = selSet.has(o.value);
                  const cursor = i === ativo;
                  return (
                    <div
                      key={o.value}
                      id={`${uid}-op-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={on}
                      aria-disabled={o.disabled || undefined}
                      onMouseEnter={() => !o.disabled && setAtivo(i)}
                      onClick={() => escolher(o)}
                      /*
                       * O REALCE DO CURSOR É TINTA DE DESTAQUE, e não `--surface` (defeito pego na
                       * prova visual). No tema claro o `--surface` é branco a 74% sobre um popover
                       * já branco: a linha do teclado ficava invisível, e quem navegava por seta
                       * não enxergava onde estava. A tinta é rgba literal do azul do sistema, e não
                       * `color-mix` com a variável: dentro do popover em vidro o `color-mix`
                       * resolveu para transparente no tema escuro, e o realce sumia de novo. A
                       * barra à esquerda entra porque, no tema escuro, só a tinta ainda ficava
                       * discreta demais sobre o painel escuro.
                       */
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] transition",
                        on && "font-semibold",
                        o.disabled && "cursor-default opacity-45",
                      )}
                      style={
                        cursor && !o.disabled
                          ? {
                              background: "rgba(34, 176, 219, 0.22)",
                              boxShadow: "inset 3px 0 0 var(--accent)",
                            }
                          : undefined
                      }
                    >
                      {multiple && <Marca tipo="box" on={on} />}
                      {o.color && (
                        <span
                          className="h-2 w-2 flex-none rounded-full"
                          style={{ background: o.color }}
                        />
                      )}
                      <span className="truncate">{o.label}</span>
                      {o.hint && (
                        <span className="ml-auto flex-none pl-2 text-[12px] text-faint">
                          {o.hint}
                        </span>
                      )}
                      {!multiple && <Marca tipo="check" on={on} />}
                    </div>
                  );
                })
              )}
            </div>

            {(comBusca || multiple) && (
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-2.5 pb-0.5 pt-1.5 text-[11.5px] text-faint">
                <span>
                  {multiple
                    ? `${selecionados.length} de ${options.length} selecionados`
                    : `${filtradas.length} de ${options.length} opções`}
                </span>
                {multiple && selecionados.length > 0 && (
                  <button
                    type="button"
                    className="rounded-md px-1.5 py-0.5 text-accent transition hover:bg-[var(--surface)]"
                    onClick={limpar}
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
