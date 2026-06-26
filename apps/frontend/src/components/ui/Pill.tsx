import { cn } from "@/lib/cn";

/** Estados visuais da pill (DESIGN-SYSTEM.md): ok/pendente/laranja/inconforme/neutro. */
export type PillTone = "ok" | "wn" | "or" | "dg" | "nt";

export function Pill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("pill", tone, className)}>
      <span className="pd" />
      {children}
    </span>
  );
}
