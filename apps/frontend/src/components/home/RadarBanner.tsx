"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type SlideTone = "" | "warn" | "peak";

interface Slide {
  icon: IconName;
  tone: SlideTone;
  text: ReactNode;
}

/**
 * Insights MOCK desta fase — a geração real (regras/IA) é da Fase 6 (DESIGN-SYSTEM.md).
 * Reproduz os três insights do protótipo aprovado.
 */
const SLIDES: Slide[] = [
  {
    icon: "alert",
    tone: "warn",
    text: (
      <>
        O cliente <b>Testetestando</b> está com <b>5 vagas</b> de Operador de Teste para iniciar em{" "}
        <b>3 de julho</b> — fiquem atentos, só <b>4</b> estão com o processo pronto.
      </>
    ),
  },
  {
    icon: "layers",
    tone: "",
    text: (
      <>
        Hoje a EA Automatic está com <b>14 clientes</b> em andamento, somando <b>59 admissões</b>{" "}
        ativas na esteira.
      </>
    ),
  },
  {
    icon: "peak",
    tone: "peak",
    text: (
      <>
        Prepare o time: o próximo pico é <b>16/07</b>, com <b>50 pessoas</b> iniciando no mesmo dia.
      </>
    ),
  },
];

const INTERVAL_MS = 5000;

export function RadarBanner() {
  const [cur, setCur] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    clear();
    timer.current = setInterval(() => setCur((c) => (c + 1) % SLIDES.length), INTERVAL_MS);
  }, [clear]);

  useEffect(() => {
    start();
    return clear;
  }, [start, clear]);

  const go = useCallback(
    (i: number) => {
      setCur((i + SLIDES.length) % SLIDES.length);
      start(); // reinicia o relógio ao navegar manualmente
    },
    [start],
  );

  return (
    <GlassCard
      className="banner mb-[26px]"
      onMouseEnter={clear}
      onMouseLeave={start}
    >
      <div className="b-eyebrow">
        <span className="live" />
        Radar da esteira
      </div>

      <div className="slides">
        {SLIDES.map((s, i) => (
          <div key={i} className={cn("slide", i === cur && "on")}>
            <div className={cn("s-ico", s.tone)}>
              <Icon name={s.icon} />
            </div>
            <div className="s-txt">{s.text}</div>
          </div>
        ))}
      </div>

      <div className="b-foot">
        <div className="dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              className={cn("d", i === cur && "on")}
              aria-label={`Insight ${i + 1}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <div className="b-nav">
          <button type="button" aria-label="Anterior" onClick={() => go(cur - 1)}>
            <Icon name="left" />
          </button>
          <button type="button" aria-label="Próximo" onClick={() => go(cur + 1)}>
            <Icon name="right" />
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
