/** Junta classes condicionais (sem dependência extra). Se o projeto já usa `clsx`/`tailwind-merge`, pode trocar. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
