"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";

/**
 * ATRIBUIÇÃO EM MASSA do consultor responsável (OST ajustes, Onda 2).
 *
 * Mesmo molde das outras ações em massa da Esteira: componente separado do controle individual (o
 * seletor inline da coluna), aplicado a TODOS os selecionados de uma vez, numa frente só. Só o
 * Master chega aqui; o backend ainda exige @Roles, esta tela é só a porta.
 *
 * A lista de consultores é a MESMA que a coluna usa (quem tem acesso à Esteira); chega pronta por
 * props para não refazer a busca.
 */
export function AtribuirConsultorLoteModal({
  admissaoIds,
  frente,
  consultores,
  onClose,
}: {
  admissaoIds: string[];
  frente: string;
  consultores: { id: string; nome: string }[];
  onClose: (salvou: boolean) => void;
}) {
  const { token } = useAuth();
  const [consultorId, setConsultorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!consultorId || saving) return;
    setSaving(true);
    setErro(null);
    try {
      await apiFetch("/esteira/consultor-lote", {
        method: "POST",
        token,
        body: { frente, admissaoIds, consultorId },
      });
      onClose(true);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao atribuir o consultor ao lote.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={() => onClose(false)}
      className="max-w-md"
      ariaLabel="Atribuir consultor responsável em massa"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface)] text-accent">
          <Icon name="users" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold">Atribuir Consultor Em Massa</h3>
          <p className="psub !mb-0 mt-1">
            {admissaoIds.length} candidato{admissaoIds.length > 1 ? "s" : ""} selecionado
            {admissaoIds.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <div>
          <span className="ds-label">
            Consultor responsável <span className="text-danger">*</span>
          </span>
          <Select
            value={consultorId}
            onChange={(v) => setConsultorId(v)}
            ariaLabel="Consultor responsável do lote"
            options={[
              { value: "", label: "Selecione o consultor" },
              ...consultores.map((c) => ({ value: c.id, label: c.nome })),
            ]}
          />
        </div>

        <p className="text-xs text-faint">
          O mesmo consultor é atribuído a todos os selecionados, só nesta frente de trabalho.
        </p>

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onClose(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={!consultorId || saving}>
            {saving ? "Atribuindo..." : "Atribuir"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
