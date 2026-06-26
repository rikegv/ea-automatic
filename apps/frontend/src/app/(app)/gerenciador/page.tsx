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
import { EditAdmissaoModal } from "@/components/gerenciador/EditAdmissaoModal";

interface AdmRow {
  admissaoId: string;
  candidatoNome: string;
  codCliente: string;
  clienteOperacao: string | null;
  clienteRazao: string;
  cargoNome: string;
  tipoContrato: string | null;
  dataAdmissao: string | null;
  farolGlobal: string;
  sinalizador: string;
  concluido: boolean;
  frentes: Record<string, { status: string; rotulo: string; concluida: boolean }>;
}
interface ListResp {
  items: AdmRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  tiposContrato: string[];
  kpis: { total: number; ativos: number; concluidos: number; declinados: number };
}
interface ClienteLite {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao?: string | null;
}
interface CargoLite {
  id: string;
  nome: string;
}

const FAROL: Record<string, { tone: PillTone; label: string }> = {
  ATIVO: { tone: "in", label: "Ativo" },
  DECLINOU: { tone: "dg", label: "Declinou" },
  RESCISAO: { tone: "or", label: "Rescisão" },
  BANCO_PAUSADA: { tone: "nt", label: "Banco / pausada" },
};
const SINAL: Record<string, { tone: PillTone; label: string }> = {
  OK: { tone: "ok", label: "Completo" },
  PARCIAL: { tone: "wn", label: "Parcial" },
  PENDENTE: { tone: "nt", label: "Pendente" },
  INCONFORMIDADE: { tone: "dg", label: "Inconformidade" },
  COMPETENCIAS: { tone: "nt", label: "Competências" },
};
const SINAL_OPTS = [
  { value: "", label: "Todos" },
  ...Object.entries(SINAL).map(([value, v]) => ({ value, label: v.label })),
];
const FAROL_OPTS = [
  { value: "", label: "Todos" },
  ...Object.entries(FAROL).map(([value, v]) => ({ value, label: v.label })),
];

function fmtDataAdmissao(d?: string | null): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** Tom da pill de uma frente (mesma leitura da Esteira). */
function frenteTone(f?: { status: string; concluida: boolean }): PillTone {
  if (!f) return "nt";
  if (f.concluida) return "ok";
  if (f.status === "DECLINOU" || f.status === "CANCELADO") return "dg";
  if (f.status === "AGUARDA_REENVIO") return "or";
  return "wn";
}

// 11 colunas (com as 3 frentes — G4a). Tabela rola horizontalmente.
const GRID =
  "170px 150px 140px 100px 92px 128px 104px 128px 104px 134px 96px";
const GRID_MIN = "min-w-[1350px]";

export default function GerenciadorPage() {
  const { token, isAdmin } = useAuth();

  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtros
  const [candQuery, setCandQuery] = useState("");
  const [q, setQ] = useState("");
  const [codCliente, setCodCliente] = useState("");
  const [cliQuery, setCliQuery] = useState("");
  const [cliResults, setCliResults] = useState<ClienteLite[]>([]);
  const [cliOpen, setCliOpen] = useState(false);
  const [cargoId, setCargoId] = useState("");
  const [cargos, setCargos] = useState<CargoLite[]>([]);
  const [tipoContrato, setTipoContrato] = useState("");
  const [farol, setFarol] = useState("");
  const [sinalizador, setSinalizador] = useState("");
  const [concluido, setConcluido] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Modais
  const [viewId, setViewId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<AdmRow | null>(null);
  const [delRow, setDelRow] = useState<AdmRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // catálogo de cargos (uma vez)
  useEffect(() => {
    if (!token) return;
    apiFetch<CargoLite[]>("/catalogos/cargos", { token })
      .then(setCargos)
      .catch(() => setCargos([]));
  }, [token]);

  // debounce da busca global
  useEffect(() => {
    const h = setTimeout(() => {
      setQ(candQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(h);
  }, [candQuery]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (codCliente) qs.set("codCliente", codCliente);
    if (cargoId) qs.set("cargoId", cargoId);
    if (tipoContrato) qs.set("tipoContrato", tipoContrato);
    if (farol) qs.set("farol", farol);
    if (sinalizador) qs.set("sinalizador", sinalizador);
    if (concluido) qs.set("concluido", "true");
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    try {
      const resp = await apiFetch<ListResp>(`/admissoes?${qs.toString()}`, { token });
      setData(resp);
    } catch (e) {
      setData(null);
      setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar as admissões.");
    } finally {
      setLoading(false);
    }
  }, [token, q, codCliente, cargoId, tipoContrato, farol, sinalizador, concluido, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Autocomplete de cliente
  useEffect(() => {
    const term = cliQuery.trim();
    if (!token || !term || !cliOpen) {
      setCliResults([]);
      return;
    }
    const h = setTimeout(() => {
      apiFetch<ClienteLite[]>(`/catalogos/clientes?q=${encodeURIComponent(term)}`, { token })
        .then(setCliResults)
        .catch(() => setCliResults([]));
    }, 300);
    return () => clearTimeout(h);
  }, [cliQuery, token, cliOpen]);

  // reset de página quando um filtro muda
  function reset1<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function limparFiltros() {
    setCandQuery("");
    setQ("");
    setCodCliente("");
    setCliQuery("");
    setCargoId("");
    setTipoContrato("");
    setFarol("");
    setSinalizador("");
    setConcluido(false);
    setFrom("");
    setTo("");
    setPage(1);
  }
  const temFiltro = Boolean(
    q || codCliente || cargoId || tipoContrato || farol || sinalizador || concluido || from || to,
  );

  // KPIs como filtro (radio-like): clicar aplica, clicar de novo desfaz.
  const kpiAtivo = useMemo(() => {
    if (concluido) return "concluidos";
    if (farol === "ATIVO") return "ativos";
    if (farol === "DECLINOU") return "declinados";
    if (!farol) return "total";
    return "";
  }, [farol, concluido]);

  function aplicarKpi(kpi: "total" | "ativos" | "concluidos" | "declinados") {
    setPage(1);
    if (kpi === "total") {
      setFarol("");
      setConcluido(false);
    } else if (kpi === "ativos") {
      setConcluido(false);
      setFarol((f) => (f === "ATIVO" ? "" : "ATIVO"));
    } else if (kpi === "declinados") {
      setConcluido(false);
      setFarol((f) => (f === "DECLINOU" ? "" : "DECLINOU"));
    } else {
      setFarol("");
      setConcluido((c) => !c);
    }
  }

  async function confirmarDelete() {
    if (!delRow) return;
    setDeleting(true);
    setActionError(null);
    try {
      await apiFetch(`/admissoes/${delRow.admissaoId}`, { method: "DELETE", token });
      setFlash(`Admissão de ${delRow.candidatoNome} excluída.`);
      setDelRow(null);
      if (data && data.items.length === 1 && page > 1) setPage((p) => p - 1);
      else await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Falha ao excluir.");
    } finally {
      setDeleting(false);
    }
  }

  const items = data?.items ?? [];
  const k = data?.kpis;
  const cargoOpts = useMemo(
    () => [{ value: "", label: "Todos" }, ...cargos.map((c) => ({ value: c.id, label: c.nome }))],
    [cargos],
  );
  const contratoOpts = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...(data?.tiposContrato ?? []).map((t) => ({ value: t, label: t })),
    ],
    [data],
  );

  const KpiCard = ({
    id,
    label,
    value,
    tone,
  }: {
    id: "total" | "ativos" | "concluidos" | "declinados";
    label: string;
    value: number;
    tone?: string;
  }) => {
    const ativo = kpiAtivo === id;
    return (
      <GlassCard
        as="button"
        className={cn(
          "fk text-left transition hover:bg-[var(--surface-2)]",
          ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
        )}
        onClick={() => aplicarKpi(id)}
        aria-pressed={ativo}
      >
        <div className="num" style={tone ? { color: tone } : undefined}>
          {loading && !data ? "—" : value}
        </div>
        <div className="lbl flex items-center gap-1.5">
          {label}
          {ativo && <Icon name="check" className="h-3 w-3 text-accent" />}
        </div>
      </GlassCard>
    );
  };

  return (
    <>
      <PageHead
        eyebrow="Gerenciador"
        title="Todas as admissões"
        subtitle="Tabela com busca global, filtros acumulativos e edição (F10/F7)."
      />

      {/* KPIs (clicáveis = filtro) */}
      <div className="mb-[18px] grid grid-cols-2 gap-[14px] sm:grid-cols-4">
        <KpiCard id="total" label="Total geral" value={k?.total ?? 0} />
        <KpiCard id="ativos" label="Ativos" value={k?.ativos ?? 0} tone="var(--accent)" />
        <KpiCard id="concluidos" label="Concluídos" value={k?.concluidos ?? 0} tone="var(--ok)" />
        <KpiCard id="declinados" label="Declinados" value={k?.declinados ?? 0} tone="var(--danger)" />
      </div>

      {/* Filtros */}
      <GlassCard className="mb-[18px] p-4">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1.4fr_1.2fr_1fr] md:items-end">
          {/* Busca global */}
          <div>
            <span className="ds-label">Busca (nome ou CPF)</span>
            <input
              className="ds-input"
              placeholder="Buscar candidato…"
              value={candQuery}
              onChange={(e) => setCandQuery(e.target.value)}
            />
          </div>
          {/* Cliente */}
          <div className="relative">
            <span className="ds-label">Cliente</span>
            <input
              className="ds-input"
              placeholder="Buscar cliente…"
              value={cliQuery}
              onChange={(e) => {
                setCliQuery(e.target.value);
                setCliOpen(true);
                if (codCliente) {
                  setCodCliente("");
                  setPage(1);
                }
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
                    onClick={() => {
                      setCodCliente(c.codCliente);
                      setCliQuery(c.nomeOperacao || c.razaoSocial);
                      setCliOpen(false);
                      setCliResults([]);
                      setPage(1);
                    }}
                  >
                    <span className="truncate text-[13.5px] font-semibold">
                      {c.nomeOperacao || c.razaoSocial}
                    </span>
                    <span className="truncate text-[12px] text-dim">Código {c.codCliente}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Cargo */}
          <div>
            <span className="ds-label">Cargo</span>
            <Select value={cargoId} onChange={reset1(setCargoId)} options={cargoOpts} placeholder="Todos" ariaLabel="Cargo" />
          </div>
          {/* Tipo de contrato */}
          <div>
            <span className="ds-label">Contrato</span>
            <Select value={tipoContrato} onChange={reset1(setTipoContrato)} options={contratoOpts} placeholder="Todos" ariaLabel="Tipo de contrato" />
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
          <div>
            <span className="ds-label">Status (farol)</span>
            <Select value={farol} onChange={reset1(setFarol)} options={FAROL_OPTS} placeholder="Todos" ariaLabel="Farol" />
          </div>
          <div>
            <span className="ds-label">Pendências Obrig.</span>
            <Select value={sinalizador} onChange={reset1(setSinalizador)} options={SINAL_OPTS} placeholder="Todos" ariaLabel="Sinalizador" />
          </div>
          <div>
            <span className="ds-label">De</span>
            <input type="date" className="ds-input" value={from} max={to || undefined} onChange={(e) => reset1(setFrom)(e.target.value)} />
          </div>
          <div>
            <span className="ds-label">Até</span>
            <input type="date" className="ds-input" value={to} min={from || undefined} onChange={(e) => reset1(setTo)(e.target.value)} />
          </div>
          <button type="button" className="btn-secondary px-4 py-3 disabled:opacity-50" onClick={limparFiltros} disabled={!temFiltro}>
            Limpar
          </button>
        </div>
      </GlassCard>

      {actionError && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger" role="alert">
          {actionError}
        </p>
      )}
      {flash && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(91,214,138,0.12)] px-3 py-2 text-sm text-ok">
          <Icon name="check" className="h-4 w-4" /> {flash}
        </p>
      )}

      {/* Tabela */}
      <GlassCard className="list">
        <div className="overflow-x-auto">
        <div className={GRID_MIN}>
        <div className="list-head" style={{ gridTemplateColumns: GRID }}>
          <span>Candidato</span>
          <span>Cliente</span>
          <span>Cargo</span>
          <span>Contrato</span>
          <span>Data adm.</span>
          <span>Auditoria</span>
          <span>Exame</span>
          <span>Cadastro</span>
          <span>Status</span>
          <span>Pendências Obrig.</span>
          <span>Ações</span>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-faint">Carregando…</div>
        ) : loadError ? (
          <div className="px-4 py-10 text-center text-sm text-danger">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-faint">
            {temFiltro ? "Nenhuma admissão com os filtros atuais." : "Nenhuma admissão cadastrada."}
          </div>
        ) : (
          items.map((r) => {
            const farolP = FAROL[r.farolGlobal] ?? { tone: "nt" as PillTone, label: r.farolGlobal };
            const sinalP = SINAL[r.sinalizador] ?? { tone: "nt" as PillTone, label: r.sinalizador };
            const fa = r.frentes?.AUDITORIA;
            const ex = r.frentes?.EXAME;
            const cad = r.frentes?.CADASTRO_CONTRATO;
            return (
              <div key={r.admissaoId} className="row" style={{ gridTemplateColumns: GRID }}>
                <div className="min-w-0">
                  <div className="nm truncate">{r.candidatoNome}</div>
                  {r.concluido && <div className="meta truncate text-ok">Processo concluído</div>}
                </div>
                <div className="min-w-0">
                  <div className="meta truncate text-text">{r.clienteOperacao || r.clienteRazao}</div>
                  <div className="meta truncate">Código {r.codCliente}</div>
                </div>
                <div className="meta truncate">{r.cargoNome}</div>
                <div className="meta truncate">{r.tipoContrato || "—"}</div>
                <div className="meta">{fmtDataAdmissao(r.dataAdmissao)}</div>
                <div className="min-w-0">
                  {fa ? <Pill tone={frenteTone(fa)}>{fa.rotulo}</Pill> : <span className="meta">—</span>}
                </div>
                <div className="min-w-0">
                  {ex ? <Pill tone={frenteTone(ex)}>{ex.rotulo}</Pill> : <span className="meta">—</span>}
                </div>
                <div className="min-w-0">
                  {cad ? <Pill tone={frenteTone(cad)}>{cad.rotulo}</Pill> : <span className="meta">—</span>}
                </div>
                <div className="min-w-0">
                  <Pill tone={farolP.tone}>{farolP.label}</Pill>
                </div>
                <div className="min-w-0">
                  <Pill tone={sinalP.tone}>{sinalP.label}</Pill>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                    title="Ver ficha"
                    aria-label={`Ver ${r.candidatoNome}`}
                    onClick={() => setViewId(r.admissaoId)}
                  >
                    <Icon name="eye" className="h-[17px] w-[17px]" />
                  </button>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                    title="Editar"
                    aria-label={`Editar ${r.candidatoNome}`}
                    onClick={() => setEditRow(r)}
                  >
                    <Icon name="pen" className="h-[16px] w-[16px]" />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[rgba(214,69,69,0.12)] hover:text-danger"
                      title="Excluir"
                      aria-label={`Excluir ${r.candidatoNome}`}
                      onClick={() => setDelRow(r)}
                    >
                      <Icon name="trash" className="h-[16px] w-[16px]" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        </div>
        </div>

        {/* Paginação */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
            <span className="text-[12.5px] text-dim">
              {data.total} admissõe{data.total === 1 ? "" : "s"} · página {data.page} de {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-[13px] disabled:opacity-50"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <Icon name="left" className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-[13px] disabled:opacity-50"
                disabled={page >= data.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Próxima página"
              >
                <Icon name="right" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Modais */}
      {viewId && <AdmissaoDetalheModal admissaoId={viewId} onClose={() => setViewId(null)} />}
      {editRow && (
        <EditAdmissaoModal
          admissaoId={editRow.admissaoId}
          candidatoNome={editRow.candidatoNome}
          onClose={() => setEditRow(null)}
          onSaved={(msg) => {
            setEditRow(null);
            setFlash(msg);
            void load();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(delRow)}
        title="Excluir admissão"
        message={
          delRow
            ? `Excluir a admissão de ${delRow.candidatoNome}? Remove também documentos, frentes e não conformidades vinculadas. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        tone="danger"
        busy={deleting}
        onConfirm={confirmarDelete}
        onCancel={() => setDelRow(null)}
      />
    </>
  );
}
