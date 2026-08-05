"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { caixaAlta } from "@/lib/nome";

/** Registro devolvido pelo GET /esteira/integracao/{id}/agendamento (ou null). */
interface AgendamentoIntegracaoRow {
  data: string | null; // YYYY-MM-DD
  horario: string | null; // "HH:MM"
  tipo: string | null; // ONLINE | PRESENCIAL
  consultorId: string | null;
}

const TIPOS = [
  { value: "ONLINE", label: "Online" },
  { value: "PRESENCIAL", label: "Presencial" },
];

/**
 * MODAL DE AGENDAMENTO DA INTEGRAÇÃO (aba INTEGRAÇÃO, última etapa da esteira).
 *
 * O consultor marca a data, o horário, a modalidade e quem conduz. Quatro campos, e é isso.
 *
 * SALVAR NÃO MOVE A FRENTE, de propósito, e aqui está a diferença em relação ao agendamento do
 * exame: lá o salvamento leva a frente a AGENDADO sozinho, porque a data do exame é o próprio fato.
 * Na integração o diretor descreveu o status como algo que o CONSULTOR registra, então mover por
 * baixo tiraria dele o controle da própria fila. O avanço continua pelo seletor de status da linha.
 *
 * O formulário aceita salvamento PARCIAL (§A.3 regra 5: pendência sinaliza, não bloqueia). Quem
 * cobra o preenchimento completo é o gate de transição do backend, ao marcar "Agendado".
 */
export function AgendamentoIntegracaoModal({
  admissaoId,
  candidatoNome,
  onClose,
}: {
  admissaoId: string;
  candidatoNome: string;
  onClose: (salvou: boolean) => void;
}) {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consultores, setConsultores] = useState<{ id: string; nome: string }[]>([]);

  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [tipo, setTipo] = useState("");
  const [consultorId, setConsultorId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Consultores que podem conduzir: COMUM e MASTER, ativos. O SUPER ADMIN não vem na lista, e isso é
  // decidido no backend (`/catalogos/consultores`), não aqui: regra de negócio não mora na tela.
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    apiFetch<{ id: string; nome: string }[]>("/catalogos/consultores", { token })
      .then((lista) => {
        if (vivo) setConsultores(lista);
      })
      .catch(() => setConsultores([]));
    return () => {
      vivo = false;
    };
  }, [token]);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setLoadError(null);
    apiFetch<AgendamentoIntegracaoRow | null>(`/esteira/integracao/${admissaoId}/agendamento`, {
      token,
    })
      .then((row) => {
        if (!vivo) return;
        setData(row?.data ?? "");
        setHorario(row?.horario ?? "");
        setTipo(row?.tipo ?? "");
        setConsultorId(row?.consultorId ?? "");
      })
      .catch((e) => {
        if (vivo) setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar o agendamento.");
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [admissaoId, token]);

  async function salvar() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/esteira/integracao/${admissaoId}/agendamento`, {
        token,
        method: "PUT",
        body: {
          data: data || undefined,
          horario: horario || undefined,
          tipo: tipo || undefined,
          consultorId: consultorId || undefined,
        },
      });
      onClose(true);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Falha ao salvar o agendamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={() => onClose(false)} ariaLabel="Agendamento da integração" className="max-w-lg">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">Agendamento Da Integração</h2>
          <p className="mt-0.5 truncate text-sm text-faint" title={caixaAlta(candidatoNome)}>
            {caixaAlta(candidatoNome)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label="Fechar"
          className="rounded-md p-1 text-faint transition hover:text-text"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-faint">Carregando…</div>
      ) : loadError ? (
        <div className="px-5 py-10 text-center text-sm text-danger">{loadError}</div>
      ) : (
        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-faint">Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="ds-input w-full"
                aria-label="Data da integração"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-faint">Horário</span>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="ds-input w-full"
                aria-label="Horário da integração"
              />
            </label>
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-faint">Tipo</span>
            <Select
              value={tipo}
              onChange={(v) => setTipo(v)}
              options={TIPOS}
              placeholder="Selecionar…"
              ariaLabel="Tipo da integração"
              menuFit
            />
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-faint">Consultor responsável</span>
            <Select
              value={consultorId}
              onChange={(v) => setConsultorId(v)}
              options={consultores.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder="Selecionar…"
              ariaLabel="Consultor responsável pela integração"
              searchable
              menuFit
            />
          </div>

          {/* O consultor precisa saber POR QUE salvar não muda o status da linha. */}
          <p className="text-xs text-faint">
            Salvar registra o agendamento. O status da frente continua sendo alterado pelo seletor da
            linha.
          </p>

          {saveError && <p className="text-sm text-danger">{saveError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => onClose(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
