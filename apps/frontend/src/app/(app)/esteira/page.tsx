"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AdmissaoDetalheModal } from "@/components/esteira/AdmissaoDetalheModal";
import { AceiteLiberacaoModal, type AceiteLiberacao } from "@/components/esteira/AceiteLiberacaoModal";

// ── Contrato de API (F8/F7) ─────────────────────────────────────────────────
const ABAS = [
  { label: "Auditoria", rota: "auditoria" },
  { label: "Exame", rota: "exame" },
  { label: "Cadastro / Contrato", rota: "cadastro" },
] as const;

interface StatusCat {
  codigo: string;
  rotulo: string;
  ordem: number;
  conclui: boolean;
}
interface EsteiraItem {
  admissaoId: string;
  frenteId: string;
  candidatoNome: string;
  codCliente: string;
  clienteRazao: string;
  cargoNome: string;
  status: string;
  concluida: boolean;
  dataInicio: string | null;
  dataConclusao: string | null;
  dataAdmissao: string | null;
  sinalizador: string;
  asoAnexado?: boolean;
  disponivel?: boolean;
  obrigatoriosPendentes?: boolean;
}
interface EsteiraResp {
  items: EsteiraItem[];
  kpis: { porStatus: Record<string, number>; total: number };
  statusCatalogo: StatusCat[];
}
interface ClienteLite {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao?: string | null;
  cnpj?: string | null;
}

// Status que sempre denotam fim negativo da frente (tom de inconformidade).
const STATUS_DANGER = new Set(["DECLINOU", "CANCELADO"]);

// Tom da pill derivado do status + catálogo (2C item 7): aguardando reenvio em laranja (distinto
// do amarelo de análise pendente); conclui→ok; declinou/cancelado→danger; demais pendentes→warn.
function statusTone(codigo: string, cat?: StatusCat): PillTone {
  if (STATUS_DANGER.has(codigo)) return "dg";
  if (codigo === "AGUARDA_REENVIO") return "or";
  if (cat?.conclui) return "ok";
  if (cat) return "wn";
  return "nt";
}
const TONE_VAR: Record<PillTone, string | undefined> = {
  ok: "var(--ok)",
  wn: "var(--warn)",
  or: "var(--warn-2)",
  dg: "var(--danger)",
  nt: undefined,
};

function fmtData(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "—" : dt.toLocaleDateString("pt-BR");
}
// Data de admissão é um `date` (YYYY-MM-DD) — formata por partes p/ não sofrer deslocamento de fuso.
function fmtDataAdmissao(d?: string | null): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fmtData(d);
}

type DialogState =
  | {
      kind: "conclui" | "reversao" | "aptoSemAso" | "auditoriaIncompleta";
      frenteId: string;
      status: string;
      message: string;
    }
  | null;

export default function EsteiraPage() {
  const { token } = useAuth();
  const [aba, setAba] = useState(0);
  const rota = ABAS[aba].rota;
  const isExame = rota === "exame";
  const isCadastro = rota === "cadastro";

  // Dados da frente
  const [data, setData] = useState<EsteiraResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filtros (F7)
  const [codCliente, setCodCliente] = useState("");
  const [cliQuery, setCliQuery] = useState("");
  const [cliResults, setCliResults] = useState<ClienteLite[]>([]);
  const [cliOpen, setCliOpen] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Busca por candidato (item 3) — nome ou CPF; revela também concluídos (item 1).
  const [candQuery, setCandQuery] = useState("");
  const [candDebounced, setCandDebounced] = useState("");

  // Operação de status
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Modal de visualização rápida (item 4)
  const [viewId, setViewId] = useState<string | null>(null);

  const catMap = useMemo(() => {
    const m = new Map<string, StatusCat>();
    for (const c of data?.statusCatalogo ?? []) m.set(c.codigo, c);
    return m;
  }, [data]);

  // Debounce da busca por candidato (~350ms).
  useEffect(() => {
    const h = setTimeout(() => setCandDebounced(candQuery.trim()), 350);
    return () => clearTimeout(h);
  }, [candQuery]);

  // ── Carga da fila com os filtros atuais ─────────────────────────────────────
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    const qs = new URLSearchParams();
    if (codCliente) qs.set("codCliente", codCliente);
    if (statusFiltro) qs.set("status", statusFiltro);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (candDebounced) qs.set("q", candDebounced);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    try {
      const resp = await apiFetch<EsteiraResp>(`/esteira/${rota}${suffix}`, { token });
      setData(resp);
    } catch (e) {
      setData(null);
      setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar a frente.");
    } finally {
      setLoading(false);
    }
  }, [token, rota, codCliente, statusFiltro, from, to, candDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  // Troca de aba: o filtro de status é específico da frente — reseta para não vazar código inválido.
  function trocarAba(i: number) {
    if (i === aba) return;
    setStatusFiltro("");
    setActionError(null);
    setFlash(null);
    setAba(i);
  }

  // ── Autocomplete de cliente (debounce ~300ms) ───────────────────────────────
  useEffect(() => {
    const q = cliQuery.trim();
    if (!token || !q || !cliOpen) {
      setCliResults([]);
      return;
    }
    const handle = setTimeout(() => {
      apiFetch<ClienteLite[]>(`/catalogos/clientes?q=${encodeURIComponent(q)}`, { token })
        .then(setCliResults)
        .catch(() => setCliResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [cliQuery, token, cliOpen]);

  function selecionarCliente(c: ClienteLite) {
    setCodCliente(c.codCliente);
    setCliQuery(c.razaoSocial);
    setCliOpen(false);
    setCliResults([]);
  }
  function limparFiltros() {
    setCodCliente("");
    setCliQuery("");
    setCliResults([]);
    setCliOpen(false);
    setStatusFiltro("");
    setFrom("");
    setTo("");
    setCandQuery("");
  }
  const temFiltro = Boolean(codCliente || statusFiltro || from || to || candQuery);

  // ── PATCH de status (avanço/reversão/aceite) ────────────────────────────────
  const doPatch = useCallback(
    async (frenteId: string, status: string, confirmar: boolean, liberacao?: AceiteLiberacao) => {
      setActingId(frenteId);
      setActionError(null);
      try {
        const resp = await apiFetch<{ ncCriada?: string | null }>(
          `/esteira/frentes/${frenteId}/status`,
          {
            method: "PATCH",
            token,
            body: {
              status,
              confirmar,
              liberacaoDiretoria: liberacao?.diretoria,
              liberacaoMotivo: liberacao?.motivo || undefined,
            },
          },
        );
        setDialog(null);
        if (resp?.ncCriada) {
          setFlash(
            liberacao?.diretoria
              ? `Liberação por diretoria enviada à supervisão (${resp.ncCriada}).`
              : `Não conformidade registrada (${resp.ncCriada}).`,
          );
        }
        await load();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const reason = (e.data as { reason?: string } | undefined)?.reason;
          // aptoSemAso / auditoriaIncompleta = aceite com pendência (Via 1/2); reversao = reabrir cadastro.
          const kind =
            reason === "aptoSemAso"
              ? "aptoSemAso"
              : reason === "auditoriaIncompleta"
                ? "auditoriaIncompleta"
                : "reversao";
          setDialog({ kind, frenteId, status, message: e.message });
        } else {
          setDialog(null);
          setActionError(e instanceof ApiError ? e.message : "Falha ao mudar o status.");
        }
      } finally {
        setActingId(null);
      }
    },
    [token, load],
  );

  function onSelectStatus(item: EsteiraItem, novo: string) {
    if (!novo || novo === item.status) return;
    setActionError(null);
    // Exame → "apto" sem ASO anexado: aceite com escolha Via 1/Via 2 (item 2 — gatilho da NC-2).
    if (isExame && novo === "APTO" && !item.asoAnexado) {
      setDialog({
        kind: "aptoSemAso",
        frenteId: item.frenteId,
        status: novo,
        message: "Estou ciente que estou marcando este candidato como apto sem o ASO anexado.",
      });
      return;
    }
    // Auditoria → "análise ok" com obrigatórios pendentes: aceite com escolha Via 1/Via 2 (NC-1).
    if (rota === "auditoria" && novo === "ANALISE_OK" && item.obrigatoriosPendentes) {
      setDialog({
        kind: "auditoriaIncompleta",
        frenteId: item.frenteId,
        status: novo,
        message: "Concluir a Auditoria com documentos obrigatórios pendentes na régua.",
      });
      return;
    }
    const cat = catMap.get(novo);
    if (cat?.conclui) {
      // Confirmação leve antes de concluir a frente (pode liberar o Cadastro).
      setDialog({
        kind: "conclui",
        frenteId: item.frenteId,
        status: novo,
        message: "Concluir esta frente? Pode liberar o Cadastro do candidato.",
      });
    } else {
      void doPatch(item.frenteId, novo, false);
    }
  }

  // ── Upload de ASO (Exame) — multipart, fora do apiFetch (JSON) ───────────────
  async function uploadAso(item: EsteiraItem, file: File) {
    setActingId(item.frenteId);
    setActionError(null);
    setFlash(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/esteira/exame/${item.admissaoId}/aso`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        let msg = "Falha ao anexar o ASO.";
        try {
          const j = txt ? JSON.parse(txt) : null;
          const raw = j?.message ?? j?.error;
          if (raw) msg = Array.isArray(raw) ? raw.join(", ") : String(raw);
        } catch {
          /* corpo não-JSON — mantém a mensagem padrão */
        }
        throw new Error(msg);
      }
      setFlash(`ASO anexado para ${item.candidatoNome}.`);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Falha ao anexar o ASO.");
    } finally {
      setActingId(null);
    }
  }

  function confirmarDialog() {
    if (!dialog) return;
    // conclusão simples não exige aceite; reversão e "apto sem ASO" sim (confirmar=true).
    void doPatch(dialog.frenteId, dialog.status, dialog.kind !== "conclui");
  }

  const items = data?.items ?? [];
  const statusCatalogo = data?.statusCatalogo ?? [];
  // KPIs (item 5/6): "Total na fila" + um card por status EM ANDAMENTO (exclui o de conclusão, que
  // sai da fila). Cada card de status filtra a lista ao clicar (toggle).
  const kpiStatus = statusCatalogo.filter((c) => !c.conclui);
  const gridCols = isExame
    ? "minmax(0,1.5fr) minmax(0,1fr) minmax(0,0.9fr) 100px 96px 196px 40px"
    : "minmax(0,1.6fr) minmax(0,1.1fr) minmax(0,0.95fr) 104px 112px 168px 40px";

  function toggleStatusKpi(code: string) {
    setStatusFiltro((cur) => (cur === code ? "" : code));
  }

  return (
    <>
      <PageHead
        eyebrow="Esteira admissional"
        title="Faróis por frente"
        subtitle="Cada frente opera de forma independente. Todos os consultores enxergam todas (F8/F12)."
      />

      {/* ── Abas ─────────────────────────────────────────────────────────── */}
      <div className="mb-[22px] flex gap-2">
        {ABAS.map((a, i) => (
          <button
            key={a.rota}
            type="button"
            className={cn("tab", i === aba && "active")}
            onClick={() => trocarAba(i)}
          >
            <span className="dot" />
            {a.label}
          </button>
        ))}
      </div>

      {/* ── KPIs por frente (reais; clicáveis = filtro, item 5) ──────────── */}
      <div className="mb-[18px] grid grid-cols-2 gap-[14px] sm:grid-cols-3 xl:grid-cols-5">
        <GlassCard className="fk">
          <div className="num">{loading && !data ? "—" : data?.kpis.total ?? 0}</div>
          <div className="lbl">Total na fila</div>
        </GlassCard>
        {kpiStatus.map((c) => {
          const tone = statusTone(c.codigo, c);
          const color = TONE_VAR[tone];
          const ativo = statusFiltro === c.codigo;
          return (
            <GlassCard
              as="button"
              key={c.codigo}
              className={cn(
                "fk text-left transition hover:bg-[var(--surface-2)]",
                ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
              )}
              onClick={() => toggleStatusKpi(c.codigo)}
              aria-pressed={ativo}
              title={ativo ? "Remover filtro" : `Filtrar por ${c.rotulo}`}
            >
              <div className="num" style={color ? { color } : undefined}>
                {data?.kpis.porStatus[c.codigo] ?? 0}
              </div>
              <div className="lbl flex items-center gap-1.5">
                {c.rotulo}
                {ativo && <Icon name="check" className="h-3 w-3 text-accent" />}
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* ── Filtros (F7) ─────────────────────────────────────────────────── */}
      <GlassCard className="mb-[18px] p-4">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1.4fr_1.1fr_0.9fr_0.9fr_auto] md:items-end">
          {/* Candidato (nome ou CPF) — item 3 */}
          <div>
            <span className="ds-label">Candidato</span>
            <input
              className="ds-input"
              placeholder="Nome ou CPF…"
              value={candQuery}
              onChange={(e) => setCandQuery(e.target.value)}
            />
          </div>

          {/* Cliente (autocomplete) */}
          <div className="relative">
            <span className="ds-label">Cliente</span>
            <input
              className="ds-input"
              placeholder="Buscar cliente…"
              value={cliQuery}
              onChange={(e) => {
                setCliQuery(e.target.value);
                setCliOpen(true);
                if (codCliente) setCodCliente("");
              }}
              onFocus={() => setCliOpen(true)}
              onBlur={() => setTimeout(() => setCliOpen(false), 150)}
            />
            {cliOpen && cliResults.length > 0 && (
              <div className="glass absolute left-0 right-0 top-[100%] z-30 mt-1 max-h-64 overflow-auto p-1.5">
                {cliResults.map((c) => (
                  <button
                    key={c.codCliente}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionarCliente(c)}
                  >
                    <span className="truncate text-[13.5px] font-semibold">{c.razaoSocial}</span>
                    <span className="truncate text-[12px] text-dim">
                      Código {c.codCliente}
                      {c.nomeOperacao ? ` · ${c.nomeOperacao}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status (do catálogo da aba) — seletor estilizado (item 8) */}
          <div>
            <span className="ds-label">Status</span>
            <Select
              ariaLabel="Filtrar por status"
              value={statusFiltro}
              onChange={setStatusFiltro}
              placeholder="Todos"
              options={[
                { value: "", label: "Todos" },
                ...statusCatalogo.map((c) => ({
                  value: c.codigo,
                  label: c.rotulo,
                  color: TONE_VAR[statusTone(c.codigo, c)],
                })),
              ]}
            />
          </div>

          {/* Período */}
          <div>
            <span className="ds-label">De</span>
            <input
              type="date"
              className="ds-input"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <span className="ds-label">Até</span>
            <input
              type="date"
              className="ds-input"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn-secondary px-4 py-3 disabled:opacity-50"
            onClick={limparFiltros}
            disabled={!temFiltro}
          >
            Limpar
          </button>
        </div>
      </GlassCard>

      {/* ── Feedback de ação ─────────────────────────────────────────────── */}
      {actionError && (
        <p
          className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {actionError}
        </p>
      )}
      {flash && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(91,214,138,0.12)] px-3 py-2 text-sm text-ok">
          <Icon name="check" className="h-4 w-4" /> {flash}
        </p>
      )}

      {/* ── Lista / faróis ───────────────────────────────────────────────── */}
      <GlassCard className="list">
        <div className="list-head" style={{ gridTemplateColumns: gridCols }}>
          <span>Candidato</span>
          <span>Cliente</span>
          <span>Cargo</span>
          <span>Data adm.</span>
          <span>Status</span>
          <span>{isExame ? "ASO / Avanço" : "Avanço"}</span>
          <span />
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-faint">Carregando frente…</div>
        ) : loadError ? (
          <div className="px-4 py-10 text-center text-sm text-danger">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-faint">
            {temFiltro
              ? "Nenhum candidato nesta frente com os filtros atuais."
              : "Nenhum candidato em andamento nesta frente."}
          </div>
        ) : (
          items.map((item) => {
            const tone = statusTone(item.status, catMap.get(item.status));
            const rotulo = catMap.get(item.status)?.rotulo ?? item.status;
            const acting = actingId === item.frenteId;
            const pausado = isCadastro && item.disponivel === false;
            return (
              <div key={item.frenteId} className="row" style={{ gridTemplateColumns: gridCols }}>
                <div className="min-w-0">
                  <div className="nm truncate">{item.candidatoNome}</div>
                  <div className="meta truncate">
                    {item.concluida
                      ? `Concluída em ${fmtData(item.dataConclusao)}`
                      : `Aberta em ${fmtData(item.dataInicio)}`}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="meta truncate text-text">{item.clienteRazao}</div>
                  <div className="meta truncate">Código {item.codCliente}</div>
                </div>
                <div className="meta truncate">{item.cargoNome}</div>
                <div className="meta">{fmtDataAdmissao(item.dataAdmissao)}</div>
                <div className="min-w-0">
                  <Pill tone={tone}>{rotulo}</Pill>
                </div>

                {/* Coluna de operação */}
                <div className="flex min-w-0 items-center gap-2">
                  {pausado ? (
                    <span
                      className="inline-flex items-center gap-2 text-[12px] text-faint"
                      title="O Cadastro reabre sozinho quando Auditoria e Exame concluírem. O trabalho fica preservado."
                    >
                      <Icon name="clock" className="h-4 w-4 flex-none" />
                      Pausado — aguarda Auditoria + Exame
                    </span>
                  ) : (
                    <Select
                      className="min-w-0 flex-1"
                      ariaLabel={`Mudar status de ${item.candidatoNome}`}
                      disabled={acting}
                      value={item.status}
                      onChange={(novo) => onSelectStatus(item, novo)}
                      options={statusCatalogo.map((c) => ({
                        value: c.codigo,
                        label: c.rotulo,
                        color: TONE_VAR[statusTone(c.codigo, c)],
                      }))}
                    />
                  )}

                  {isExame && (
                    <label
                      className={cn(
                        "flex flex-none cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] font-semibold transition hover:bg-[var(--surface-2)]",
                        item.asoAnexado ? "text-ok" : "text-dim",
                        acting && "pointer-events-none opacity-60",
                      )}
                      title={item.asoAnexado ? "ASO anexado — reanexar" : "Anexar ASO"}
                    >
                      <Icon name={item.asoAnexado ? "check" : "doc"} className="h-4 w-4" />
                      {item.asoAnexado ? "Anexado" : "ASO"}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadAso(item, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Visualização rápida (item 4) */}
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                  title="Ver ficha (somente leitura)"
                  aria-label={`Ver ficha de ${item.candidatoNome}`}
                  onClick={() => setViewId(item.admissaoId)}
                >
                  <Icon name="eye" className="h-[18px] w-[18px]" />
                </button>
              </div>
            );
          })
        )}
      </GlassCard>

      {/* ── Diálogos ─────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={dialog?.kind === "conclui"}
        title="Concluir frente"
        message={dialog?.message ?? ""}
        confirmLabel="Concluir"
        busy={Boolean(dialog && actingId === dialog.frenteId)}
        onConfirm={confirmarDialog}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "reversao"}
        title="Reabrir pendência"
        message={dialog?.message ?? ""}
        confirmLabel="Confirmar reversão"
        tone="danger"
        busy={Boolean(dialog && actingId === dialog.frenteId)}
        onConfirm={confirmarDialog}
        onCancel={() => setDialog(null)}
      />

      {/* Aceite COM PENDÊNCIA + escolha Via 1/Via 2 (apto sem ASO / auditoria incompleta) */}
      {(dialog?.kind === "aptoSemAso" || dialog?.kind === "auditoriaIncompleta") && (
        <AceiteLiberacaoModal
          title={dialog.kind === "aptoSemAso" ? "Apto sem ASO" : "Auditoria com pendência"}
          message={dialog.message}
          busy={actingId === dialog.frenteId}
          onConfirm={(l) => doPatch(dialog.frenteId, dialog.status, true, l)}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* ── Modal de visualização rápida (item 4) ────────────────────────── */}
      {viewId && <AdmissaoDetalheModal admissaoId={viewId} onClose={() => setViewId(null)} />}
    </>
  );
}
