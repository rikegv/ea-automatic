import type { SVGProps } from "react";

/**
 * Conjunto de ícones do EA AUTOMATIC, portado 1:1 dos protótipos aprovados.
 * Traço currentColor; o tamanho vem do contexto (CSS define width/height do svg).
 */
export type IconName =
  | "home"
  | "plus"
  | "layers"
  | "table"
  | "cog"
  | "clock"
  | "check"
  | "doc"
  | "heart"
  | "pen"
  | "arr"
  | "users"
  | "alert"
  | "peak"
  | "chart"
  | "left"
  | "right"
  | "tag"
  | "eye"
  | "copy"
  | "lock"
  | "x"
  | "filter"
  | "trash"
  | "folder"
  | "download"
  | "link"
  | "logout"
  | "sun"
  | "moon"
  | "refresh"
  | "bulb"
  | "phone"
  | "undo";

const PATHS: Record<IconName, JSX.Element> = {
  home: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-3v-7H8v7H5a2 2 0 0 1-2-2z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  layers: (
    <>
      <path d="M12 2l9 5-9 5-9-5z" />
      <path d="M3 12l9 5 9-5" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L4.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  filter: <path d="M22 4H2l8 9.4V20l4-2v-4.6z" />,
  doc: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  heart: (
    <path d="M19 14c1.5-1.5 3-3.2 3-5.5A3.5 3.5 0 0 0 12 6 3.5 3.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />
  ),
  pen: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  arr: <path d="M5 12h14M13 6l6 6-6 6" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  peak: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M21 7v6h-6" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" />
      <rect x="13" y="7" width="3" height="10" />
    </>
  ),
  left: <path d="M15 18l-6-6 6-6" />,
  right: <path d="M9 18l6-6-6-6" />,
  tag: (
    <>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
    </>
  ),
  /**
   * COPIAR (duas folhas sobrepostas): a ação de CLONAR. Acrescentado para a Central de Vagas, e
   * ACRESCENTAR É TUDO O QUE ELE FAZ: entrar com uma chave nova neste mapa não altera nenhum ícone
   * existente nem quem já os usa.
   */
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  /** CADEADO FECHANDO: a ação de FECHAR VAGA. Mesma natureza aditiva do `copy` acima. */
  lock: (
    <>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  x: <path d="M18 6L6 18M6 6l12 12" />,
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  // Reauditar (OST A / Bloco 5): setas circulares de "analisar de novo".
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  // Lâmpada: as regras de benefício do cliente (o "Principais Informações"). Adição pura ao conjunto,
  // no mesmo traço e no mesmo viewBox dos demais; nenhum ícone existente muda.
  /**
   * TELEFONE, para a ação REGISTRAR CONTATO (correção do diretor, 27/08).
   *
   * A ação usava o LÁPIS, que no resto do sistema significa EDITAR (é o que ele faz no rascunho da
   * vaga, no Gerador De Kit e na barra lateral). Quem via o lápis na linha do candidato entendia
   * "editar candidato", e não "anotar que falei com a pessoa". O telefone diz o que a ação é.
   *
   * ACRÉSCIMO PURO ao catálogo (§A.26): nenhum ícone existente mudou de traçado, de nome ou de uso.
   * O `pen` continua exatamente onde estava em todas as outras telas.
   *
   * O traçado é o mesmo vocabulário dos demais: contorno de 1 traço, sem preenchimento, herdando
   * `currentColor` e a espessura do componente.
   */
  phone: (
    <path d="M15.8 21A13.8 13.8 0 0 1 3 8.2 2.2 2.2 0 0 1 5.2 6h1.9a1.4 1.4 0 0 1 1.4 1.2l.5 2.4a1.4 1.4 0 0 1-.5 1.4l-1 .8a11 11 0 0 0 4.7 4.7l.8-1a1.4 1.4 0 0 1 1.4-.5l2.4.5a1.4 1.4 0 0 1 1.2 1.4v1.9A2.2 2.2 0 0 1 15.8 21z" />
  ),
  /**
   * SETA DE RETORNO, para a ação TRAZER DE VOLTA (bug 2 do diretor).
   *
   * NÃO É O `refresh`, e a diferença é de significado: `refresh` é o círculo fechado de "recarregar",
   * e esta ação não recarrega nada, ela traz uma pessoa de volta para o processo. Também não é a
   * `left`, que é navegação. A seta que volta sobre um arco diz retorno, que é o que a ação faz.
   *
   * ACRÉSCIMO PURO ao catálogo (§A.26): nenhum ícone existente mudou de traçado, de nome ou de uso.
   */
  undo: (
    <>
      <path d="M3 8h10a6 6 0 0 1 0 12H8" />
      <path d="M7 4 3 8l4 4" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3z" />
    </>
  ),
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
