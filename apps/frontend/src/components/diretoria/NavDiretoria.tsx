"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * CONTROLE GERENCIAL: o alternador entre as visões do painel.
 *
 * O Controle Gerencial é a casa dos dashboards (DESIGN-SYSTEM.md), e passou a ter mais de uma visão:
 * o PAINEL (KPIs, seis tabelas, dois gráficos) e o ALTO VOLUME (preenchimento por cargo, baldes e
 * termômetro do projeto). Cada visão é uma ROTA, e não um estado guardado: o painel de hoje continua
 * sendo a tela validada que sempre foi, sem ganhar modos por dentro, e a visão nova é página filha.
 * Quem diz qual pílula está acesa é `usePathname`, então botão e endereço nunca discordam.
 *
 * ALTURA: a cápsula fecha em 40px CRAVADOS, a mesma altura do ícone de filtro que já dita a faixa do
 * título. É o que permite o alternador viver na faixa que já existe sem roubar um pixel das faixas de
 * KPIs, tabelas e gráficos, que dividem por proporção o que sobra da altura travada.
 *
 * §A.24: rótulo de pílula é etiqueta, title case. §A.11: sem travessão.
 */

const VISOES: { href: string; rotulo: string; icone: IconName; descricao: string }[] = [
  {
    href: "/diretoria",
    rotulo: "Painel",
    icone: "table",
    descricao: "Indicadores, segmentações e gráficos de todas as admissões",
  },
  {
    href: "/diretoria/alto-volume",
    rotulo: "Alto Volume",
    icone: "chart",
    descricao: "Como o projeto sazonal está indo: preenchimento por cargo, situação e prazo",
  },
];

export function NavDiretoria() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Visões do Controle Gerencial"
      className="inline-flex h-10 items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-1.5 backdrop-blur-[18px]"
    >
      {VISOES.map((v) => {
        // Igualdade exata, não prefixo: `/diretoria` é raiz de `/diretoria/alto-volume`, e o prefixo
        // acenderia as duas pílulas ao mesmo tempo na visão do Alto Volume.
        const ativa = pathname === v.href;
        return (
          <Link
            key={v.href}
            href={v.href}
            title={v.descricao}
            aria-current={ativa ? "page" : undefined}
            style={ativa ? { background: "var(--btn-grad)" } : undefined}
            className={cn(
              "inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-xl px-3 font-display text-[13px] font-bold transition",
              ativa
                ? "text-white shadow-[0_8px_22px_rgba(34,176,219,0.28)]"
                : "text-dim hover:bg-[var(--surface-2)] hover:text-accent",
            )}
          >
            <Icon name={v.icone} className="h-4 w-4" />
            {v.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
