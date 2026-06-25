import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Superfície glass padrão (DESIGN-SYSTEM.md). Base de todos os cards/painéis. */
export function GlassCard({
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Tag className={cn("glass", className)} {...rest}>
      {children}
    </Tag>
  );
}
