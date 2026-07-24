import { cn } from "@/lib/cn";

/**
 * Logo oficial do EA no topo da sidebar (OST logo sidebar). Reusa o MESMO arquivo da tela de login
 * (public/logo-ea.png, 1024x1024, fundo transparente); nenhum asset novo é gerado. O recorte é por
 * CSS (background-size/position), medido do próprio arquivo:
 *  - símbolo (fita EA): x[19.7%-84.2%] y[22.9%-63.1%];
 *  - lockup completo (símbolo + "EA AUTOMATIC"): até y~73.9%.
 *
 * Contraste do logo branco: NÃO por placa sólida (rejeitada), e sim por um fundo NÉVOA, um halo
 * cinza difuso e esfumaçado atrás do logo (`.logo-ea-mist`, tema-aware, ver globals.css), com
 * concentração mais escura no centro e bordas que se dissolvem no menu (sem retângulo/borda dura).
 *
 * `variant="full"`   → menu expandido: símbolo + texto.
 * `variant="symbol"` → menu recolhido: só o símbolo, enquadrado e centralizado no espaço estreito.
 */
const SRC = "/logo-ea.png";

// Enquadramentos calculados do bbox medido no arquivo (proporção nativa preservada; sem distorção).
// `wrap` é a área da névoa (um pouco maior que o logo); `logo` é o recorte que aparece por cima.
const FRAME = {
  full: {
    wrap: { width: 148, height: 104 },
    logo: { width: 112, height: 84, backgroundSize: "132px", backgroundPosition: "-8px -20px" },
  },
  symbol: {
    wrap: { width: 52, height: 48 },
    logo: { width: 48, height: 30, backgroundSize: "62px", backgroundPosition: "-8px -13px" },
  },
} as const;

export function LogoEA({
  variant,
  className,
}: {
  variant: "full" | "symbol";
  className?: string;
}) {
  const f = FRAME[variant];
  return (
    <div
      role="img"
      aria-label="EA Automatic"
      className={cn("relative flex flex-none items-center justify-center", className)}
      style={f.wrap}
    >
      <span aria-hidden className="logo-ea-mist pointer-events-none absolute inset-0" />
      <span
        aria-hidden
        className="relative bg-no-repeat"
        style={{ backgroundImage: `url(${SRC})`, ...f.logo }}
      />
    </div>
  );
}
