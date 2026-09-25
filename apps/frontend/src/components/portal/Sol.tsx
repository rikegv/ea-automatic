/**
 * SOL, a guia do Portal do Candidato. Arte APROVADA pelo diretor no mockup, transcrita aqui sem
 * alteração de traço: as cinco poses, o traço plano e as cores da Soulan.
 *
 * POR QUE SVG INLINE E NÃO ARQUIVO DE IMAGEM: a tela é do candidato no celular, muitas vezes em 4G.
 * Inline ela não custa requisição, não pisca entre poses (trocar de pose é trocar dois caminhos, não
 * baixar outro arquivo) e escala sem borrar do avatar de 44px em cima do tabuleiro até os 130px da
 * tela de boas-vindas. Um PNG por pose seriam cinco downloads e cinco resoluções erradas.
 *
 * SEM DEPENDÊNCIA E SEM ESTADO: é função pura de `pose` e `tamanho`. Nenhuma biblioteca de ícone,
 * nenhuma animação aqui dentro (quem anima é a trilha, que sabe quando a Sol anda).
 *
 * §A.6: desenho, sem dado nenhum.
 */

export const POSES_SOL = ["acena", "explica", "aponta", "caminha", "comemora"] as const;
export type PoseSol = (typeof POSES_SOL)[number];

/** Cores literais, nunca `var(--...)`: a tela do candidato é clara sempre, não segue o tema do aparelho. */
const PELE = "#f3c9a6";
const CABELO = "#2b3f5c";
const AZUL = "#1593bd";
const VERDE = "#7ba81f";

interface Props {
  pose?: PoseSol;
  /** Largura em px. A altura sai proporcional (1.35), que é a proporção do desenho aprovado. */
  tamanho?: number;
  className?: string;
}

export function Sol({ pose = "explica", tamanho = 120, className }: Props) {
  return (
    <svg
      viewBox="0 0 120 162"
      width={tamanho}
      height={tamanho * 1.35}
      className={className}
      role="img"
      aria-label="Sol, a sua guia nesta trilha"
      style={{ display: "block" }}
    >
      <ellipse cx="60" cy="156" rx="26" ry="5" fill="rgba(13,43,69,.10)" />
      <Bracos pose={pose} />
      <path
        d="M60 74 C40 74 34 90 34 104 L34 126 L86 126 L86 104 C86 90 80 74 60 74 Z"
        fill={AZUL}
      />
      <path d="M60 74 L52 96 L60 104 L68 96 Z" fill="#ffffff" opacity=".92" />
      <path d="M46 76 C52 90 68 90 74 76" stroke={VERDE} strokeWidth="5" fill="none" strokeLinecap="round" />
      <Pernas pose={pose} />
      <path d="M54 60 h12 v14 h-12 z" fill={PELE} />
      <circle cx="60" cy="42" r="22" fill={PELE} />
      <path
        d="M38 42 C38 24 50 16 60 16 C72 16 82 25 82 42 C82 36 76 32 72 33 C66 26 52 26 46 34 C41 33 38 37 38 42 Z"
        fill={CABELO}
      />
      <path d="M38 42 C34 52 36 60 39 63 C36 54 38 47 39 44 Z" fill={CABELO} />
      <path d="M82 42 C86 52 84 60 81 63 C84 54 82 47 81 44 Z" fill={CABELO} />
      <circle cx="80" cy="30" r="5" fill={VERDE} />
      <Olhos pose={pose} />
      <path d="M53 53 q7 6 14 0" stroke="#c2705a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="52" r="3.4" fill="rgba(214,110,90,.22)" />
      <circle cx="74" cy="52" r="3.4" fill="rgba(214,110,90,.22)" />
    </svg>
  );
}

/** Braço: traço de pele com uma mão redonda na ponta. Cada pose é um par de curvas diferente. */
function Braco({ d, mao }: { d: string; mao: [number, number] }) {
  return (
    <>
      <path d={d} stroke={PELE} strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx={mao[0]} cy={mao[1]} r="6.5" fill={PELE} />
    </>
  );
}

function Bracos({ pose }: { pose: PoseSol }) {
  switch (pose) {
    case "acena":
      return <Braco d="M40 88 C30 80 26 66 30 56" mao={[29, 52]} />;
    case "aponta":
      return <Braco d="M80 88 C92 86 98 76 100 66" mao={[101, 62]} />;
    case "caminha":
      return (
        <>
          <Braco d="M80 88 C90 92 94 100 92 108" mao={[92, 111]} />
          <Braco d="M40 88 C32 92 29 99 31 106" mao={[31, 109]} />
        </>
      );
    case "comemora":
      return (
        <>
          <Braco d="M40 88 C28 78 24 62 28 48" mao={[28, 44]} />
          <Braco d="M80 88 C92 78 96 62 92 48" mao={[92, 44]} />
        </>
      );
    default:
      return (
        <>
          <Braco d="M40 88 C32 84 30 74 34 68" mao={[35, 65]} />
          <Braco d="M80 88 C88 84 90 74 86 68" mao={[85, 65]} />
        </>
      );
  }
}

function Pernas({ pose }: { pose: PoseSol }) {
  const andando = pose === "caminha";
  return (
    <>
      <path
        d={andando ? "M52 126 L44 152" : "M53 126 L51 152"}
        stroke={CABELO}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d={andando ? "M68 126 L78 150" : "M67 126 L69 152"}
        stroke={CABELO}
        strokeWidth="10"
        strokeLinecap="round"
      />
    </>
  );
}

/** Só a pose de comemorar fecha os olhos. As demais olham para quem está do outro lado. */
function Olhos({ pose }: { pose: PoseSol }) {
  if (pose === "comemora") {
    return (
      <>
        <path d="M50 44 q4 -4 8 0" stroke="#22304a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M62 44 q4 -4 8 0" stroke="#22304a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <circle cx="53" cy="45" r="2.6" fill="#22304a" />
      <circle cx="67" cy="45" r="2.6" fill="#22304a" />
    </>
  );
}
