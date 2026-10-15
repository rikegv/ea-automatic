"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";

/** Um endereço no formulário. A data é única do agendamento e não entra aqui. */
interface EnderecoForm {
  clinicaId: string;
  local: string;
  horario: string;
}

/**
 * AGENDAMENTO EM MASSA do exame (OST das ondas, Onda 3).
 *
 * COMPONENTE SEPARADO do agendamento individual, de propósito (§A.26, mesmo motivo do lote da
 * integração): o individual carrega o registro atual, tem modo visualização/reagendamento e já foi
 * validado; aqui são SÓ os campos de preenchimento, aplicados a TODOS os selecionados de uma vez.
 *
 * Os MESMOS campos do modal individual (data, endereços com clínica/local/horário, valor e previsão
 * do ASO). O MESMO horário vale para todos (não escalona). SEM trava de sobreposição: clientes
 * diferentes podem ter o mesmo horário de propósito.
 */
export function AgendamentoExameLoteModal({
  admissaoIds,
  onClose,
}: {
  admissaoIds: string[];
  onClose: (salvou: boolean) => void;
}) {
  const { token } = useAuth();

  const [data, setData] = useState("");
  const [enderecos, setEnderecos] = useState<EnderecoForm[]>([
    { clinicaId: "", local: "", horario: "" },
  ]);
  const [clinicas, setClinicas] = useState<
    { id: string; nome: string; fornecedor: string | null; endereco: string | null }[]
  >([]);
  const [valor, setValor] = useState("");
  const [previsaoAso, setPrevisaoAso] = useState("");

  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    apiFetch<{ id: string; nome: string; fornecedor: string | null; endereco: string | null }[]>(
      "/catalogos/clinicas",
      { token },
    )
      .then((lista) => {
        if (vivo) setClinicas(lista);
      })
      .catch(() => setClinicas([]));
    return () => {
      vivo = false;
    };
  }, [token]);

  const completo =
    data.trim() !== "" &&
    enderecos.length > 0 &&
    enderecos.every(
      (e) => e.clinicaId !== "" && e.local.trim() !== "" && e.horario.trim() !== "",
    ) &&
    previsaoAso.trim() !== "";

  async function salvar() {
    if (!completo || saving) return;
    setSaving(true);
    setErro(null);
    try {
      await apiFetch("/esteira/exame/agendamento-lote", {
        method: "POST",
        token,
        body: {
          admissaoIds,
          data,
          enderecos: enderecos.map((e) => ({
            clinicaId: e.clinicaId,
            local: e.local.trim(),
            horario: e.horario,
          })),
          valor: valor.trim() || undefined,
          previsaoAso,
        },
      });
      onClose(true);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao agendar o lote.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={() => onClose(false)} className="max-w-lg" ariaLabel="Agendamento em massa do exame">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface)] text-accent">
          <Icon name="clock" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold">Agendar Em Massa</h3>
          <p className="psub !mb-0 mt-1">
            {admissaoIds.length} candidato{admissaoIds.length > 1 ? "s" : ""} selecionado
            {admissaoIds.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
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
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="ds-label !mb-0">
              Endereços do exame <span className="text-danger">*</span>
            </span>
            <Button
              variant="secondary"
              className="!py-1 !text-[12px]"
              onClick={() =>
                setEnderecos((cur) => [...cur, { clinicaId: "", local: "", horario: "" }])
              }
            >
              Adicionar endereço
            </Button>
          </div>

          {enderecos.map((e, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] uppercase tracking-wide text-faint">
                  Endereço {i + 1}
                </span>
                {enderecos.length > 1 && (
                  <button
                    type="button"
                    className="text-[11.5px] text-danger hover:underline"
                    onClick={() => setEnderecos((cur) => cur.filter((_, k) => k !== i))}
                  >
                    remover
                  </button>
                )}
              </div>
              <div className="grid gap-2">
                <div>
                  <span className="ds-label">
                    Clínica <span className="text-danger">*</span>
                  </span>
                  <Select
                    value={e.clinicaId}
                    onChange={(v) =>
                      setEnderecos((cur) =>
                        cur.map((x, k) => {
                          if (k !== i) return x;
                          // Escolher a clínica sugere o endereço cadastrado, sem pisar em edição
                          // manual (mesma regra do modal individual).
                          const anterior = clinicas.find((c) => c.id === x.clinicaId);
                          const nova = clinicas.find((c) => c.id === v);
                          const podeSugerir =
                            !x.local.trim() || x.local.trim() === (anterior?.endereco ?? "").trim();
                          return {
                            ...x,
                            clinicaId: v,
                            local: podeSugerir ? (nova?.endereco ?? "") : x.local,
                          };
                        }),
                      )
                    }
                    ariaLabel={`Clínica do endereço ${i + 1}`}
                    options={[
                      { value: "", label: "Selecione a clínica" },
                      ...clinicas.map((c) => ({ value: c.id, label: c.nome })),
                    ]}
                  />
                </div>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <div>
                    <span className="ds-label">
                      Local da realização <span className="text-danger">*</span>
                    </span>
                    <input
                      className="ds-input"
                      placeholder="Endereço / unidade do exame"
                      value={e.local}
                      onChange={(ev) =>
                        setEnderecos((cur) =>
                          cur.map((x, k) => (k === i ? { ...x, local: ev.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <span className="ds-label">
                      Horário <span className="text-danger">*</span>
                    </span>
                    <input
                      type="time"
                      className="ds-input"
                      value={e.horario}
                      onChange={(ev) =>
                        setEnderecos((cur) =>
                          cur.map((x, k) => (k === i ? { ...x, horario: ev.target.value } : x)),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

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
            <span className="ds-label">
              Previsão do ASO <span className="text-danger">*</span>
            </span>
            <input
              type="date"
              className="ds-input"
              value={previsaoAso}
              onChange={(e) => setPrevisaoAso(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-faint">
          Os mesmos dados são aplicados a todos os selecionados. Clientes diferentes podem ser
          agendados no mesmo horário.
        </p>

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onClose(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={!completo || saving}>
            {saving ? "Agendando..." : "Agendar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
