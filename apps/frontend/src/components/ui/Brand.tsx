import { cn } from "@/lib/cn";

/** Marca EA AUTOMATIC: quadro gradiente "EA" + nome. Portada do protótipo. */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="brand-mark">EA</div>
      <div className="brand-name">
        EA <span>AUTOMATIC</span>
      </div>
    </div>
  );
}
