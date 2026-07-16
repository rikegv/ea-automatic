import { cn } from "@/lib/cn";

/**
 * Bloco visual dos modais (olho e lápis) — §A.12. Título em caixa alta + conteúdo num cartão, para
 * os dois modais lerem no MESMO design de blocos, organizado e prático.
 */
export function Bloco({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4", className)}
    >
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {titulo}
      </div>
      {children}
    </section>
  );
}
