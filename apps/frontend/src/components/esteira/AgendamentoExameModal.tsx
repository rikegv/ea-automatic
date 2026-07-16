"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";

// Fornecedor do exame, seleção FIXA (espelha FORNECEDORES_EXAME do backend).
type Fornecedor = "MEDICAL" | "LIMER";
const FORNECEDOR_OPCOES: { value: Fornecedor; label: string }[] = [
  { value: "MEDICAL", label: "Medical" },
  { value: "LIMER", label: "Limer" },
];
const FORNECEDOR_ROTULO: Record<Fornecedor, string> = {
  MEDICAL: "Medical",
  LIMER: "Limer",
};

/** Registro devolvido pelo GET /esteira/exame/{id}/agendamento (ou null). */
interface AgendamentoRow {
  data: string | null; // YYYY-MM-DD
  horario: string | null; // "HH:MM"
  nomeClinica: string | null;
  local: string | null;
  fornecedor: Fornecedor | null;
  valor: string | null; // decimal "500.00"
  previsaoAso: string | null; // YYYY-MM-DD
  reagendamentos: number;
}

function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function fmtValor(v?: string | null): string {
  if (v === null || v === undefined || v === "") return "não informado";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

/**
 * Modal de Gestão de Agendamento do Exame (aba EXAME). O consultor manda a planilha à clínica, a
 * clínica responde por e-mail e o consultor LANÇA os dados aqui. Dois modos:
 * - CADASTRO (sem agendamento): formulário vazio → PUT sem `reagendar`.
 * - VISUALIZAÇÃO (já existe): mostra os dados atuais; "Reagendar" habilita a edição e o PUT com
 *   `reagendar:true` (substitui os dados e incrementa o contador de reagendamentos).
 */
export function AgendamentoExameModal({
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
  const [atual, setAtual] = useState<AgendamentoRow | null>(null);
  // editing = form aberto p/ edição. Sem agendamento → já entra em edição (cadastro).
  const [editing, setEditing] = useState(false);

  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [nomeClinica, setNomeClinica] = useState("");
  const [local, setLocal] = useState("");
  const [fornecedor, setFornecedor] = useState<Fornecedor | "">("");
  // Novos (decisão do diretor): valor do exame e previsão do ASO (informada pela clínica). Opcionais.
  const [valor, setValor] = useState("");
  const [previsaoAso, setPrevisaoAso] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Carga do registro atual (GET), popula o form em modo visualização/reagendamento.
  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setLoadError(null);
    apiFetch<AgendamentoRow | null>(`/esteira/exame/${admissaoId}/agendamento`, { token })
      .then((row) => {
        if (!vivo) return;
        if (row && row.data) {
          setAtual(row);
          setData(row.data ?? "");
          setHorario(row.horario ?? "");
          setNomeClinica(row.nomeClinica ?? "");
          setLocal(row.local ?? "");
          setFornecedor(row.fornecedor ?? "");
          setValor(row.valor ?? "");
          setPrevisaoAso(row.previsaoAso ?? "");
          setEditing(false);
        } else {
          setAtual(null);
          setEditing(true); // cadastro
        }
      })
      .catch((e) => {
        if (!vivo) return;
        setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar o agendamento.");
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [admissaoId, token]);

  const temAgendamento = Boolean(atual);
  const completo =
    data.trim() !== "" &&
    horario.trim() !== "" &&
    nomeClinica.trim() !== "" &&
    local.trim() !== "" &&
    fornecedor !== "";

  async function salvar() {
    if (!completo) return; // `completo` garante fornecedor !== "" (narrowing por alias)
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/esteira/exame/${admissaoId}/agendamento`, {
        method: "PUT",
        token,
        body: {
          data,
          horario,
          nomeClinica: nomeClinica.trim(),
          local: local.trim(),
          fornecedor,
          valor: valor.trim() || undefined,
          previsaoAso: previsaoAso || undefined,
          reagendar: temAgendamento ? true : undefined,
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
    <Modal onClose={() => onClose(false)} className="max-w-lg" ariaLabel="Agendamento do exame">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface)] text-accent">
          <Icon name="clock" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold">Agendamento do exame</h3>
          <p className="psub !mb-0 mt-1 truncate">{candidatoNome}</p>
        </div>
        {temAgendamento && (atual?.reagendamentos ?? 0) > 0 && (
          <Pill tone="or" className="ml-auto flex-none">
            Reagendado {atual?.reagendamentos}x
          </Pill>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-faint">Carregando agendamento…</div>
      ) : loadError ? (
        <div className="py-8 text-center text-sm text-danger">{loadError}</div>
      ) : (
        <>
          {/* ── Modo VISUALIZAÇÃO, dados atuais, sem edição ─────────────────── */}
          {temAgendamento && !editing ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Data" valor={fmtData(atual?.data)} />
                <Campo rotulo="Horário" valor={atual?.horario || "não informado"} />
              </div>
              <Campo rotulo="Nome da clínica" valor={atual?.nomeClinica || "não informado"} />
              <Campo rotulo="Local da realização" valor={atual?.local || "não informado"} />
              <Campo
                rotulo="Fornecedor"
                valor={atual?.fornecedor ? FORNECEDOR_ROTULO[atual.fornecedor] : "não informado"}
              />
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Valor do exame" valor={fmtValor(atual?.valor)} />
                <Campo rotulo="Previsão do ASO" valor={fmtData(atual?.previsaoAso)} />
              </div>
            </div>
          ) : (
            /* ── Modo CADASTRO / REAGENDAMENTO, formulário editável ─────────── */
            <div className="grid gap-3">
              {temAgendamento && (
                <p className="rounded-xl border border-[var(--border)] bg-[rgba(214,142,69,0.12)] px-3 py-2 text-[12.5px] text-warn">
                  Reagendar substitui os dados atuais e registra mais um reagendamento.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="ds-label">
                    Data <span className="text-danger">*</span>
                  </span>
                  <input
                    type="date"
                    className="ds-input"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                </div>
                <div>
                  <span className="ds-label">
                    Horário <span className="text-danger">*</span>
                  </span>
                  <input
                    type="time"
                    className="ds-input"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <span className="ds-label">
                  Nome da clínica <span className="text-danger">*</span>
                </span>
                <input
                  className="ds-input"
                  placeholder="Clínica responsável pelo exame…"
                  value={nomeClinica}
                  onChange={(e) => setNomeClinica(e.target.value)}
                />
              </div>
              <div>
                <span className="ds-label">
                  Local da realização <span className="text-danger">*</span>
                </span>
                <input
                  className="ds-input"
                  placeholder="Endereço / unidade do exame…"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                />
              </div>
              <div>
                <span className="ds-label">
                  Fornecedor <span className="text-danger">*</span>
                </span>
                <Select
                  ariaLabel="Fornecedor do exame"
                  value={fornecedor}
                  onChange={(v) => setFornecedor(v as Fornecedor)}
                  placeholder="Selecionar fornecedor…"
                  options={FORNECEDOR_OPCOES}
                />
              </div>
              {/* Novos (opcionais): valor do exame e previsão do ASO informada pela clínica. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="ds-label">Valor do exame</span>
                  <input
                    className="ds-input"
                    inputMode="decimal"
                    placeholder="Ex.: 120,00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </div>
                <div>
                  <span className="ds-label">Previsão do ASO</span>
                  <input
                    type="date"
                    className="ds-input"
                    value={previsaoAso}
                    onChange={(e) => setPrevisaoAso(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {saveError && (
            <p
              className="mt-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {saveError}
            </p>
          )}

          {/* ── Ações ────────────────────────────────────────────────────────── */}
          <div className="mt-5 flex justify-end gap-2">
            {temAgendamento && !editing ? (
              <>
                <Button variant="secondary" className="px-4 py-2.5" onClick={() => onClose(false)}>
                  Fechar
                </Button>
                <Button className="px-4 py-2.5" onClick={() => setEditing(true)}>
                  <span className="inline-flex items-center gap-2">
                    <Icon name="pen" className="h-4 w-4" /> Reagendar
                  </span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  className="px-4 py-2.5"
                  disabled={saving}
                  onClick={() => (temAgendamento ? setEditing(false) : onClose(false))}
                >
                  Cancelar
                </Button>
                <Button
                  className={cn("px-4 py-2.5", (!completo || saving) && "opacity-60")}
                  disabled={!completo || saving}
                  onClick={() => void salvar()}
                >
                  {saving
                    ? "Salvando…"
                    : temAgendamento
                      ? "Salvar reagendamento"
                      : "Cadastrar agendamento"}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{rotulo}</div>
      <div className="mt-0.5 text-[14px] font-semibold text-text">{valor}</div>
    </div>
  );
}
