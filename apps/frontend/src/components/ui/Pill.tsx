import { cn } from "@/lib/cn";

/** Estados visuais da pill (DESIGN-SYSTEM.md): ok/pendente/laranja/inconforme/neutro/azul. */
export type PillTone = "ok" | "wn" | "or" | "dg" | "nt" | "in";

export function Pill({
  tone,
  children,
  className,
  title,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("pill", tone, className)} title={title}>
      <span className="pd" />
      {children}
    </span>
  );
}
