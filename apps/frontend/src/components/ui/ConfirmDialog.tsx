"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { cn } from "@/lib/cn";

/**
 * Diálogo modal de confirmação reutilizável (DS). Usado na Esteira para a confirmação leve de
 * conclusão de frente e para o alerta bloqueante de reversão (aceite explícito, §A.5/F8).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const danger = tone === "danger";
  return (
    <Modal onClose={onCancel} className="max-w-md" ariaLabel={title}>
      <div className="mb-4 flex items-start gap-3">
          <span
            className={cn(
              "grid h-10 w-10 flex-none place-items-center rounded-full",
              danger
                ? "bg-[rgba(214,69,69,0.14)] text-danger"
                : "bg-[var(--sico)] text-accent",
            )}
          >
            <Icon name={danger ? "alert" : "check"} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3>{title}</h3>
            <p className="psub !mb-0 mt-1">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy} className="px-4 py-2.5">
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className={cn("px-4 py-2.5", danger && "!bg-[var(--danger)] !text-white")}
          >
            {busy ? "Processando…" : confirmLabel}
          </Button>
        </div>
    </Modal>
  );
}
