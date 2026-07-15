"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

// Rótulo de pendência → chave de campo editável (S2). Cliente/Cargo não são editáveis.
const CAMPO_KEY: Record<string, string> = {
  Salário: "salario",
  "Data de admissão": "dataAdmissao",
  "Pacote de benefícios": "beneficios",
  Escala: "escala",
  "Centro de custo": "centroCusto",
  "Gestor / BP": "gestorBp",
};

/**
 * S2: modal de Pendências Obrigatórias. Lista os campos obrigatórios vazios da admissão. "Preencher
 * pendências" abre o formulário de edição já filtrado nesses campos (via `onPreencher`).
 */
export function PendenciasModal({
  admissaoId,
  candidatoNome,
  onClose,
  onPreencher,
}: {
  admissaoId: string;
  candidatoNome: string;
  onClose: () => void;
  onPreencher: (camposFiltro: string[]) => void;
}) {
  const { token } = useAuth();
  const [pendencias, setPendencias] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ pendencias: string[] }>(`/esteira/admissao/${admissaoId}`, { token })
      .then((r) => setPendencias(r.pendencias))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Falha ao carregar pendências."));
  }, [admissaoId, token]);

  const editaveis = (pendencias ?? []).map((p) => CAMPO_KEY[p]).filter(Boolean);

  return (
    <Modal onClose={onClose} className="max-w-md" ariaLabel="Pendências obrigatórias">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--sico-warn)] text-warn">
          <Icon name="alert" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold">Pendências obrigatórias</h3>
          <p className="psub !mb-0 mt-1 truncate">{candidatoNome}</p>
        </div>
      </div>

      {erro ? (
        <p className="py-6 text-center text-sm text-danger">{erro}</p>
      ) : pendencias === null ? (
        <p className="py-6 text-center text-sm text-faint">Carregando…</p>
      ) : pendencias.length === 0 ? (
        <p className="py-6 text-center text-sm text-ok">Nenhuma pendência obrigatória. 🎉</p>
      ) : (
        <div className="space-y-1.5">
          {pendencias.map((p) => (
            <div
              key={p}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[13.5px]"
            >
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--warn)]" />
              {p}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" className="px-4 py-2.5" onClick={onClose}>
          Fechar
        </Button>
        {pendencias && pendencias.length > 0 && editaveis.length > 0 && (
          <Button className="px-4 py-2.5" onClick={() => onPreencher(editaveis)}>
            Preencher pendências
          </Button>
        )}
      </div>
    </Modal>
  );
}
