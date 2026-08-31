"use client";

/**
 * O LOGO DO SOU, ESCOLHIDO PELO ACESSO DA PESSOA (decisão do diretor, troca de identidade).
 *
 * ┌─ A RÉGUA, e a ORDEM DELA É A REGRA ─────────────────────────────────────────────────────────┐
 * │   isSuperAdmin        -> SOUOperações                                                      │
 * │   áreas [ADM, AS]     -> SOU Talent | SOU Adm  (os dois, com barra entre eles)              │
 * │   áreas [AS]          -> SOU Talent                                                         │
 * │   áreas [ADM]         -> SOU Adm                                                            │
 * │   sem área            -> SOUOperações  (padrão: nunca deixa a tela sem marca)              │
 * │                                                                                             │
 * │ O SUPER ADMIN É TESTADO PRIMEIRO, e isso não é preferência de ordem: o `/auth/me` devolve   │
 * │ `areas: [ADM, AS]` CHUMBADO para ele, porque ele está acima da segmentação. Testar as áreas │
 * │ antes o jogaria no lockup duplo, que é justamente o que a régua do diretor não quer.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DE ONDE VÊM OS DADOS: `areas` e `isSuperAdmin` do `auth-context`, que já existiam. O `areas` já
 * era descrito no código como "INFORMATIVO (a tela exibe)", e este é exatamente o uso previsto.
 * Nada de autorização passa por aqui: trocar o logo não concede nem tira acesso nenhum.
 *
 * ┌─ POR QUE O ARQUIVO É EXIBIDO INTEIRO, e não recortado ──────────────────────────────────────┐
 * │ O `LogoEA` que este componente substitui recortava um PNG único por CSS, com percentuais    │
 * │ medidos à mão daquele arquivo (`backgroundPosition: "-8px -20px"` e afins). Isso amarrava o │
 * │ visual a UM arquivo de UMA proporção: qualquer logo novo sairia cortado errado. Aqui a arte │
 * │ é exibida inteira, com `object-contain`, e o componente aceita qualquer proporção.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A NÉVOA CONTINUA, mas ela é CLARA e ACOMPANHA O TEMA (ajuste do diretor). A leitura anterior de
 * que "os logos são arte clara, desenhada para fundo escuro" vale só para o monograma 3D: o
 * logotipo abaixo dele traz "Operações"/"Talent"/"Adm" em CINZA CHUMBO, que é justamente o que
 * sumia sobre a névoa escura. A régua e os valores estão em `.logo-sou-mist` (globals.css).
 */

import Image from "next/image";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";

type Marca = "operacoes" | "adm" | "talent";

const ARQUIVO: Record<Marca, string> = {
  operacoes: "/sou-operacoes.png",
  adm: "/sou-adm.png",
  talent: "/sou-talent.png",
};

const ROTULO: Record<Marca, string> = {
  operacoes: "SOUOperações",
  adm: "SOU Adm",
  talent: "SOU Talent",
};

/**
 * QUAIS MARCAS ESTA PESSOA VÊ. Função pura e exportada para o teste poder afirmar a régua sem
 * montar componente, que é como as demais réguas do sistema são testadas.
 */
export function marcasDoAcesso(isSuperAdmin: boolean, areas: readonly string[]): Marca[] {
  if (isSuperAdmin) return ["operacoes"];
  const temAs = areas.includes("AS");
  const temAdm = areas.includes("ADM");
  if (temAs && temAdm) return ["talent", "adm"];
  if (temAs) return ["talent"];
  if (temAdm) return ["adm"];
  return ["operacoes"];
}

/** Alturas por variante. O `symbol` é a barra recolhida, onde só cabe o símbolo. */
const ALTURA = { full: 54, symbol: 32 } as const;

export function LogoSou({
  variant,
  className,
}: {
  variant: "full" | "symbol";
  className?: string;
}) {
  const { isSuperAdmin, areas } = useAuth();
  const marcas = marcasDoAcesso(isSuperAdmin, areas);
  const h = ALTURA[variant];

  /*
   * A BARRA RECOLHIDA MOSTRA O SÍMBOLO, e nunca o lockup duplo: em 52px de largura, dois logos com
   * palavra ficariam ilegíveis. O símbolo é neutro e serve a qualquer acesso, então recolher não
   * precisa escolher marca.
   */
  if (variant === "symbol") {
    return (
      <div
        role="img"
        aria-label={marcas.map((m) => ROTULO[m]).join(" e ")}
        className={cn("relative flex flex-none items-center justify-center", className)}
        style={{ width: 52, height: 50 }}
      >
        {/* NÉVOA PRÓPRIA do símbolo (`-simbolo`), e não a do lockup: o monograma é arte clara pura
            (branco com contorno azul), sem o logotipo em chumbo que faz o lockup pedir fundo claro.
            A régua de cada uma está em globals.css. */}
        <span aria-hidden className="logo-sou-mist-simbolo pointer-events-none absolute -inset-x-1 -inset-y-1" />
        <Image
          src="/sou-simbolo.png"
          alt=""
          width={120}
          height={112}
          className="relative w-auto object-contain"
          style={{ height: h }}
          priority
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={marcas.map((m) => ROTULO[m]).join(" e ")}
      className={cn("relative flex min-w-0 items-center justify-center gap-1.5", className)}
      style={{ minHeight: h + 22 }}
    >
      {/* A NÉVOA TRANSBORDA a caixa do logo (`-inset-*`): ela precisa terminar em transparente FORA
          da arte, senão a borda dela cruzaria o logo e viraria a placa dura que foi rejeitada. */}
      <span aria-hidden className="logo-sou-mist pointer-events-none absolute -inset-x-1 -inset-y-1" />
      {marcas.map((m, i) => (
        <span key={m} className="relative flex items-center gap-2">
          {/* A BARRA DIVISÓRIA só existe no lockup duplo, e é desenhada aqui, não no arquivo:
              assim os dois logos continuam sendo arquivos independentes, e trocar um não obriga a
              regerar o outro. */}
          {i > 0 && (
            <span
              aria-hidden
              // ESCURA, e não `var(--text)`: a barra fica SEMPRE sobre a névoa, que agora é CLARA
              // nos dois temas. Uma cor derivada do texto sumiria no escuro (claro sobre claro), e
              // a branca de antes sumiria nos dois. A régua é o fundo em que ela vive, não o tema.
              className="h-9 w-px flex-none rounded-full bg-[rgba(13,43,69,0.3)]"
            />
          )}
          <Image
            src={ARQUIVO[m]}
            alt=""
            width={320}
            height={180}
            // `max-w-full` + object-contain: na barra estreita (ou no lockup duplo) o logo
            // ENCOLHE proporcionalmente em vez de vazar, e nunca distorce.
            className="max-w-full w-auto object-contain"
            // Duas marcas dividem o mesmo espaço, então cada uma vem menor. Sem isso, o lockup
            // duplo empurraria a largura da barra.
            style={{ height: marcas.length > 1 ? h - 8 : h }}
            priority
          />
        </span>
      ))}
    </div>
  );
}
