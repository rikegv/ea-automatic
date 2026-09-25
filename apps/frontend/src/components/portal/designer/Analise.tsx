"use client";

import type { CSSProperties } from "react";
import { Check, File, FileCheck2, Search, ShieldCheck, Sparkles, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/portal/cn";

/* Animação "viva" da auditoria: ícones em duas órbitas (sentidos opostos), documento com
   faixa de leitura, lupa passeando e partículas subindo. Tudo em CSS (keyframes do preset
   Tailwind), sem biblioteca. Respeita prefers-reduced-motion via `motion-reduce:`. */

interface ItemOrbita { icone: LucideIcon; cor: string; fundo: string }

const ORBITA_EXTERNA: ItemOrbita[] = [
  { icone: Search, cor: "text-portal-primaria", fundo: "bg-white" },
  { icone: File, cor: "text-portal-primaria", fundo: "bg-white" },
  { icone: ShieldCheck, cor: "text-portal-ok-tx", fundo: "bg-portal-ok-bg" },
  { icone: FileCheck2, cor: "text-portal-ok-tx", fundo: "bg-white" },
];
const ORBITA_INTERNA: ItemOrbita[] = [
  { icone: Sparkles, cor: "text-portal-bege-tx", fundo: "bg-portal-bege-tint" },
  { icone: User, cor: "text-portal-agua-tx", fundo: "bg-portal-agua-tint" },
  { icone: Search, cor: "text-portal-primaria", fundo: "bg-portal-primaria-tint" },
];

function Orbita({ itens, raio, duracao, reversa, chip }: { itens: ItemOrbita[]; raio: number; duracao: number; reversa?: boolean; chip: number }) {
  // classes completas (não interpoladas) para o Tailwind gerar os keyframes
  const giro = reversa ? "animate-orbit-rev" : "animate-orbit";
  const contra = reversa ? "animate-orbit" : "animate-orbit-rev";
  return (
    <>
      {itens.map(({ icone: Icone, cor, fundo }, i) => {
        const atraso = `${(-duracao * i) / itens.length}s`;
        const g: CSSProperties = { animationDuration: `${duracao}s`, animationDelay: atraso };
        const c: CSSProperties = { animationDuration: `${duracao}s`, animationDelay: atraso, left: raio - chip / 2, top: -chip / 2, width: chip, height: chip };
        return (
          <div key={i} className={cn("absolute left-1/2 top-1/2 size-0 motion-reduce:!animate-none", giro)} style={g}>
            <div className={cn("absolute motion-reduce:!animate-none", contra)} style={c}>
              <div
                className={cn("flex size-full items-center justify-center rounded-full border border-portal-linha shadow-chip animate-bob motion-reduce:animate-none", fundo)}
                style={{ animationDuration: `${2.2 + i * 0.4}s` }}
              >
                <Icone className={cn("size-1/2", cor)} aria-hidden />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function PalcoAnalise({ concluido, compacto = false }: { concluido: boolean; compacto?: boolean }) {
  const d = compacto
    ? { w: 324, h: 300, r1: 82, r2: 122, dw: 104, dh: 132, chip: 42, lupa: 48 }
    : { w: 500, h: 440, r1: 118, r2: 180, dw: 150, dh: 190, chip: 52, lupa: 64 };

  return (
    <div
      className="relative max-w-full shrink-0 overflow-hidden rounded-card bg-[radial-gradient(circle_at_50%_50%,#F4F8FC_0%,#FFFFFF_70%)]"
      style={{ width: d.w, height: d.h }}
      aria-hidden
    >
      {!concluido ? (
        <div className="absolute inset-0">
          {[0, 1.2, 2.4].map((a) => (
            <div key={a} className="absolute left-1/2 top-1/2 rounded-full border-[1.5px] border-soulan-azul-suave animate-ring motion-reduce:hidden" style={{ width: d.r2 * 2, height: d.r2 * 2, animationDelay: `${a}s` }} />
          ))}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed border-[#D3E2EF]" style={{ width: d.r1 * 2, height: d.r1 * 2 }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E6EEF5]" style={{ width: d.r2 * 2, height: d.r2 * 2 }} />
          {[
            [30, 6, "bg-soulan-verde", 3.2, 0],
            [62, 5, "bg-soulan-azul-claro", 2.8, 0.8],
            [45, 4, "bg-soulan-verde-agua", 3.6, 1.5],
            [70, 6, "bg-soulan-verde", 3.0, 2.1],
            [22, 4, "bg-soulan-azul-claro", 3.4, 1.1],
          ].map(([x, s, c, t, a], i) => (
            <div key={i} className={cn("absolute bottom-[14%] rounded-full animate-rise motion-reduce:hidden", c as string)} style={{ left: `${x}%`, width: s as number, height: s as number, animationDuration: `${t}s`, animationDelay: `${a}s` }} />
          ))}

          <Orbita itens={ORBITA_INTERNA} raio={d.r1} duracao={11} reversa chip={d.chip - 6} />
          <Orbita itens={ORBITA_EXTERNA} raio={d.r2} duracao={16} chip={d.chip} />

          {/* documento sendo lido */}
          <div
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 overflow-hidden rounded-[14px] border border-portal-linha bg-white p-3.5 shadow-doc"
            style={{ width: d.dw, height: d.dh }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex shrink-0 items-center justify-center rounded-lg bg-[#DCE5EE]" style={{ width: d.dw / 3, height: d.dw / 2.6 }}>
                <User className="size-1/2 text-[#9FB1C3]" strokeWidth={1.5} />
              </div>
              <div className="flex grow flex-col gap-[7px]">
                <div className="h-[7px] w-4/5 rounded bg-soulan-azul-suave" />
                <div className="h-[7px] w-3/5 rounded bg-[#E3EAF1]" />
              </div>
            </div>
            {[90, 70, 80, 55, 75].map((w) => (
              <div key={w} className="h-[7px] rounded bg-[linear-gradient(90deg,#E3EAF1_0%,#F4F8FB_50%,#E3EAF1_100%)] bg-[length:160px_100%] animate-shimmer" style={{ width: `${w}%` }} />
            ))}
            <div className="absolute inset-x-0 top-[10%] h-9 bg-gradient-to-b from-soulan-azul-claro/0 via-soulan-azul-claro/30 to-soulan-azul-claro/0 animate-scan motion-reduce:hidden">
              <div className="absolute inset-x-0 bottom-1 h-0.5 bg-soulan-azul-claro shadow-[0_0_12px_#59A4D8]" />
            </div>
          </div>

          {/* lupa */}
          <div className="absolute left-1/2 top-1/2 animate-wander motion-reduce:animate-none" style={{ width: d.lupa, height: d.lupa, margin: `-${d.lupa / 2}px 0 0 -${d.lupa / 2}px` }}>
            <div className="flex size-full items-center justify-center rounded-full border-2 border-portal-primaria bg-white/75 shadow-[0_10px_24px_rgba(26,72,149,0.25)]">
              <Search className="size-1/2 text-portal-primaria" strokeWidth={2.2} />
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#F2F9DC_0%,rgba(242,249,220,0)_70%)]" style={{ width: d.r2 * 2, height: d.r2 * 2 }} />
          <div
            className="relative flex items-center justify-center rounded-full bg-soulan-verde shadow-[0_0_0_12px_rgba(170,209,47,0.22),0_18px_40px_rgba(74,100,0,0.25)] animate-pop"
            style={{ width: d.dw * 0.9, height: d.dw * 0.9 }}
          >
            <Check className="size-1/2 text-portal-ink" strokeWidth={3} />
          </div>
        </div>
      )}
    </div>
  );
}

export function EtapasAnalise({ etapas, atual }: { etapas: readonly string[]; atual: number }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Etapas da análise">
      {etapas.map((rotulo, i) => {
        const feito = i < atual;
        const ativo = i === atual;
        return (
          <li key={rotulo} className="flex min-h-10 items-center gap-3" aria-current={ativo ? "step" : undefined}>
            <div className="flex size-7 shrink-0 items-center justify-center">
              {feito && (
                <div className="flex size-7 items-center justify-center rounded-full bg-soulan-verde animate-pop">
                  <Check className="size-3.5 text-portal-ink" strokeWidth={3} aria-hidden />
                </div>
              )}
              {ativo && <div className="size-[22px] animate-spin rounded-full border-[2.5px] border-portal-primaria-tint border-t-portal-primaria" />}
              {!feito && !ativo && <div className="size-3 rounded-full bg-[#DCE3EA]" />}
            </div>
            <span className={cn("text-sm leading-snug", ativo ? "font-bold text-portal-ink" : feito ? "font-medium text-portal-ink" : "font-medium text-portal-muted")}>{rotulo}</span>
          </li>
        );
      })}
    </ol>
  );
}
