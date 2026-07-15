import type { SVGProps } from "react";

/**
 * Logo do Microsoft Excel (documento com o tile verde e o "X" branco) em SVG inline, sem dependência
 * de URL externa, no mesmo padrão premium do `GoogleDriveLogo` (o sistema roda on-prem / por túnel e
 * imagens externas podem ser bloqueadas). O tamanho vem do `className`/props (default ~18px). Usado no
 * botão "Gerar Relatório Clínica" da aba Exame (Bloco E), que exporta o CSV para a clínica.
 */
export function ExcelLogo({ className = "h-[18px] w-[18px]", ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* folha */}
      <path
        d="M13.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z"
        fill="#ffffff"
        stroke="#c7d0da"
        strokeWidth="0.9"
      />
      {/* dobra */}
      <path d="M13.5 2v5a1.5 1.5 0 0 0 1.5 1.5h5z" fill="#e7edf3" />
      {/* tile verde do Excel */}
      <rect x="6.6" y="11" width="10.8" height="8.2" rx="1.6" fill="#1d7a45" />
      {/* X branco */}
      <path
        d="M9 13.1l6 4M15 13.1l-6 4"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
