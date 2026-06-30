"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuditoriaStatus, Origem, ResultadoAuditoria } from "@ea/shared-types";
import { apiFetch, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { PendenciasBadge } from "@/components/ui/PendenciasBadge";
import { OrigemBadge } from "@/components/ui/OrigemBadge";
import { Icon } from "@/components/ui/Icon";
import { GoogleDriveLogo } from "@/components/ui/GoogleDriveLogo";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AdmissaoDetalheModal } from "@/components/esteira/AdmissaoDetalheModal";
import {
  AceiteLiberacaoModal,
  type AceiteLiberacao,
} from "@/components/esteira/AceiteLiberacaoModal";
import { AuditoriaDocsModal } from "@/components/esteira/AuditoriaDocsModal";
import { PendenciasModal } from "@/components/gerenciador/PendenciasModal";
import { EditAdmissaoModal } from "@/components/gerenciador/EditAdmissaoModal";

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
  origem: Origem;
  sinalizador: string;
  asoAnexado?: boolean;
  disponivel?: boolean;
  obrigatoriosPendentes?: boolean;
  temPendencias?: boolean;
  // Preenchido quando a régua fecha e o prontuário é arquivado no Drive (T4 / Fase 4).
  drivePastaUrl?: string | null;
  driveAsoUrl?: string | null;
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
  in: "var(--accent)",
};

// Veredito da IA do ASO (T3) → tom + rótulo da pill.
const ASO_TONE: Record<AuditoriaStatus, PillTone> = {
  VALIDADO: "ok",
  INCONFORME: "dg",
  PENDENTE: "wn",
};
const ASO_ROTULO: Record<AuditoriaStatus, string> = {
  VALIDADO: "Validado",
  INCONFORME: "Inconforme",
  PENDENTE: "Pendente",
};
const ASO_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** Spinner inline (Tailwind animate-spin), herda a cor do texto. */
function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

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

type DialogState = {
  kind: "conclui" | "reversao" | "aptoSemAso" | "auditoriaIncompleta" | "passagem";
  frenteId: string;
  status: string;
  message: string;
} | null;

export default function EsteiraPage() {
  const { token } = useAuth();
  const [aba, setAba] = useState(0);
  const rota = ABAS[aba].rota;
  const isExame = rota === "exame";
  const isCadastro = rota === "cadastro";
  const isAuditoria = rota === "auditoria";

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
  // Modal de auditoria documental por IA (Fase 4 / F2) — só na aba Auditoria.
  const [auditId, setAuditId] = useState<string | null>(null);
  // ASO (T3) — upload único que anexa E audita na IA. tipoDocumentoId do ASO + veredito por frente.
  const [asoTipoId, setAsoTipoId] = useState<string | null>(null);
  const [asoResult, setAsoResult] = useState<Record<string, ResultadoAuditoria>>({});
  // Pendências obrigatórias (item 4) — badge clicável → modal → preencher (reusa o padrão do Gerenciador).
  const [pendItem, setPendItem] = useState<EsteiraItem | null>(null);
  const [editItem, setEditItem] = useState<EsteiraItem | null>(null);
  const [editFiltro, setEditFiltro] = useState<string[] | undefined>(undefined);

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

  // tipoDocumentoId do ASO (T3) — uma vez; usado no upload+auditoria unificados da aba Exame.
  useEffect(() => {
    if (!token) return;
    apiFetch<{ id: string; codigo: string }[]>("/catalogos/tipos-documento", { token })
      .then((tipos) => setAsoTipoId(tipos.find((t) => t.codigo === "ASO")?.id ?? null))
      .catch(() => setAsoTipoId(null));
  }, [token]);

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
    async (
      frenteId: string,
      status: string,
      confirmar: boolean,
      liberacao?: AceiteLiberacao,
      aceitePassagem = false,
    ) => {
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
              aceitePassagem,
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
          // aptoSemAso/auditoriaIncompleta = aceite com Via 1/2; passagem = aceite de pendências (S3);
          // reversao = reabrir cadastro.
          const kind =
            reason === "aptoSemAso"
              ? "aptoSemAso"
              : reason === "auditoriaIncompleta"
                ? "auditoriaIncompleta"
                : reason === "passagemComPendencia"
                  ? "passagem"
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
    // Avançar (concluir Auditoria/Exame) com campos obrigatórios pendentes: aceite de passagem (S3).
    const concluindo =
      (rota === "auditoria" && novo === "ANALISE_OK") || (isExame && novo === "APTO");
    if (concluindo && item.temPendencias) {
      setDialog({
        kind: "passagem",
        frenteId: item.frenteId,
        status: novo,
        message:
          "Estou ciente que estou avançando esta admissão com pendências obrigatórias não preenchidas. Fica registrado na trilha de passagem.",
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

  // ── ASO (T3): upload ÚNICO que anexa E audita na IA ──────────────────────────
  // O endpoint de auditoria recebe o arquivo (efêmero), retorna o veredito e marca o ASO como
  // ENTREGUE quando VALIDADO (reflete em asoAnexado após o reload). Não há mais botão separado.
  async function uploadEAuditarAso(item: EsteiraItem, file: File) {
    if (!asoTipoId) {
      setActionError("Tipo de documento ASO não encontrado no catálogo.");
      return;
    }
    setActingId(item.frenteId);
    setActionError(null);
    setFlash(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipoDocumentoId", asoTipoId);
      const resp = await apiUpload<{ resultado: ResultadoAuditoria }>(
        `/esteira/auditoria/${item.admissaoId}/documento`,
        fd,
        token,
      );
      setAsoResult((m) => ({ ...m, [item.frenteId]: resp.resultado }));
      setFlash(
        `ASO de ${item.candidatoNome} auditado: ${ASO_ROTULO[resp.resultado.status]}.`,
      );
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Falha ao anexar e auditar o ASO.");
    } finally {
      setActingId(null);
    }
  }

  function confirmarDialog() {
    if (!dialog) return;
    // conclusão simples não exige aceite; reversão/apto-sem-ASO/passagem sim. O aceite também marca
    // aceitePassagem=true (registra a trilha de passagem se houver pendências — S3).
    void doPatch(
      dialog.frenteId,
      dialog.status,
      dialog.kind !== "conclui",
      undefined,
      dialog.kind !== "conclui",
    );
  }

  const items = data?.items ?? [];
  const statusCatalogo = data?.statusCatalogo ?? [];
  // KPIs (item 5/6): "Total na fila" + um card por status EM ANDAMENTO (exclui o de conclusão, que
  // sai da fila). Cada card de status filtra a lista ao clicar (toggle).
  const kpiStatus = statusCatalogo.filter((c) => !c.conclui);
  // Colunas: Candidato · Cliente · Cargo · Data adm. · Status · Operação · olho. As de status/operação
  // recebem largura suficiente (pills não truncam; coluna de operação comporta Select + ações) e o
  // espaçamento fica equilibrado entre as abas (T1c).
  const gridCols = isExame
    ? "minmax(0,1.5fr) minmax(0,1fr) minmax(0,0.9fr) 104px 124px 340px 40px"
    : isAuditoria
      ? "minmax(0,1.5fr) minmax(0,1fr) minmax(0,0.9fr) 104px 124px 280px 40px"
      : "minmax(0,1.6fr) minmax(0,1.1fr) minmax(0,0.95fr) 108px 128px 176px 40px";

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
          <div className="num">{loading && !data ? "—" : (data?.kpis.total ?? 0)}</div>
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
          <span>{isExame ? "ASO / Avanço" : isAuditoria ? "Avanço / Auditoria" : "Avanço"}</span>
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
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="nm truncate">{item.candidatoNome}</span>
                    <OrigemBadge origem={item.origem} className="flex-none" />
                  </div>
                  <div className="meta truncate">
                    {item.concluida
                      ? `Concluída em ${fmtData(item.dataConclusao)}`
                      : `Aberta em ${fmtData(item.dataInicio)}`}
                  </div>
                  {item.temPendencias && (
                    <PendenciasBadge
                      tone="wn"
                      label="Pendências Obrig."
                      className="mt-1"
                      onClick={() => setPendItem(item)}
                    />
                  )}
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
                <div className="flex min-w-0 flex-col gap-1.5">
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

                    {/* ASO (T3): upload ÚNICO → anexa + audita na IA automaticamente */}
                    {isExame && (
                      <label
                        className={cn(
                          "flex flex-none cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] font-semibold transition hover:bg-[var(--surface-2)]",
                          item.asoAnexado ? "text-ok" : "text-dim",
                          (acting || !asoTipoId) && "pointer-events-none opacity-60",
                        )}
                        title={
                          item.asoAnexado
                            ? "ASO anexado — reanexar e reauditar na IA"
                            : "Anexar ASO (audita na IA automaticamente)"
                        }
                      >
                        {acting ? (
                          <Spinner />
                        ) : (
                          <Icon name={item.asoAnexado ? "check" : "doc"} className="h-4 w-4" />
                        )}
                        {acting ? "Auditando…" : item.asoAnexado ? "Anexado" : "ASO"}
                        <input
                          type="file"
                          accept={ASO_ACCEPT}
                          className="hidden"
                          disabled={acting || !asoTipoId}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadEAuditarAso(item, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}

                    {isAuditoria && (
                      <button
                        type="button"
                        className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                        title="Auditar documentos com IA"
                        onClick={() => setAuditId(item.admissaoId)}
                      >
                        <Icon name="doc" className="h-4 w-4" />
                        Auditar
                      </button>
                    )}

                    {/* Link do prontuário no Drive (T4) — só após a régua fechar; pasta ou ASO */}
                    {isAuditoria && (item.drivePastaUrl || item.driveAsoUrl) && (
                      <a
                        href={item.drivePastaUrl || item.driveAsoUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] transition hover:bg-[var(--surface-2)]"
                        title="Abrir prontuário no Google Drive"
                        aria-label={`Abrir prontuário de ${item.candidatoNome} no Google Drive`}
                      >
                        <GoogleDriveLogo className="h-[18px] w-[18px]" />
                      </a>
                    )}
                  </div>

                  {/* Veredito da IA do ASO (T3) — badge + motivo abaixo do campo */}
                  {isExame && asoResult[item.frenteId] && (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Pill tone={ASO_TONE[asoResult[item.frenteId].status]}>
                        {ASO_ROTULO[asoResult[item.frenteId].status]}
                      </Pill>
                      {asoResult[item.frenteId].motivo && (
                        <span
                          className={cn(
                            "min-w-0 text-[12px]",
                            asoResult[item.frenteId].status === "VALIDADO"
                              ? "text-ok"
                              : asoResult[item.frenteId].status === "INCONFORME"
                                ? "text-danger"
                                : "text-warn",
                          )}
                        >
                          {asoResult[item.frenteId].motivo}
                        </span>
                      )}
                    </div>
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

      {/* S3 — aceite de avanço com pendências obrigatórias (gera trilha de passagem) */}
      <ConfirmDialog
        open={dialog?.kind === "passagem"}
        title="Avançar com pendências?"
        message={dialog?.message ?? ""}
        confirmLabel="Estou ciente — avançar"
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
          onConfirm={(l) => doPatch(dialog.frenteId, dialog.status, true, l, true)}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* ── Modal de visualização rápida (item 4) ────────────────────────── */}
      {viewId && <AdmissaoDetalheModal admissaoId={viewId} onClose={() => setViewId(null)} />}

      {/* ── Modal de auditoria documental por IA (Fase 4 / F2) ────────────── */}
      {auditId && (
        <AuditoriaDocsModal
          admissaoId={auditId}
          onClose={(mudou) => {
            setAuditId(null);
            if (mudou) void load();
          }}
        />
      )}

      {/* ── Pendências obrigatórias (item 4) — mesmo padrão do Gerenciador ── */}
      {pendItem && (
        <PendenciasModal
          admissaoId={pendItem.admissaoId}
          candidatoNome={pendItem.candidatoNome}
          onClose={() => setPendItem(null)}
          onPreencher={(campos) => {
            setEditItem(pendItem);
            setEditFiltro(campos);
            setPendItem(null);
          }}
        />
      )}
      {editItem && (
        <EditAdmissaoModal
          admissaoId={editItem.admissaoId}
          candidatoNome={editItem.candidatoNome}
          camposFiltro={editFiltro}
          onClose={() => {
            setEditItem(null);
            setEditFiltro(undefined);
          }}
          onSaved={(msg) => {
            setEditItem(null);
            setEditFiltro(undefined);
            setFlash(msg);
            void load();
          }}
        />
      )}
    </>
  );
}
