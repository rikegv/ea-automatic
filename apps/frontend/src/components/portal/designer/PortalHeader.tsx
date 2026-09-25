import Image from "next/image";
import type { Candidato } from "@/lib/portal/types";
import { BotaoFalarComRh } from "@/components/portal/Identificacao";

// O CONTATO DO RH REUSA O COMPONENTE VALIDADO DO MOTOR (`BotaoFalarComRh`), nunca uma segunda
// implementacao: o motor le `NEXT_PUBLIC_WHATSAPP_RH`, monta o texto PII-free e usa
// `referrerPolicy="no-referrer"` (veto V5/A.6). O botao do prototipo apontava para outra variavel
// de ambiente e outro texto; onde a pele diverge do motor, o motor vence.

function Titulo() {
  return (
    <div className="flex flex-col items-center gap-[5px] md:gap-[7px]">
      <span className="hidden pl-[0.34em] text-[10px] font-semibold uppercase tracking-[0.34em] text-portal-muted md:block">
        Soulan · Admissão
      </span>
      {/* §A.24: titulo em Title Case. */}
      <span className="whitespace-nowrap text-[15px] font-bold leading-none tracking-[-0.015em] text-portal-ink md:text-[23px]">
        Portal Do Candidato
      </span>
      <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-portal-primaria to-soulan-verde md:w-10" aria-hidden />
    </div>
  );
}

/** Cabeçalho do portal. Sem `candidato` = tela pública (acesso). */
export function PortalHeader({ candidato }: { candidato?: Candidato }) {
  return (
    <header className="grid h-[68px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-portal-linha bg-white px-4 md:h-[88px] md:grid-cols-3 md:px-14">
      <div className="flex items-center">
        {/* §A.24/§A.6: o logo novo tem o "SOULAN" em LETRAS BRANCAS e a barra é branca, entao o
            branco sumiria. A pilula escura (`soulan-azul-escuro`) atras do logo e o que garante a
            legibilidade; o drop-shadow suave so acrescenta profundidade. Asset publico, sem PII. */}
        <span className="inline-flex items-center rounded-xl bg-soulan-azul-escuro px-2.5 py-1.5 shadow-[0_2px_8px_rgba(0,36,67,0.25)] md:px-3.5 md:py-2">
          <Image
            src="/portal/logo-soulan-novo.webp"
            alt="Soulan Recursos Humanos"
            width={2000}
            height={490}
            className="h-6 w-auto drop-shadow-sm md:h-10"
            priority
          />
        </span>
      </div>
      <Titulo />
      <div className="flex items-center justify-end gap-4">
        <BotaoFalarComRh variante="compacto" />
        {candidato && (
          <>
            <div className="hidden h-7 w-px bg-portal-linha lg:block" />
            <div className="hidden items-center gap-2.5 lg:flex">
              {/* V5-safe: inicial derivada do PRIMEIRO nome, uma letra so. Nunca nome completo. */}
              <div className="flex size-10 items-center justify-center rounded-full bg-portal-primaria-tint text-sm font-bold uppercase text-portal-primaria">
                {candidato.primeiroNome.charAt(0)}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{candidato.primeiroNome}</span>
                <span className="truncate text-xs text-portal-muted">
                  {candidato.cargo} · {candidato.cliente}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export function PortalFooter() {
  return (
    <footer className="mt-auto flex flex-wrap justify-center gap-2 px-4 pb-7 pt-5 text-[11px] text-portal-muted md:px-14 md:py-6">
      <span>&copy; {new Date().getFullYear()} SOUOperações · Grupo Soulan</span>
    </footer>
  );
}
