"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClicksignStatus, Origem } from "@ea/shared-types";
import { apiFetch, apiUpload, apiDownloadPost, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { PendenciasBadge } from "@/components/ui/PendenciasBadge";
import { OrigemBadge } from "@/components/ui/OrigemBadge";
import { Icon } from "@/components/ui/Icon";
import { GoogleDriveLogo } from "@/components/ui/GoogleDriveLogo";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AdmissaoDetalheModal } from "@/components/esteira/AdmissaoDetalheModal";
import { clicksignPill } from "@/lib/clicksign";
import {
  AceiteLiberacaoModal,
  type AceiteLiberacao,
} from "@/components/esteira/AceiteLiberacaoModal";
import { AuditoriaDocsModal } from "@/components/esteira/AuditoriaDocsModal";
import { AgendamentoExameModal } from "@/components/esteira/AgendamentoExameModal";
import { PendenciasModal } from "@/components/gerenciador/PendenciasModal";
import { EditAdmissaoModal } from "@/components/gerenciador/EditAdmissaoModal";

// ── Contrato de API (F8/F7) ─────────────────────────────────────────────────
const ABAS = [
  { label: "AUDITORIA", rota: "auditoria", icone: "doc" },
  { label: "EXAME", rota: "exame", icone: "heart" },
  { label: "CADASTRO", rota: "cadastro", icone: "pen" },
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
  // EXAME, validação do ASO (gate de APTO) + agendamento do exame (modal de gestão).
  asoValidado?: boolean;
  temAgendamento?: boolean;
  reagendamentos?: number;
  agendamento?: {
    data: string | null;
    horario: string | null;
    nomeClinica: string | null;
    local: string | null;
    fornecedor: "MEDICAL" | "LIMER" | null;
    reagendamentos: number;
  } | null;
  disponivel?: boolean;
  obrigatoriosPendentes?: boolean;
  temPendencias?: boolean;
  // Preenchido quando a régua fecha e o prontuário é arquivado no Drive (T4 / Fase 4).
  drivePastaUrl?: string | null;
  driveAsoUrl?: string | null;
  // Clicksign (INT-4 / F9), status do envelope + contrato assinado arquivado no Drive.
  clicksignStatus?: ClicksignStatus;
  contratoAssinadoDriveUrl?: string | null;
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

const ASO_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

// Flash do upload de ASO por veredito da I.A (a validação é da I.A na leitura do documento, nunca
// manual). `tone` decide a cor do aviso: sucesso (validado) vs aviso (demais).
const ASO_FLASH: Record<string, { msg: string; tone: "ok" | "wn" }> = {
  VALIDADO: { msg: "ASO validado pela I.A (apto).", tone: "ok" },
  INCONFORME: {
    msg: "ASO anexado, mas a I.A não validou como apto (inconforme).",
    tone: "wn",
  },
  PENDENTE: { msg: "ASO anexado; validação da I.A pendente.", tone: "wn" },
  INDISPONIVEL: {
    msg: "ASO anexado; I.A indisponível no momento, reenvie para revalidar.",
    tone: "wn",
  },
};

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
  if (!d) return "não informado";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "não informado" : dt.toLocaleDateString("pt-BR");
}
// Data de admissão é um `date` (YYYY-MM-DD): formata por partes p/ não sofrer deslocamento de fuso.
function fmtDataAdmissao(d?: string | null): string {
  if (!d) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fmtData(d);
}

type DialogState = {
  kind: "conclui" | "reversao" | "aptoSemAsoSuperAdmin" | "auditoriaIncompleta" | "passagem";
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
  // Busca por candidato (item 3), nome ou CPF; revela também concluídos (item 1).
  const [candQuery, setCandQuery] = useState("");
  const [candDebounced, setCandDebounced] = useState("");

  // Operação de status
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; tone: "ok" | "wn" } | null>(null);
  // Modal de visualização rápida (item 4)
  const [viewId, setViewId] = useState<string | null>(null);
  // Modal de auditoria documental por IA (Fase 4 / F2), só na aba Auditoria.
  const [auditId, setAuditId] = useState<string | null>(null);
  // Modal de Gestão de Agendamento do Exame (aba EXAME), cadastro/visualização/reagendamento.
  const [agendaItem, setAgendaItem] = useState<EsteiraItem | null>(null);
  // Pendências obrigatórias (item 4), badge clicável → modal → preencher (reusa o padrão do Gerenciador).
  const [pendItem, setPendItem] = useState<EsteiraItem | null>(null);
  const [editItem, setEditItem] = useState<EsteiraItem | null>(null);
  const [editFiltro, setEditFiltro] = useState<string[] | undefined>(undefined);
  // Relatório da clínica (aba Exame), seleção múltipla de admissões → CSV consolidado.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [relatorioError, setRelatorioError] = useState<string | null>(null);

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

  // Troca de aba: o filtro de status é específico da frente, reseta para não vazar código inválido.
  function trocarAba(i: number) {
    if (i === aba) return;
    setStatusFiltro("");
    setActionError(null);
    setFlash(null);
    setSelecionados(new Set());
    setRelatorioError(null);
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
          setFlash({
            msg: liberacao?.diretoria
              ? `Liberação por diretoria enviada à supervisão (${resp.ncCriada}).`
              : `Não conformidade registrada (${resp.ncCriada}).`,
            tone: "ok",
          });
        }
        await load();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const payload = e.data as
            | { reason?: string; needsConfirmation?: boolean; message?: string }
            | undefined;
          const reason = payload?.reason;
          // Gates DUROS (modal de agendamento): needsConfirmation:false → bloqueio sem bypass.
          // Exibe a mensagem como aviso/erro; NÃO abre diálogo de confirmação.
          if (payload?.needsConfirmation === false) {
            setDialog(null);
            setActionError(payload.message ?? e.message);
            return;
          }
          // aptoSemAsoSuperAdmin = gate APTO por papel (só SUPER_ADMIN pode autorizar liberar Apto
          // sem ASO validado, diálogo de confirmação); auditoriaIncompleta = aceite com Via 1/2;
          // passagem = aceite de pendências (S3); reversao = reabrir cadastro.
          const kind =
            reason === "aptoSemAsoSuperAdmin"
              ? "aptoSemAsoSuperAdmin"
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
    // Exame → "apto" sem ASO validado pela I.A: o gate é do BACKEND, por PAPEL (não checa papel aqui).
    // O PATCH é enviado e o 409 decide: needsConfirmation:false → aviso puro (COMUM/MASTER, sem opção
    // de liberar); needsConfirmation:true (aptoSemAsoSuperAdmin) → diálogo de confirmação.
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

  // ── ASO (T3): upload único que anexa E dispara a validação pela I.A ──────────
  // O binário é efêmero (§A.6): o backend lê o documento na I.A e grava o veredito (`asoValidado`),
  // refletido em asoAnexado/asoValidado após o reload. NÃO há controle manual de validação, quem
  // decide apto/inapto é a I.A na leitura. O flash reflete o `iaStatus` devolvido.
  async function uploadAso(item: EsteiraItem, file: File) {
    setActingId(item.frenteId);
    setActionError(null);
    setFlash(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await apiUpload<{ ok: boolean; asoValidado: boolean; iaStatus: string }>(
        `/esteira/exame/${item.admissaoId}/aso`,
        fd,
        token,
      );
      const aviso = ASO_FLASH[resp.iaStatus] ?? {
        msg: "ASO anexado.",
        tone: "ok" as const,
      };
      setFlash(aviso);
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Falha ao anexar o ASO.");
    } finally {
      setActingId(null);
    }
  }

  function confirmarDialog() {
    if (!dialog) return;
    // conclusão simples não exige aceite; reversão/passagem/apto-sem-ASO (super admin) sim.
    const confirmar = dialog.kind !== "conclui";
    // aptoSemAsoSuperAdmin: autoriza SÓ o Apto (confirmar); NÃO marca aceitePassagem, deixa o backend
    // pedir o aceite de passagem depois, se houver pendências obrigatórias (fluxo passagem já tratado).
    // Demais aceites marcam aceitePassagem=true (registra a trilha de passagem se houver pendências, S3).
    const aceitePassagem = confirmar && dialog.kind !== "aptoSemAsoSuperAdmin";
    void doPatch(dialog.frenteId, dialog.status, confirmar, undefined, aceitePassagem);
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
    ? "40px minmax(0,1.5fr) minmax(0,1fr) minmax(0,0.9fr) 104px 124px 340px 40px"
    : isAuditoria
      ? "minmax(0,1.5fr) minmax(0,1fr) minmax(0,0.9fr) 104px 124px 280px 40px"
      : "minmax(0,1.6fr) minmax(0,1.1fr) minmax(0,0.95fr) 108px 128px 176px 40px";

  function toggleStatusKpi(code: string) {
    setStatusFiltro((cur) => (cur === code ? "" : code));
  }

  // ── Relatório da clínica (aba Exame) ────────────────────────────────────────
  // Após cada recarga da fila, poda da seleção os ids que saíram da lista (filtro/avanço).
  useEffect(() => {
    if (!isExame) return;
    setSelecionados((cur) => {
      if (cur.size === 0) return cur;
      const validos = new Set(items.map((it) => it.admissaoId));
      const next = new Set([...cur].filter((id) => validos.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [items, isExame]);

  const todosSelecionados = items.length > 0 && items.every((it) => selecionados.has(it.admissaoId));
  const algunsSelecionados = selecionados.size > 0 && !todosSelecionados;

  function toggleSelecionado(admissaoId: string) {
    setRelatorioError(null);
    setSelecionados((cur) => {
      const next = new Set(cur);
      if (next.has(admissaoId)) next.delete(admissaoId);
      else next.add(admissaoId);
      return next;
    });
  }

  function toggleSelecionarTodos() {
    setRelatorioError(null);
    setSelecionados((cur) =>
      cur.size >= items.length ? new Set() : new Set(items.map((it) => it.admissaoId)),
    );
  }

  async function gerarRelatorioClinica() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setGerandoRelatorio(true);
    setRelatorioError(null);
    try {
      await apiDownloadPost(
        "/esteira/relatorio-clinica",
        { admissaoIds: ids },
        "relatorio-clinica.csv",
        token,
      );
      setFlash({
        msg: `Relatório da clínica gerado (${ids.length} ${ids.length === 1 ? "candidato" : "candidatos"}).`,
        tone: "ok",
      });
    } catch (e) {
      setRelatorioError(
        e instanceof ApiError ? e.message : "Falha ao gerar o relatório da clínica.",
      );
    } finally {
      setGerandoRelatorio(false);
    }
  }

  return (
    <>
      <div className="mb-[26px]">
        <h1 className="text-[26px] font-extrabold">Farol Admissional</h1>
      </div>

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
            <Icon name={a.icone} className="h-3.5 w-3.5 flex-none" />
            {a.label}
          </button>
        ))}
      </div>

      {/* ── KPIs por frente (reais; clicáveis = filtro, item 5) ──────────── */}
      <div className="mb-[18px] grid grid-cols-2 gap-[14px] sm:grid-cols-3 xl:grid-cols-5">
        <GlassCard className="fk">
          <div className="num">{loading && !data ? "…" : (data?.kpis.total ?? 0)}</div>
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
          {/* Candidato (nome ou CPF), item 3 */}
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

          {/* Status (do catálogo da aba), seletor estilizado (item 8) */}
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
        <p
          className={cn(
            "mb-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm",
            flash.tone === "ok"
              ? "bg-[rgba(91,214,138,0.12)] text-ok"
              : "bg-[rgba(214,142,69,0.12)] text-warn",
          )}
        >
          <Icon name={flash.tone === "ok" ? "check" : "alert"} className="h-4 w-4" /> {flash.msg}
        </p>
      )}

      {/* ── Relatório da clínica (aba Exame): seleção múltipla → CSV ──────── */}
      {isExame && (
        <div className="mb-[14px] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
              disabled={selecionados.size === 0 || gerandoRelatorio}
              onClick={() => void gerarRelatorioClinica()}
              title={
                selecionados.size === 0
                  ? "Selecione ao menos um candidato na fila"
                  : "Baixar o CSV consolidado para a clínica"
              }
            >
              {gerandoRelatorio ? <Spinner /> : <Icon name="doc" className="h-4 w-4" />}
              {gerandoRelatorio
                ? "Gerando…"
                : `Gerar relatório clínica${selecionados.size > 0 ? ` (${selecionados.size})` : ""}`}
            </button>
            {selecionados.size > 0 && !gerandoRelatorio && (
              <button
                type="button"
                className="text-[13px] text-dim underline-offset-2 hover:underline"
                onClick={() => setSelecionados(new Set())}
              >
                Limpar seleção
              </button>
            )}
          </div>
          {relatorioError && (
            <p
              className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {relatorioError}
            </p>
          )}
        </div>
      )}

      {/* ── Lista / faróis ───────────────────────────────────────────────── */}
      <GlassCard className="list">
        <div className="list-head" style={{ gridTemplateColumns: gridCols }}>
          {isExame && (
            <span className="flex items-center">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Selecionar todos os candidatos da fila"
                title="Selecionar todos"
                disabled={items.length === 0}
                checked={todosSelecionados}
                ref={(el) => {
                  if (el) el.indeterminate = algunsSelecionados;
                }}
                onChange={toggleSelecionarTodos}
              />
            </span>
          )}
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
                {isExame && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                      aria-label={`Selecionar ${item.candidatoNome} para o relatório da clínica`}
                      checked={selecionados.has(item.admissaoId)}
                      onChange={() => toggleSelecionado(item.admissaoId)}
                    />
                  </div>
                )}
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
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <Pill tone={tone}>{rotulo}</Pill>
                  {/* Sub-status de reagendamento + indicador discreto de exame agendado (EXAME) */}
                  {isExame && (item.reagendamentos ?? 0) > 0 && (
                    <Pill tone="or" title="Exame reagendado">
                      Reagendado {item.reagendamentos}x
                    </Pill>
                  )}
                  {isExame && item.temAgendamento && item.agendamento?.data && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-dim"
                      title="Exame agendado"
                    >
                      <Icon name="clock" className="h-3 w-3 flex-none" />
                      {fmtDataAdmissao(item.agendamento.data)}
                      {item.agendamento.horario ? ` ${item.agendamento.horario}` : ""}
                    </span>
                  )}
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
                        Pausado: aguarda Auditoria + Exame
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

                    {/* ASO (T3): upload único → anexa e dispara a validação pela I.A no backend */}
                    {isExame && (
                      <label
                        className={cn(
                          "flex flex-none cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] font-semibold transition hover:bg-[var(--surface-2)]",
                          item.asoAnexado ? "text-ok" : "text-dim",
                          acting && "pointer-events-none opacity-60",
                        )}
                        title={
                          item.asoAnexado
                            ? "ASO anexado, reanexar para revalidar na I.A"
                            : "Anexar ASO (valida na I.A automaticamente)"
                        }
                      >
                        {acting ? (
                          <Spinner />
                        ) : (
                          <Icon name={item.asoAnexado ? "check" : "doc"} className="h-4 w-4" />
                        )}
                        {acting ? "Enviando…" : item.asoAnexado ? "Anexado" : "ASO"}
                        <input
                          type="file"
                          accept={ASO_ACCEPT}
                          className="hidden"
                          disabled={acting}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadAso(item, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}

                    {/* Modal de Gestão de Agendamento do Exame (cadastro / visualização / reagendar) */}
                    {isExame && (
                      <button
                        type="button"
                        className={cn(
                          "inline-flex flex-none items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] font-semibold transition hover:bg-[var(--surface-2)]",
                          item.temAgendamento ? "text-accent" : "text-dim",
                        )}
                        title={
                          item.temAgendamento
                            ? "Ver / reagendar o exame"
                            : "Cadastrar o agendamento do exame"
                        }
                        onClick={() => setAgendaItem(item)}
                      >
                        <Icon name="clock" className="h-4 w-4" />
                        Agendamento
                      </button>
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

                    {/* Link do prontuário no Drive (T4), só após a régua fechar; pasta ou ASO */}
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

                  {/* O veredito do ASO pela I.A saiu da linha da fila, agora vive no modal de detalhe
                      do candidato (ícone de OLHO). A lista fica limpa. */}

                  {/* Assinatura Clicksign (INT-4 / F9), só na aba Cadastro; SEM_ENVELOPE fica
                      oculto (discreto). Reenvio por correção é feito na ficha (modal de detalhe). */}
                  {isCadastro &&
                    (item.contratoAssinadoDriveUrl ||
                      (item.clicksignStatus && item.clicksignStatus !== "SEM_ENVELOPE")) && (
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {item.clicksignStatus && item.clicksignStatus !== "SEM_ENVELOPE" && (
                          <Pill tone={clicksignPill(item.clicksignStatus).tone}>
                            {clicksignPill(item.clicksignStatus).label}
                          </Pill>
                        )}
                        {item.contratoAssinadoDriveUrl && (
                          <a
                            href={item.contratoAssinadoDriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px] font-semibold text-text transition hover:bg-[var(--surface-2)]"
                            title="Abrir contrato assinado no Google Drive"
                          >
                            <GoogleDriveLogo className="h-[15px] w-[15px]" />
                            Contrato no Drive
                          </a>
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

      {/* S3, aceite de avanço com pendências obrigatórias (gera trilha de passagem) */}
      <ConfirmDialog
        open={dialog?.kind === "passagem"}
        title="Avançar com pendências?"
        message={dialog?.message ?? ""}
        confirmLabel="Estou ciente, avançar"
        tone="danger"
        busy={Boolean(dialog && actingId === dialog.frenteId)}
        onConfirm={confirmarDialog}
        onCancel={() => setDialog(null)}
      />

      {/* Gate APTO por papel (backend): só SUPER_ADMIN recebe needsConfirmation → pode autorizar
          liberar APTO sem ASO validado pela I.A. Reenvia o PATCH com confirmar:true (o backend pode
          ainda pedir o aceite de passagem em seguida). COMUM/MASTER nunca chegam aqui (aviso puro). */}
      <ConfirmDialog
        open={dialog?.kind === "aptoSemAsoSuperAdmin"}
        title="Liberar Apto sem ASO validado?"
        message={dialog?.message ?? ""}
        confirmLabel="Autorizar liberação"
        tone="danger"
        busy={Boolean(dialog && actingId === dialog.frenteId)}
        onConfirm={confirmarDialog}
        onCancel={() => setDialog(null)}
      />

      {/* Aceite COM PENDÊNCIA + escolha Via 1/Via 2 (auditoria incompleta) */}
      {dialog?.kind === "auditoriaIncompleta" && (
        <AceiteLiberacaoModal
          title="Auditoria com pendência"
          message={dialog.message}
          busy={actingId === dialog.frenteId}
          onConfirm={(l) => doPatch(dialog.frenteId, dialog.status, true, l, true)}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* ── Modal de visualização rápida (item 4) ────────────────────────── */}
      {viewId &&
        (() => {
          // Veredito do ASO (I.A) só existe na aba Exame; passa ao modal para exibir lá o estado.
          const vi = items.find((i) => i.admissaoId === viewId);
          return (
            <AdmissaoDetalheModal
              admissaoId={viewId}
              asoAnexado={isExame ? vi?.asoAnexado : undefined}
              asoValidado={isExame ? vi?.asoValidado : undefined}
              onClose={() => setViewId(null)}
            />
          );
        })()}

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

      {/* ── Modal de Gestão de Agendamento do Exame (aba EXAME) ───────────── */}
      {agendaItem && (
        <AgendamentoExameModal
          admissaoId={agendaItem.admissaoId}
          candidatoNome={agendaItem.candidatoNome}
          onClose={(salvou) => {
            setAgendaItem(null);
            if (salvou) {
              setFlash({ msg: "Agendamento do exame salvo.", tone: "ok" });
              void load();
            }
          }}
        />
      )}

      {/* ── Pendências obrigatórias (item 4), mesmo padrão do Gerenciador ── */}
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
            setFlash({ msg, tone: "ok" });
            void load();
          }}
        />
      )}
    </>
  );
}
