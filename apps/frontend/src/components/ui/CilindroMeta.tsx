"use client";

import { cn } from "@/lib/cn";

/**
 * ─ O CILINDRO DE UMA META, peça COMPARTILHADA do design system ────────────────────────────────
 *
 * ┌─ POR QUE ELE SAIU DA CENTRAL DE VAGAS E VEIO PARA CÁ ───────────────────────────────────────┐
 * │ Ele nasceu como função local em `app/(app)/as/vagas/page.tsx` (OST de 27/08) e agora tem um  │
 * │ SEGUNDO consumidor, o Gerenciador Do Portal, que trocou o texto "7 de 7" por esta barra.     │
 * │ Copiar o desenho seria a última vez que as duas telas concordariam: o primeiro ajuste de     │
 * │ piso, de cor ou de altura entraria em uma e não na outra. Uma peça só, dois consumidores,    │
 * │ que é a mesma régua do `navegacao.ts` e do `admin-menus.ts`.                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.26: A EXTRAÇÃO NÃO PODE MUDAR UM PIXEL DA CENTRAL DE VAGAS, que é código validado. O corpo
 * abaixo é o MESMO da função que saiu de lá, sem uma classe trocada; o que virou prop foi apenas o
 * que já variava por chamada:
 *  - `title`: lá ele dependia da ORIGEM da contagem (derivada, fechamento, ausente), que é
 *    vocabulário de vaga e não tem sentido no portal. A frase continua sendo escrita pela Central
 *    de Vagas, palavra por palavra, e chega aqui pronta.
 *  - `rotuloCheia`: o texto dentro da barra cheia. O padrão é "Meta Atingida", que é exatamente o
 *    que a Central de Vagas desenha hoje, então não passar a prop preserva a tela como ela é.
 *
 * O QUE O DESENHO DIZ, e continua valendo nos dois consumidores:
 *  - O NÚMERO FICA NO FIM DO CILINDRO, na linha do rótulo: empilhar rótulo, barra e número em três
 *    alturas dobraria a altura de toda linha da tabela sem acrescentar leitura (§A.20).
 *  - META ATINGIDA FICA VERDE E DIZ O NOME dentro da barra cheia, que é onde sobra espaço
 *    exatamente quando ela enche.
 *  - META ZERO não desenha barra cheia nem vazia: não é meta cumprida nem meta pendente, e pintar
 *    de verde diria que alguma coisa foi entregue.
 *  - META NULA mostra "não informado" (§A.11), sem cilindro: não há meta a encher.
 */

/** Trilho do cilindro: a mesma hairline tonal que o painel de Alto Volume usa nas barras dele. */
export const TRILHO_CILINDRO = "color-mix(in srgb, var(--text) 9%, transparent)";

export function CilindroMeta({
  rotulo,
  meta,
  feitas,
  title,
  rotuloCheia = "Meta Atingida",
  className,
}: {
  rotulo: string;
  meta: number | null;
  feitas: number;
  /** Frase completa do `title`, escrita por quem chama: o vocabulário é de cada tela. */
  title?: string;
  /** Texto dentro da barra cheia. O padrão é o da Central de Vagas, que não passa a prop. */
  rotuloCheia?: string;
  className?: string;
}) {
  if (meta === null) {
    return (
      <div className={cn("flex items-baseline justify-between gap-1.5", className)}>
        <span className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</span>
        <span className="text-[11px] text-faint">não informado</span>
      </div>
    );
  }

  const cheia = meta > 0 && feitas >= meta;
  const largura = larguraDoCilindro(meta, feitas);
  const cor = cheia ? "var(--ok)" : "var(--accent)";

  return (
    <div title={title} className={className}>
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</span>
        <span
          className="whitespace-nowrap text-[11.5px] font-semibold tabular-nums"
          style={{ color: cheia ? "var(--ok)" : "var(--text)" }}
        >
          {feitas} / {meta}
        </span>
      </div>
      <div
        className="relative mt-0.5 h-[14px] w-full overflow-hidden rounded-full"
        style={{ background: TRILHO_CILINDRO }}
        role="progressbar"
        aria-valuenow={feitas}
        aria-valuemin={0}
        aria-valuemax={meta}
        aria-label={`${rotulo}: ${feitas} de ${meta}`}
      >
        {largura > 0 && (
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${largura}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${cor} 45%, transparent), ${cor})`,
            }}
          />
        )}
        {/* O RÓTULO DE BARRA CHEIA MORA DENTRO DELA, que é justamente quando há 100% da largura
            disponível para ele. Em branco sobre o verde, ele lê nos dois temas sem depender de
            token de texto. `pointer-events-none` para não roubar o `title` da célula. */}
        {cheia && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[9px] font-bold uppercase tracking-wide text-white">
            {rotuloCheia}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A LARGURA DA BARRA, isolada para teste: é a única conta do componente e é onde uma regressão
 * passaria despercebida (o piso de 6%, e o zero que NÃO vira lasca).
 *
 * Piso de 6% para preenchimento não nulo: 1 de 40 desenharia uma lasca invisível, e a barra
 * mentiria dizendo que não entrou ninguém. O mesmo piso das barras de loja do Alto Volume.
 */
export function larguraDoCilindro(meta: number, feitas: number): number {
  const pct = meta > 0 ? Math.min(100, Math.round((feitas / meta) * 100)) : 0;
  return feitas <= 0 ? 0 : Math.max(6, pct);
}

/** O percentual mostrado nas frases de `title` de quem chama. Mesma conta da largura, sem o piso. */
export function percentualDoCilindro(meta: number, feitas: number): number {
  return meta > 0 ? Math.min(100, Math.round((feitas / meta) * 100)) : 0;
}
