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
  /**
   * O TOM DO DIÁLOGO, E POR QUE SÃO TRÊS E NÃO DOIS.
   *
   * `default` CONFIRMA (check no tom do sistema) e `danger` ALERTA PARA O IRREVERSÍVEL (vermelho).
   * Entre os dois faltava o caso do AVISO: a ação é legítima, a pessoa tem o direito de fazê-la, e
   * mesmo assim ela precisa parar para ler. O `default` a vestia de SUCESSO, com um check azul, e o
   * `danger` a vestiria de ACUSAÇÃO, com vermelho, que é o oposto do que a redução de meta é
   * (§A.6/§A.3 regra 8: controle por responsabilização, não por suspeita).
   *
   * `warn` é ADITIVO: `default` e `danger` continuam exatamente como estavam, e nenhuma das 27
   * telas que já usam este diálogo muda de aparência por causa desta linha.
   */
  tone?: "default" | "danger" | "warn";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const danger = tone === "danger";
  const warn = tone === "warn";
  return (
    <Modal onClose={onCancel} className="max-w-md" ariaLabel={title}>
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 flex-none place-items-center rounded-full",
            danger
              ? "bg-[rgba(214,69,69,0.14)] text-danger"
              : warn
                ? "bg-[var(--sico-warn)] text-warn"
                : "bg-[var(--sico)] text-accent",
          )}
        >
          {/* O ÍCONE SEGUE O ESTADO REAL (§A.12): atenção é exclamação, sucesso é check. Um check
              num aviso diz à pessoa que já deu certo, justamente no instante em que ela ainda pode
              voltar atrás. */}
          <Icon name={danger || warn ? "alert" : "check"} className="h-5 w-5" />
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
