import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Botão do design system: primário (gradiente azul) ou secundário (glass). */
export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        variant === "primary" ? "btn-primary" : "btn-secondary",
        "px-4 py-3",
        className,
      )}
      {...rest}
    />
  );
}
