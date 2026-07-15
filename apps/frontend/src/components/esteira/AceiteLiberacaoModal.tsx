"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export interface AceiteLiberacao {
  diretoria: boolean;
  motivo: string;
}

/**
 * Modal de aceite de liberação COM PENDÊNCIA (2C item 2). Integra a escolha Via 1 × Via 2:
 * - Não (Via 1): segue como não conformidade do consultor (penaliza).
 * - Sim (Via 2): liberação por determinação da diretoria, exige motivo; a NC nasce aguardando
 *   aprovação do Master/Super Admin (não penaliza até a decisão).
 * Usado para "apto sem ASO" e "auditoria incompleta".
 */
export function AceiteLiberacaoModal({
  title,
  message,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  busy?: boolean;
  onConfirm: (l: AceiteLiberacao) => void;
  onCancel: () => void;
}) {
  const [diretoria, setDiretoria] = useState(false);
  const [motivo, setMotivo] = useState("");
  const bloqueado = diretoria && !motivo.trim();

  return (
    <Modal onClose={onCancel} className="max-w-md" ariaLabel={title}>
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[rgba(214,69,69,0.14)] text-danger">
          <Icon name="alert" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold">{title}</h3>
          <p className="psub !mb-0 mt-1">{message}</p>
        </div>
      </div>

      <div className="mt-4">
        <span className="ds-label">Esta liberação foi a pedido da diretoria?</span>
        <div className="grid gap-2">
          <Opcao
            ativo={!diretoria}
            onClick={() => setDiretoria(false)}
            titulo="Não, não conformidade do consultor"
            desc="Via 1: registra a NC penalizando o consultor responsável."
          />
          <Opcao
            ativo={diretoria}
            onClick={() => setDiretoria(true)}
            titulo="Sim, liberação por determinação da diretoria"
            desc="Via 2: vai à supervisão (Master/Super Admin) para aprovação; não penaliza se aprovada."
          />
        </div>

        {diretoria && (
          <div className="mt-3">
            <span className="ds-label">
              Motivo <span className="text-danger">*</span>
            </span>
            <textarea
              className="ds-input min-h-[80px] resize-y"
              placeholder="Descreva a determinação da diretoria…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" className="px-4 py-2.5" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button
          className={cn("px-4 py-2.5", !diretoria && "!bg-[var(--danger)] !text-white")}
          disabled={busy || bloqueado}
          onClick={() => onConfirm({ diretoria, motivo: motivo.trim() })}
        >
          {busy ? "Processando…" : diretoria ? "Enviar à supervisão" : "Estou ciente, liberar"}
        </Button>
      </div>
    </Modal>
  );
}

function Opcao({
  ativo,
  onClick,
  titulo,
  desc,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
        ativo
          ? "border-[var(--accent)] bg-[var(--surface-2)] ring-1 ring-[var(--accent)]"
          : "border-[var(--border)] hover:bg-[var(--surface)]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full border",
          ativo ? "border-[var(--accent)]" : "border-[var(--border-strong)]",
        )}
      >
        {ativo && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-text">{titulo}</span>
        <span className="block text-[12px] text-dim">{desc}</span>
      </span>
    </button>
  );
}
