"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { RegraAuditoria } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Pill } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface TipoDocumento {
  id: string;
  codigo: string;
  nome: string;
}

/**
 * Admin: Regras de auditoria por tipo de documento (Fase 4 / INT-3). A régua diz QUAIS documentos
 * são exigidos; aqui o admin define SE cada documento está válido (critério textual que o motor de IA
 * aplica). CRUD restrito a Master/Super Admin (gating no AdminLayout). Sem PII.
 */
export default function RegrasAuditoriaPage() {
  const { token } = useAuth();
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [rows, setRows] = useState<RegraAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form de criação
  const [novoTipo, setNovoTipo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [saving, setSaving] = useState(false);

  // Edição inline de texto + estado de toggle
  const [editId, setEditId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Exclusão (ConfirmDialog)
  const [delAlvo, setDelAlvo] = useState<RegraAuditoria | null>(null);
  const [deleting, setDeleting] = useState(false);

  const nomePorTipo = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tipos) m.set(t.id, t.nome);
    return m;
  }, [tipos]);

  // Ordenação clicável (OST visual, leva das 11 tabelas). Documento ordena pelo NOME exibido, não
  // pelo id cru da coluna. Estado por RANK (ativa primeiro). Ações fica de fora: é controle.
  const colunas = useMemo<ColOrd<RegraAuditoria>[]>(
    () => [
      {
        chave: "documento",
        tipo: "texto",
        valor: (r) => nomePorTipo.get(r.tipoDocumentoId) ?? r.tipoDocumentoId,
      },
      { chave: "criterio", tipo: "texto", valor: (r) => r.descricaoRegra },
      { chave: "estado", tipo: "status", valor: (r) => (r.ativo ? 0 : 1) },
    ],
    [nomePorTipo],
  );
  const ord = useOrdenacao(colunas, rows);

  // Carrega os 21 tipos de documento (catálogo) uma vez.
  useEffect(() => {
    if (!token) return;
    apiFetch<TipoDocumento[]>("/catalogos/tipos-documento", { token })
      .then(setTipos)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Erro ao carregar tipos de documento."),
      );
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const qs = filtroTipo ? `?tipoDocumentoId=${encodeURIComponent(filtroTipo)}` : "";
    try {
      setRows(await apiFetch<RegraAuditoria[]>(`/admin/regras${qs}`, { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao carregar regras.");
    } finally {
      setLoading(false);
    }
  }, [token, filtroTipo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!novoTipo || !novaDescricao.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/admin/regras", {
        method: "POST",
        token,
        body: { tipoDocumentoId: novoTipo, descricaoRegra: novaDescricao.trim() },
      });
      setNovaDescricao("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao adicionar regra.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: { descricaoRegra?: string; ativo?: boolean }) {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/admin/regras/${id}`, { method: "PATCH", token, body });
      setEditId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao salvar regra.");
    } finally {
      setBusyId(null);
    }
  }

  async function excluir() {
    if (!delAlvo) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/admin/regras/${delAlvo.id}`, { method: "DELETE", token });
      setDelAlvo(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao excluir regra.");
    } finally {
      setDeleting(false);
    }
  }

  const semTipos = tipos.length === 0;

  return (
    <>
      <PageHead
        eyebrow="Cadastros"
        title="Regras de auditoria"
        subtitle="Critério de validade de cada tipo de documento, aplicado pelo motor de IA na auditoria (F2)."
      />

      {semTipos && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(201,138,18,0.12)] px-3 py-2 text-sm text-warn">
          Carregando tipos de documento…
        </p>
      )}

      {/* ── Adicionar regra ──────────────────────────────────────────────── */}
      <GlassCard
        as="form"
        onSubmit={criar}
        className="mb-5 grid gap-3 p-4 md:grid-cols-[260px_1fr_auto] md:items-start"
      >
        <div>
          <span className="ds-label">Tipo de documento</span>
          <Select
            value={novoTipo}
            onChange={setNovoTipo}
            placeholder="Selecione o tipo…"
            ariaLabel="Tipo de documento da nova regra"
            options={tipos.map((t) => ({ value: t.id, label: t.nome }))}
          />
        </div>
        <div>
          <span className="ds-label">Critério de validade</span>
          <textarea
            className="ds-input min-h-[44px] resize-y"
            placeholder="Ex.: documento legível, dentro da validade, nome e CPF conferem com o cadastro."
            value={novaDescricao}
            onChange={(e) => setNovaDescricao(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={saving || !novoTipo || !novaDescricao.trim()}
          className="self-end py-2.5"
        >
          {saving ? "Adicionando…" : "Adicionar"}
        </Button>
      </GlassCard>

      {/* ── Filtro por tipo ──────────────────────────────────────────────── */}
      <GlassCard className="mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[260px]">
          <span className="ds-label">Filtrar por tipo</span>
          <Select
            value={filtroTipo}
            onChange={setFiltroTipo}
            placeholder="Todos os tipos"
            ariaLabel="Filtrar regras por tipo de documento"
            options={[
              { value: "", label: "Todos os tipos" },
              ...tipos.map((t) => ({ value: t.id, label: t.nome })),
            ]}
          />
        </div>
      </GlassCard>

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* ── Lista de regras ──────────────────────────────────────────────── */}
      <GlassCard className="overflow-hidden p-2">
        <table className="ds-table">
          <thead>
            <tr>
              <ColunaOrdenavel as="th" ord={ord} chave="documento" className="w-[220px]">
                Documento
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="criterio">
                Critério
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="estado" className="w-[130px]">
                Estado
              </ColunaOrdenavel>
              <th className="w-[160px]" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-faint">
                  Carregando regras…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-faint">
                  {filtroTipo ? "Nenhuma regra para este tipo." : "Nenhuma regra cadastrada."}
                </td>
              </tr>
            ) : (
              ord.itens.map((r) => {
                const editando = editId === r.id;
                const busy = busyId === r.id;
                return (
                  <tr key={r.id}>
                    <td className="align-top">
                      {nomePorTipo.get(r.tipoDocumentoId) ?? r.tipoDocumentoId}
                    </td>
                    <td className="align-top">
                      {editando ? (
                        <textarea
                          className="ds-input min-h-[60px] resize-y"
                          value={editTexto}
                          onChange={(e) => setEditTexto(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <span className="text-[13.5px] text-text">{r.descricaoRegra}</span>
                      )}
                    </td>
                    <td className="align-top">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => patch(r.id, { ativo: !r.ativo })}
                        title={r.ativo ? "Desativar regra" : "Ativar regra"}
                        aria-pressed={r.ativo}
                        className="disabled:opacity-50"
                      >
                        <Pill tone={r.ativo ? "ok" : "nt"}>{r.ativo ? "Ativa" : "Inativa"}</Pill>
                      </button>
                    </td>
                    <td className="align-top text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {editando ? (
                          <>
                            <button
                              type="button"
                              disabled={busy || !editTexto.trim()}
                              onClick={() => patch(r.id, { descricaoRegra: editTexto.trim() })}
                              className="grid h-8 w-8 place-items-center rounded-lg text-ok transition hover:bg-[var(--surface-2)] disabled:opacity-50"
                              title="Salvar"
                              aria-label="Salvar regra"
                            >
                              <Icon name="check" className="h-[18px] w-[18px]" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditId(null)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)]"
                              title="Cancelar"
                              aria-label="Cancelar edição"
                            >
                              <Icon name="x" className="h-[18px] w-[18px]" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(r.id);
                                setEditTexto(r.descricaoRegra);
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                              title="Editar texto"
                              aria-label="Editar regra"
                            >
                              <Icon name="pen" className="h-[17px] w-[17px]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDelAlvo(r)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-danger"
                              title="Excluir regra"
                              aria-label="Excluir regra"
                            >
                              <Icon name="trash" className="h-[17px] w-[17px]" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </GlassCard>

      <ConfirmDialog
        open={Boolean(delAlvo)}
        title="Excluir regra"
        message={
          delAlvo
            ? `Excluir a regra de "${nomePorTipo.get(delAlvo.tipoDocumentoId) ?? "documento"}"? Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        tone="danger"
        busy={deleting}
        onConfirm={excluir}
        onCancel={() => setDelAlvo(null)}
      />
    </>
  );
}
