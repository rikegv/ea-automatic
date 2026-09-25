import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/portal/cn";

type Anel = "suave" | "verde" | "nenhum";

export function SolAvatar({ tamanho = 56, anel = "suave", fundo = "bg-portal-primaria-tint", className }: { tamanho?: number; anel?: Anel; fundo?: string; className?: string }) {
  const aneis: Record<Anel, string> = {
    suave: "shadow-[0_0_0_3px_#fff,0_0_0_4px_#BFD7EA]",
    verde: "shadow-[0_0_0_5px_#fff,0_0_0_7px_#AAD12F]",
    nenhum: "",
  };
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-full", fundo, aneis[anel], className)} style={{ width: tamanho, height: tamanho }}>
      <Image src="/portal/sol.svg" alt="Sol, assistente de admissão" fill sizes={`${tamanho}px`} className="object-cover object-[center_15%]" priority={tamanho > 100} />
    </div>
  );
}

type TomMensagem = "bege" | "atencao" | "ok" | "azul";
const tons: Record<TomMensagem, string> = {
  bege: "bg-portal-bege-tint border-[#F0E2C8]",
  atencao: "bg-portal-at-bg border-portal-at-ln",
  ok: "bg-portal-ok-bg border-[#DDEFA8]",
  azul: "bg-portal-primaria-tint border-soulan-azul-suave",
};

/** Balão de fala da Sol. */
export function SolMensagem({ children, tom = "bege", tamanhoAvatar = 48 }: { children: ReactNode; tom?: TomMensagem; tamanhoAvatar?: number }) {
  return (
    <div className="flex items-start gap-3.5">
      <SolAvatar tamanho={tamanhoAvatar} className="max-md:!size-10" />
      <div className={cn("flex grow flex-col gap-1 rounded-[4px_16px_16px_16px] border px-[18px] py-3.5", tons[tom])} role="status">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-bold">Sol</span>
          <span className="text-xs text-portal-muted">Assistente de admissão</span>
        </div>
        <p className="m-0 text-[15px] leading-relaxed text-portal-texto">{children}</p>
      </div>
    </div>
  );
}
