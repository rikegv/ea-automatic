import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/portal/cn";

type Variante = "primaria" | "secundaria" | "fantasma";

const base =
  "inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-btn font-semibold text-base no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-primaria disabled:cursor-not-allowed";
const variantes: Record<Variante, string> = {
  primaria: "bg-portal-primaria text-white border border-portal-primaria shadow-btn hover:bg-portal-primaria-hover hover:text-white",
  secundaria: "bg-white text-portal-primaria border border-soulan-azul-suave hover:bg-portal-primaria-tint",
  fantasma: "bg-transparent text-portal-primaria border border-transparent hover:bg-portal-primaria-tint",
};

interface BotaoBase {
  variante?: Variante;
  icone?: LucideIcon;
  iconeDireita?: boolean;
  largo?: boolean;
  compacto?: boolean;
  children: ReactNode;
}

function Conteudo({ icone: Icone, iconeDireita, children }: Pick<BotaoBase, "icone" | "iconeDireita" | "children">) {
  const i = Icone ? <Icone className="size-5 shrink-0" aria-hidden /> : null;
  return (
    <>
      {!iconeDireita && i}
      {children}
      {iconeDireita && i}
    </>
  );
}

export function BotaoLink({ href, variante = "primaria", largo, compacto, className, ...rest }: BotaoBase & { href: string; className?: string }) {
  return (
    <Link href={href} className={cn(base, variantes[variante], largo ? "w-full" : "px-7", compacto ? "h-11" : "h-[52px]", className)}>
      <Conteudo {...rest} />
    </Link>
  );
}

export function Botao({ variante = "primaria", largo, compacto, className, icone, iconeDireita, children, ...props }: BotaoBase & Omit<ComponentProps<"button">, "children">) {
  return (
    <button type="button" {...props} className={cn(base, variantes[variante], largo ? "w-full" : "px-7", compacto ? "h-11" : "h-[52px]", "disabled:opacity-60", className)}>
      <Conteudo icone={icone} iconeDireita={iconeDireita}>{children}</Conteudo>
    </button>
  );
}

type TomTag = "necessario" | "opcional" | "ok" | "atencao" | "neutro" | "agua";
const tons: Record<TomTag, string> = {
  necessario: "bg-portal-primaria-tint text-portal-primaria",
  opcional: "bg-[#EEF1F4] text-portal-muted",
  neutro: "bg-[#EEF1F4] text-portal-muted",
  ok: "bg-portal-ok-bg text-portal-ok-tx",
  atencao: "bg-portal-at-bg text-portal-at-tx",
  agua: "bg-portal-agua-tint text-portal-agua-tx",
};
export function Tag({ tom = "neutro", children }: { tom?: TomTag; children: ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold", tons[tom])}>{children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex flex-col rounded-card-sm border border-portal-linha bg-white p-5 shadow-card md:rounded-card md:p-10", className)}>{children}</section>;
}

type TomNota = "azul" | "agua" | "bege" | "atencao";
const tonsNota: Record<TomNota, string> = {
  azul: "bg-[#F4F8FC] border-[#DCE7F2] text-portal-texto",
  agua: "bg-portal-agua-tint border-[#C6EAE3] text-portal-agua-tx",
  bege: "bg-portal-bege-tint border-[#F0E2C8] text-portal-bege-tx",
  atencao: "bg-portal-at-bg border-portal-at-ln text-portal-at-tx",
};
export function Nota({ icone: Icone, tom = "azul", children }: { icone: LucideIcon; tom?: TomNota; children: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-btn border px-4 py-3.5", tonsNota[tom])}>
      <Icone className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <p className="m-0 text-[13px] leading-relaxed">{children}</p>
    </div>
  );
}

export function TituloSecao({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="m-0 text-lg font-bold text-portal-ink">{titulo}</h2>
      {subtitulo && <p className="m-0 text-sm leading-normal text-portal-muted">{subtitulo}</p>}
    </div>
  );
}

export function Sobretitulo({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-[0.08em] text-portal-ok-tx md:text-[13px]">{children}</span>;
}

export function BarraProgresso({ entregues, total }: { entregues: number; total: number }) {
  const pct = Math.round((entregues / total) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-[13px]">
        <span className="font-semibold">{entregues} de {total} entregues</span>
        <span className="text-portal-muted">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#E8EEF3]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-soulan-azul-claro to-soulan-verde transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Barra fixa de ações no rodapé do mobile (dentro de um Card: -mx-5 compensa o padding). No desktop vira uma linha comum. */
export function BarraAcoes({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 -mx-5 mt-2 flex flex-col gap-2.5 border-t border-portal-linha bg-white px-4 pb-7 pt-4 shadow-bottom-bar",
        "md:static md:mx-0 md:mt-7 md:flex-row md:items-center md:justify-between md:border-0 md:bg-transparent md:p-0 md:shadow-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
