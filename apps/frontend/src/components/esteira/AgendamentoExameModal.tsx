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
import { caixaAlta } from "@/lib/nome";

// A lista FIXA de fornecedores saiu (OST do fornecedor por clínica): ele é cadastrado na clínica e
// vem dela, por endereço, como TEXTO. O campo do agendamento antigo (do pai) segue sendo exibido em
// `atual.fornecedor` para o registro anterior à mudança continuar legível.

/** Registro devolvido pelo GET /esteira/exame/{id}/agendamento (ou null). */
interface AgendamentoRow {
  data: string | null; // YYYY-MM-DD
  horario: string | null; // "HH:MM"
  nomeClinica: string | null;
  /** Clínica escolhida no catálogo (OST Onda 2, item 4). */
  clinicaId?: string | null;
  local: string | null;
  /** Fornecedor do agendamento ANTIGO (histórico). O atual vem por endereço. */
  fornecedor: string | null;
  valor: string | null; // decimal "500.00"
  previsaoAso: string | null; // YYYY-MM-DD
  reagendamentos: number;
  /** Endereços do dia (multi-endereço, OST Onda 2). FONTE DA VERDADE de clínica, local e horário. */
  enderecos?: {
    ordem: number;
    clinicaId: string | null;
    nomeClinica: string | null;
    local: string | null;
    horario: string | null;
    fornecedor: string | null;
  }[];
}

/** Um endereço no FORMULÁRIO. `data` é única do agendamento e não entra aqui. */
interface EnderecoForm {
  clinicaId: string;
  local: string;
  horario: string;
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
  // MULTI-ENDEREÇO (OST Onda 2): o formulário guarda uma LISTA. Cada endereço tem clínica (da lista
  // do Gerencial, nunca texto livre) e horário PRÓPRIO. A data é única e vive fora daqui.
  const [enderecos, setEnderecos] = useState<EnderecoForm[]>([
    { clinicaId: "", local: "", horario: "" },
  ]);
  const [clinicas, setClinicas] = useState<
    { id: string; nome: string; fornecedor: string | null; endereco: string | null }[]
  >([]);
  // Novos (decisão do diretor): valor do exame e previsão do ASO (informada pela clínica). Opcionais.
  const [valor, setValor] = useState("");
  const [previsaoAso, setPrevisaoAso] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Catálogo de CLÍNICAS ATIVAS (OST Onda 2, item 4): as opções do seletor. Falha silenciosa deixa a
  // lista vazia, e aí o gate do formulário impede o salvamento em vez de gravar clínica inventada.
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
          // Agendamento novo traz a LISTA; agendamento anterior ao multi-endereço cai no fallback do
          // formato antigo (um endereço só), para a tela nunca abrir vazia sobre dado que existe.
          const lista = (row.enderecos ?? []).map((e) => ({
            clinicaId: e.clinicaId ?? "",
            local: e.local ?? "",
            horario: e.horario ?? "",
          }));
          setEnderecos(
            lista.length > 0
              ? lista
              : [
                  {
                    clinicaId: row.clinicaId ?? "",
                    local: row.local ?? "",
                    horario: row.horario ?? "",
                  },
                ],
          );
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
  // PREVISÃO DO ASO entra no gate (OST Onda 2): ela deixou de ser opcional porque é a data que o
  // verificador de hora em hora compara com a do exame para decidir entre "Aguardando Liberação Do
  // ASO" e "ASO Pendente". Sem ela, o status automático não teria como existir.
  const completo =
    data.trim() !== "" &&
    enderecos.length > 0 &&
    enderecos.every(
      (e) => e.clinicaId !== "" && e.local.trim() !== "" && e.horario.trim() !== "",
    ) &&
    previsaoAso.trim() !== "";

  async function salvar() {
    if (!completo) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/esteira/exame/${admissaoId}/agendamento`, {
        method: "PUT",
        token,
        body: {
          data,
          enderecos: enderecos.map((e) => ({
            clinicaId: e.clinicaId,
            local: e.local.trim(),
            horario: e.horario,
          })),
          valor: valor.trim() || undefined,
          previsaoAso,
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
    <Modal onClose={() => onClose(false)} className="max-w-lg" ariaLabel="Agendamento Do Exame">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface)] text-accent">
          <Icon name="clock" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold">Agendamento do exame</h3>
          {/* Bloco 1 da OST: caixa alta de exibição; a prop segue com o nome original. */}
          <p className="psub !mb-0 mt-1 truncate">{caixaAlta(candidatoNome)}</p>
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
              <Campo rotulo="Data" valor={fmtData(atual?.data)} />
              {/* MULTI-ENDEREÇO: a visualização lista TODOS os endereços do dia, cada um com o seu
                  horário. Agendamento anterior ao multi-endereço cai no par singular do fallback. */}
              {(atual?.enderecos ?? []).length > 0 ? (
                <div className="grid gap-2">
                  {(atual?.enderecos ?? []).map((e) => (
                    <div
                      key={e.ordem}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-faint">
                        Endereço {e.ordem} · {e.horario || "sem horário"}
                        {e.fornecedor ? ` · ${e.fornecedor}` : ""}
                      </div>
                      <div className="text-[13.5px] text-text">
                        {e.nomeClinica || "não informado"}
                      </div>
                      <div className="break-words text-[12.5px] text-dim">
                        {e.local || "não informado"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <Campo rotulo="Horário" valor={atual?.horario || "não informado"} />
                  <Campo rotulo="Nome da clínica" valor={atual?.nomeClinica || "não informado"} />
                  <Campo rotulo="Local da realização" valor={atual?.local || "não informado"} />
                </>
              )}
              <Campo
                rotulo="Fornecedor"
                valor={atual?.fornecedor || "não informado"}
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
              </div>

              {/* MULTI-ENDEREÇO (OST Onda 2): o candidato pode fazer o exame em mais de um lugar no
                  MESMO dia. A data é única (campo acima); cada endereço tem clínica e horário
                  próprios, e o validador de atraso usa o ÚLTIMO horário do dia como referência. */}
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
                                /**
                                 * ESCOLHER A CLÍNICA SUGERE O ENDEREÇO CADASTRADO (decisão do
                                 * diretor). O dado já existia no cadastro (migração 0064) e não
                                 * chegava aqui, então o consultor redigitava o que o sistema já
                                 * sabia.
                                 *
                                 * É SUGESTÃO, NÃO TRAVA: o campo continua editável, porque a
                                 * clínica pode atender em outro endereço naquele dia.
                                 *
                                 * E NÃO PISA EM EDIÇÃO MANUAL: só preenche quando o campo está
                                 * VAZIO ou quando o que está ali é exatamente o endereço da clínica
                                 * anterior (ou seja, foi o próprio sistema que pôs). Se o consultor
                                 * digitou algo, aquilo fica: sobrescrever seria apagar a informação
                                 * que ele tem e o cadastro não tem.
                                 */
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
                            placeholder="Endereço / unidade do exame…"
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
                                cur.map((x, k) =>
                                  k === i ? { ...x, horario: ev.target.value } : x,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* O SELETOR DE FORNECEDOR SAIU (OST do fornecedor por clínica): ele é atributo da
                  CLÍNICA e vem dela, por endereço. Cada bloco de endereço acima mostra qual é. */}
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
