import { cn } from "@/lib/cn";

/**
 * SPINNER do design system: círculo girando que HERDA A COR DO TEXTO.
 *
 * Por que ele existe como componente: o mesmo círculo
 * (`animate-spin rounded-full border-2 border-current border-t-transparent`) estava reescrito à mão
 * em várias telas, cada uma com a sua medida. Espera é o estado mais frequente da interface e não
 * pode depender de quem lembra a classe certa, então o padrão passa a morar aqui, com as telas novas
 * puxando daqui em vez de copiar. As telas antigas NÃO foram tocadas nesta entrega (§A.14/§A.26):
 * elas já estão validadas, e converter cada uma é frente própria.
 *
 * Acessibilidade: o círculo é `aria-hidden`, porque ele não diz nada a quem não o vê. Quem anuncia a
 * espera é o BLOCO que o contém, com `role="status"` e o texto do que está acontecendo.
 */
export function Spinner({
  tamanho = "md",
  className,
}: {
  /** sm para dentro de botão e linha de texto, md para bloco, lg para espera que ocupa a tela. */
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const medida = tamanho === "sm" ? "h-3.5 w-3.5" : tamanho === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block flex-none animate-spin rounded-full border-2 border-current border-t-transparent",
        medida,
        className,
      )}
    />
  );
}

/**
 * O BLOCO DE ESPERA: o spinner com o texto do que está sendo feito, anunciado a leitor de tela.
 *
 * O defeito que ele corrige: espera de vários segundos sem sinal nenhum na tela é lida como tela
 * TRAVADA, e quem está esperando clica de novo ou desiste. Dizer o que está acontecendo, e não só
 * que algo está, é o que transforma a espera em progresso.
 *
 * §A.11: sem travessão. §A.24: `titulo` é rótulo, vem em Title Case; `detalhe` é frase de apoio,
 * escrita normal.
 */
export function BlocoCarregando({
  titulo,
  detalhe,
  className,
}: {
  titulo: string;
  detalhe?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5",
        className,
      )}
    >
      <Spinner className="text-accent" />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-text">{titulo}</div>
        {detalhe && <p className="mt-0.5 text-[11.5px] text-dim">{detalhe}</p>}
      </div>
    </div>
  );
}
