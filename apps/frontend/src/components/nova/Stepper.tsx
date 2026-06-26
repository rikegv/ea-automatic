import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export interface StepDef {
  label: string;
  hint: string;
}

/**
 * Stepper do wizard de Nova Admissão (F6). Passo ativo em --accent, passos
 * concluídos marcados com check, mais uma barra de progresso coerente com o DS.
 */
export function Stepper({ steps, current }: { steps: StepDef[]; current: number }) {
  const total = steps.length;
  const pct = total <= 1 ? 100 : Math.min(100, (current / (total - 1)) * 100);

  return (
    <div className="mb-6">
      <div className="flex items-stretch gap-2">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={step.label} className="flex flex-1 items-center gap-3">
              <div
                className={cn(
                  "grid h-9 w-9 flex-none place-items-center rounded-full border text-sm font-bold transition",
                  done && "border-transparent bg-[var(--accent)] text-white",
                  active && "border-[var(--accent)] text-[var(--accent)]",
                  !done && !active && "border-[var(--border)] text-faint",
                )}
              >
                {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
              </div>
              <div className="min-w-0">
                <div
                  className={cn(
                    "truncate text-[13.5px] font-semibold",
                    active || done ? "text-text" : "text-faint",
                  )}
                >
                  {step.label}
                </div>
                <div className="truncate text-[11.5px] text-dim">{step.hint}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: "var(--btn-grad)" }}
        />
      </div>
    </div>
  );
}
