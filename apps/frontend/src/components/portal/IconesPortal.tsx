/**
 * Os ícones da trilha do candidato, em vetor, no traço do mockup aprovado.
 *
 * POR QUE NÃO EMOJI, e isto foi MEDIDO e não suposto: a prova visual do mockup saiu com caixa vazia
 * no lugar de todo emoji, porque a máquina que renderiza não tem fonte de emoji instalada. O
 * candidato pode estar num aparelho que tenha, mas o desenho do emoji muda de sistema para sistema
 * e a tela deixa de ser a mesma tela. Vetor nosso é igual em todo lugar e segue a cor que recebe.
 *
 * Todos aceitam `cor` e `tamanho`, e nenhum guarda estado. §A.6: desenho, sem dado nenhum.
 */

interface Props {
  cor?: string;
  tamanho?: number;
  className?: string;
}

function Svg({ cor, tamanho, className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho ?? 16}
      height={tamanho ?? 16}
      className={className}
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
      stroke={cor ?? "#1593bd"}
      fill="none"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconeDocumento(p: Props) {
  return (
    <Svg {...p}>
      <path d="M6 2h7l5 5v15H6z" />
      <path d="M13 2v5h5" />
    </Svg>
  );
}

export function IconeCadeado(p: Props) {
  return (
    <Svg {...p}>
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconeDica(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1-1 1.7l-.1.5h-5l-.1-.5c-.1-.7-.4-1.2-1-1.7A6 6 0 0 1 12 3Z" />
      <path d="M9.8 19h4.4M10.5 21.5h3" />
    </Svg>
  );
}

export function IconeCamera(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
      <circle cx="12" cy="12.5" r="3.6" />
    </Svg>
  );
}

export function IconeAlerta(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 3.5 22 20H2Z" />
      <path d="M12 9.5v5" />
      <circle cx="12" cy="17.2" r="1.1" fill={p.cor ?? "#c98a12"} stroke="none" />
    </Svg>
  );
}

export function IconeCheck(p: Props) {
  return (
    <Svg {...p} cor={p.cor ?? "#2e9e63"}>
      <path d="M4 12.5 9.5 18 20 6.5" strokeWidth={2.4} />
    </Svg>
  );
}

export function IconePessoa(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Svg>
  );
}

/**
 * WHATSAPP, no MESMO traco vetorial dos outros (balao + fone), e NAO o emoji nem o logo oficial.
 *
 * POR QUE NAO EMOJI: esta medido no topo deste arquivo, a maquina da prova visual nao tem fonte de
 * emoji e o glifo sai como caixa vazia. Por que nao o logo chapado da marca: o resto da tela e
 * traco de 1.8 e o logo entraria como corpo estranho, alem de nao seguir a `cor` que recebe.
 */
export function IconeWhatsApp(p: Props) {
  return (
    <Svg {...p}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path d="M9.4 9.6c-.2 1.4.4 2.8 1.4 3.8 1 1 2.4 1.6 3.8 1.4l.4-1.6-1.9-.6-.7.7a4.2 4.2 0 0 1-1.5-1.5l.7-.7-.6-1.9z" />
    </Svg>
  );
}

export function IconeLink(p: Props) {
  return (
    <Svg {...p}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1.6 1.6" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1.6-1.6" />
    </Svg>
  );
}

/**
 * A SETA PARA TRÁS, do botão "Voltar para o documento anterior". Vetor pelo motivo de sempre (o
 * topo deste arquivo): a máquina da prova visual não tem fonte de emoji, e um "←" de texto mudaria
 * de desenho e de peso conforme a fonte do aparelho.
 */
export function IconeSeta(p: Props) {
  return (
    <Svg {...p}>
      <path d="M14.5 5 7.5 12l7 7" strokeWidth={2.2} />
    </Svg>
  );
}

/**
 * A BANDEJA DE ENVIO, da área de arrastar do PC. Ela só existe a partir de 1024px, que é onde
 * arrastar arquivo é gesto real: no celular não há de onde arrastar, e a área nem aparece.
 */
export function IconeUpload(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 16V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" />
    </Svg>
  );
}
