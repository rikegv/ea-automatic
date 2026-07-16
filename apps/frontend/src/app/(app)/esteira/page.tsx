"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClicksignStatus, Origem } from "@ea/shared-types";
import { apiFetch, apiUpload, apiDownloadPost, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";
import { PendenciasBadge } from "@/components/ui/PendenciasBadge";
import { OrigemBadge } from "@/components/ui/OrigemBadge";
import { Icon } from "@/components/ui/Icon";
import { GoogleDriveLogo } from "@/components/ui/GoogleDriveLogo";
import { ExcelLogo } from "@/components/ui/ExcelLogo";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { MultiSelect } from "@/components/ui/MultiSelect";
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
  clienteOperacao?: string | null;
  cargoNome: string;
  status: string;
  concluida: boolean;
  dataInicio: string | null;
  dataConclusao: string | null;
  dataAdmissao: string | null;
  /** Tipo de contrato (Efetivo, Temporário, PJ…). Nulo quando ainda não informado. */
  tipoContrato: string | null;
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
  // Item 8: quantos documentos OBRIGATÓRIOS da régua o candidato ainda deve (aba Auditoria).
  docsPendentes?: number;
  // Preenchido quando a régua fecha e o prontuário é arquivado no Drive (T4 / Fase 4).
  drivePastaUrl?: string | null;
  driveAsoUrl?: string | null;
  // Clicksign (INT-4 / F9), status do envelope + contrato assinado arquivado no Drive.
  clicksignStatus?: ClicksignStatus;
  contratoAssinadoDriveUrl?: string | null;
}
interface EsteiraResp {
  items: EsteiraItem[];
  // Item 9: comPendencias = admissões em andamento com pendências obrigatórias (nas 3 frentes).
  // cadastrados = frente de Cadastro CONCLUÍDA (só a aba Cadastro; as outras vêm 0). Fora do
  // `porStatus` de propósito: aquele conta só frente em andamento e daria 0 no status concluinte.
  kpis: {
    porStatus: Record<string, number>;
    total: number;
    comPendencias: number;
    cadastrados: number;
  };
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

// Coluna Pendências Obrig. (§A.12), mesma leitura do Gerenciador: tom + rótulo pelo sinalizador de
// preenchimento (F5). O ícone é dinâmico (check verde / exclamação amarela / X vermelho) na badge.
const SINAL: Record<string, { tone: PillTone; label: string }> = {
  OK: { tone: "ok", label: "Completo" },
  PARCIAL: { tone: "wn", label: "Parcial" },
  PENDENTE: { tone: "wn", label: "Pendências Obrig." },
  INCONFORMIDADE: { tone: "dg", label: "Inconformidade" },
  COMPETENCIAS: { tone: "nt", label: "Competências" },
};

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

  // Filtros (F7), agora no modal premium (Bloco B): cliente e status multi-select.
  const [codClientes, setCodClientes] = useState<string[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [statusFiltro, setStatusFiltro] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Busca por candidato (item 3), nome ou CPF; revela também concluídos (item 1).
  const [candQuery, setCandQuery] = useState("");
  const [candDebounced, setCandDebounced] = useState("");
  // Card "Com pendências obrigatórias" (§A.12): filtro client-side (toggle) só desta frente.
  const [soPendencias, setSoPendencias] = useState(false);

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
  // Declínio da ADMISSÃO acionável de qualquer frente (OST item 3). O declínio é sempre da admissão
  // inteira (usabilidade: declinar de onde estiver); reusa o MESMO efeito do lápis (farol DECLINOU +
  // motivo_declinio_id), e o §A.16 tira a admissão de todas as filas.
  const [declinioItem, setDeclinioItem] = useState<EsteiraItem | null>(null);
  const [motivosDeclinio, setMotivosDeclinio] = useState<{ id: string; nome: string }[]>([]);
  const [motivoDeclinioSel, setMotivoDeclinioSel] = useState("");
  const [declinioBusy, setDeclinioBusy] = useState(false);
  const [declinioErro, setDeclinioErro] = useState<string | null>(null);
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
    if (codClientes.length) qs.set("codCliente", codClientes.join(","));
    if (statusFiltro.length) qs.set("status", statusFiltro.join(","));
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
  }, [token, rota, codClientes, statusFiltro, from, to, candDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  // Troca de aba: o filtro de status é específico da frente, reseta para não vazar código inválido.
  function trocarAba(i: number) {
    if (i === aba) return;
    setStatusFiltro([]);
    setActionError(null);
    setFlash(null);
    setSelecionados(new Set());
    setRelatorioError(null);
    setSoPendencias(false);
    setAba(i);
  }

  // ── Catálogo de clientes (carrega todos uma vez p/ o multi-select do modal) ──
  useEffect(() => {
    if (!token) return;
    apiFetch<ClienteLite[]>("/catalogos/clientes", { token })
      .then(setClientes)
      .catch(() => setClientes([]));
    // Motivos de declínio (OST item 3): o MESMO catálogo do modal do lápis e da admin.
    apiFetch<{ id: string; nome: string }[]>("/catalogos/motivos-declinio", { token })
      .then(setMotivosDeclinio)
      .catch(() => setMotivosDeclinio([]));
  }, [token]);

  const clienteOptions = useMemo(
    () =>
      clientes.map((c) => ({
        value: c.codCliente,
        label: c.nomeOperacao || c.razaoSocial,
      })),
    [clientes],
  );
  const statusOptions = useMemo(
    () => (data?.statusCatalogo ?? []).map((c) => ({ value: c.codigo, label: c.rotulo })),
    [data],
  );

  function limparFiltros() {
    setCodClientes([]);
    setStatusFiltro([]);
    setFrom("");
    setTo("");
    setCandQuery("");
  }
  const temFiltro = Boolean(
    codClientes.length || statusFiltro.length || from || to || candQuery || soPendencias,
  );
  // Contagem de filtros ATIVOS do modal (badge do gatilho): cliente, status, período. A busca rápida
  // (candQuery) vive fora do modal, na barra do cabeçalho, e NÃO entra no badge do gatilho.
  const filtroCount =
    (codClientes.length ? 1 : 0) + (statusFiltro.length ? 1 : 0) + (from || to ? 1 : 0);

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

  // Declínio da admissão INTEIRA (OST item 3): um endpoint dedicado aplica o efeito completo numa
  // transação — farol DECLINOU + motivo + Auditoria "Declinou" + Exame "Cancelado" (mesma regra 2 do
  // §A.16, agora ao vivo). O §A.16 tira a admissão das filas; o Gerenciador reflete as 3 frentes e o
  // farol. Nenhuma frente fica "aberta"/"Aguardando".
  async function confirmarDeclinio() {
    if (!declinioItem || !motivoDeclinioSel) return;
    setDeclinioBusy(true);
    setDeclinioErro(null);
    try {
      await apiFetch(`/esteira/admissao/${declinioItem.admissaoId}/declinar`, {
        method: "PATCH",
        token,
        body: { motivoDeclinioId: motivoDeclinioSel },
      });
      const nome = declinioItem.candidatoNome;
      setDeclinioItem(null);
      setMotivoDeclinioSel("");
      setFlash({ msg: `Admissão de ${nome} declinada.`, tone: "ok" });
      await load();
    } catch (e) {
      setDeclinioErro(e instanceof ApiError ? e.message : "Falha ao declinar a admissão.");
    } finally {
      setDeclinioBusy(false);
    }
  }

  function onSelectStatus(item: EsteiraItem, novo: string) {
    if (!novo || novo === item.status) return;
    setActionError(null);
    // "Declinou" (status do catálogo da Auditoria) passa a ser a AÇÃO de declínio da admissão (OST
    // item 3): abre o modal de motivo em vez do caminho antigo de status de frente. Nas outras
    // frentes o declínio vem pelo botão dedicado (o catálogo delas não tem "Declinou").
    if (novo === "DECLINOU") {
      setMotivoDeclinioSel("");
      setDeclinioErro(null);
      setDeclinioItem(item);
      return;
    }
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
  // Filtro do card "Com pendências obrigatórias" (§A.12): mostra só quem tem campo obrigatório pendente.
  const itemsVisiveis = soPendencias ? items.filter((it) => it.temPendencias) : items;
  const statusCatalogo = data?.statusCatalogo ?? [];
  // KPIs (item 5/6): "Total na fila" + um card por status EM ANDAMENTO (exclui o de conclusão, que
  // sai da fila). Cada card de status filtra a lista ao clicar (toggle).
  //
  // Declínio SEMPRE o ÚLTIMO card da fileira (decisão do diretor). Não basta ordenar entre os cards
  // de status: depois deles ainda vem o card "Com pendências obrigatórias" (§A.12), e era ELE que
  // deixava o "Declinou" no meio. Por isso o card de declínio é separado aqui e renderizado depois
  // do de pendências. Só a Auditoria tem DECLINOU no catálogo; nas outras abas nada é renderizado.
  const kpiStatus = statusCatalogo.filter((c) => !c.conclui && c.codigo !== "DECLINOU");
  const kpiDeclinio = statusCatalogo.find((c) => c.codigo === "DECLINOU");
  // Máscara única de tabela (§A.12): colunas REALMENTE separadas, com min-width por coluna para o
  // conteúdo NUNCA cortar/sobrepor; o container rola na horizontal (overflow-x) em vez de esmagar.
  // Ordem: [check(exame)] Candidato · Cliente · Cargo · Contrato · Data · Status · Pendências ·
  // Avanço/Frente · Ações. Status e Pendências têm largura suficiente para o rótulo mais longo (sem
  // overflow entre colunas). A coluna Avanço só tem o controle da frente (Select + Auditar/ASO/
  // Agendamento); olho/editar vivem na coluna Ações.
  // Larguras (OST correção, item 3 + §A.20): Candidato deixou de ser o mais guloso (era o que criava
  // o vazio grande) e a coluna Avanço passou a CRESCER (minmax com fr) em vez de ficar fixa e
  // espremida. Assim a folga das telas largas vai para o SELETOR de status do fim, não para um vazio
  // no meio; nada fica esmagado nem cortado, e o container rola na horizontal se faltar espaço (§A.12).
  const COL = {
    cand: "minmax(190px,1.1fr)",
    cli: "minmax(170px,1fr)",
    cargo: "minmax(180px,1fr)",
    // Cabe o rótulo mais longo do campo ("Temporário") e o vazio ("não informado", §A.11).
    contrato: "130px",
    data: "110px",
    status: "210px",
    pend: "150px",
    acoes: "120px",
  };
  // Exame carrega 3 controles na barra (seletor + ASO + Agendamento): precisa de piso maior para
  // "Agendamento" não cortar (§A.20). Auditoria tem 2 (seletor + Auditar) e Cadastro só o seletor.
  const avanco = isExame
    ? "minmax(480px,1.9fr)"
    : isAuditoria
      ? "minmax(260px,1.5fr)"
      : "minmax(240px,1.3fr)";
  // Ordem (OST ajustes, item 5a): Tipo de contrato é a PRIMEIRA coluna de conteúdo, antes de
  // Candidato. Só na Esteira; o Gerenciador não muda. O checkbox do Exame segue como afordância à
  // esquerda de tudo.
  const gridCols = [
    isExame ? "40px" : null,
    COL.contrato,
    COL.cand,
    COL.cli,
    COL.cargo,
    COL.data,
    COL.status,
    COL.pend,
    avanco,
    COL.acoes,
  ]
    .filter(Boolean)
    .join(" ");
  // Piso de largura: abaixo dele o container rola na horizontal em vez de esmagar as colunas (§A.12).
  const gridMin = isExame ? "min-w-[1840px]" : "min-w-[1540px]";

  function toggleStatusKpi(code: string) {
    setStatusFiltro((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  /**
   * Card de KPI de um status do catálogo (clicável = filtro, §A.12). Extraído porque a fileira usa o
   * MESMO card em duas posições: os status comuns no meio e o "Declinou" depois do card de
   * pendências, como último da fileira. Duas cópias do JSX divergiriam na primeira alteração.
   */
  function cardStatus(c: StatusCat) {
    const color = TONE_VAR[statusTone(c.codigo, c)];
    const ativo = statusFiltro.includes(c.codigo);
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

  const todosSelecionados =
    itemsVisiveis.length > 0 && itemsVisiveis.every((it) => selecionados.has(it.admissaoId));
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
      cur.size >= itemsVisiveis.length
        ? new Set()
        : new Set(itemsVisiveis.map((it) => it.admissaoId)),
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
      {/* Bloco F: página em coluna flex ocupando a altura da viewport. Cabeçalho, abas e cards são
          fixos (shrink-0); a tabela preenche o resto (flex-1) e rola internamente, então a barra de
          rolagem (horizontal e vertical) fica SEMPRE acessível, sem caçar o rodapé da página, e a
          coluna Ações fica fixa à direita durante o scroll horizontal. */}
      <div className="flex h-[calc(100dvh-72px)] flex-col">
        <div className="mb-[26px] flex shrink-0 items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold">Farol Admissional</h1>
          <div className="flex items-center gap-2.5">
            {/* Busca rápida na tela (fora do modal): liga no mesmo candQuery; o backend busca nome, CPF
              e cliente. Barra tipo cilindro (rounded-full). */}
            <input
              className="ds-input rounded-full w-[300px]"
              placeholder="Buscar por nome, CPF ou cliente"
              aria-label="Buscar por nome, CPF ou cliente"
              value={candQuery}
              onChange={(e) => setCandQuery(e.target.value)}
            />
            {/* Botão discreto: só aparece quando há filtro ativo que o Limpar zera (cliente/status/busca/
              período). Mesma cobertura da função limparFiltros. */}
            {Boolean(codClientes.length || statusFiltro.length || from || to || candQuery) && (
              <button
                type="button"
                onClick={limparFiltros}
                className="flex-none text-sm text-dim transition hover:text-danger"
                title="Limpar todos os filtros"
              >
                Limpar filtro
              </button>
            )}
            {/* Bloco E: "Gerar Relatório Clínica" movido para o topo, ao lado do filtro, na aba Exame.
              Mesmo padrão premium do ícone do Drive (ExcelLogo). Função 100% preservada (dispara
              gerarRelatorioClinica sobre a seleção). Divisória delicada entre o Excel e o filtro. */}
            {isExame && (
              <>
                <button
                  type="button"
                  onClick={() => void gerarRelatorioClinica()}
                  disabled={selecionados.size === 0 || gerandoRelatorio}
                  aria-label="Gerar relatório da clínica"
                  title={
                    selecionados.size === 0
                      ? "Selecione ao menos um candidato na fila para gerar o relatório da clínica"
                      : `Gerar o relatório da clínica (${selecionados.size} selecionado${selecionados.size > 1 ? "s" : ""})`
                  }
                  className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] transition hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:hover:bg-[var(--surface)]"
                >
                  {gerandoRelatorio ? <Spinner /> : <ExcelLogo className="h-[20px] w-[20px]" />}
                </button>
                <div
                  aria-hidden="true"
                  className="h-6 w-px flex-none bg-[color-mix(in_srgb,var(--border-strong)_70%,transparent)]"
                />
              </>
            )}
            <FiltroTrigger count={filtroCount} onLimpar={limparFiltros}>
              <FiltroCampo label="Cliente">
                <MultiSelect
                  ariaLabel="Filtrar por cliente"
                  values={codClientes}
                  onChange={setCodClientes}
                  options={clienteOptions}
                  placeholder="Todos os clientes"
                />
              </FiltroCampo>

              <FiltroCampo label="Status">
                <MultiSelect
                  ariaLabel="Filtrar por status"
                  values={statusFiltro}
                  onChange={setStatusFiltro}
                  options={statusOptions}
                  placeholder="Todos os status"
                />
              </FiltroCampo>

              <FiltroCampo label="Período">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="ds-input"
                    aria-label="Data inicial"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                  <input
                    type="date"
                    className="ds-input"
                    aria-label="Data final"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </FiltroCampo>
            </FiltroTrigger>
          </div>
        </div>

        {/* ── Abas ─────────────────────────────────────────────────────────── */}
        <div className="mb-[22px] flex shrink-0 gap-2">
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

        {/* ── KPIs por frente (reais; clicáveis = filtro, itens 5/9/10) ────── */}
        <div className="mb-[18px] grid shrink-0 grid-cols-2 gap-[14px] sm:grid-cols-3 xl:grid-cols-5">
          {/* Item 10: "Total na fila" vira toggle: clicar limpa o filtro de status (mostra todos). */}
          <GlassCard
            as="button"
            className={cn(
              "fk text-left transition hover:bg-[var(--surface-2)]",
              statusFiltro.length === 0 && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
            )}
            onClick={() => setStatusFiltro([])}
            aria-pressed={statusFiltro.length === 0}
            title="Mostrar todos os status"
          >
            <div className="num">{loading && !data ? "…" : (data?.kpis.total ?? 0)}</div>
            <div className="lbl flex items-center gap-1.5">
              Total na fila
              {statusFiltro.length === 0 && <Icon name="check" className="h-3 w-3 text-accent" />}
            </div>
          </GlassCard>
          {kpiStatus.map((c) => cardStatus(c))}
          {/* Item 9 / §A.12: admissões com campos obrigatórios pendentes. Clicável = filtro (toggle),
            mostra só quem tem pendência obrigatória nesta frente. */}
          <GlassCard
            as="button"
            className={cn(
              "fk text-left transition hover:bg-[var(--surface-2)]",
              soPendencias && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
            )}
            onClick={() => setSoPendencias((v) => !v)}
            aria-pressed={soPendencias}
            title={
              soPendencias
                ? "Remover filtro de pendências obrigatórias"
                : "Filtrar só candidatos com pendências obrigatórias"
            }
          >
            <div className="num" style={{ color: TONE_VAR.wn }}>
              {loading && !data ? "…" : (data?.kpis.comPendencias ?? 0)}
            </div>
            <div className="lbl flex items-center gap-1.5">
              Com pendências obrigatórias
              {soPendencias && <Icon name="check" className="h-3 w-3 text-accent" />}
            </div>
          </GlassCard>
          {/* KPI "Cadastrado" (aba Cadastro, decisão do diretor): quantas JÁ foram cadastradas. Vem
              de `kpis.cadastrados`, e não de `porStatus`, porque este último só conta frente EM
              ANDAMENTO (concluida=false) — "Cadastrado" é o status concluinte e ali daria sempre 0.
              Clicável como os demais (§A.12): filtra pelo status de conclusão, que é justamente o
              que reexpõe as concluídas na fila. */}
          {isCadastro && (
            <GlassCard
              as="button"
              className={cn(
                "fk text-left transition hover:bg-[var(--surface-2)]",
                statusFiltro.includes("CADASTRADO") &&
                  "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
              )}
              onClick={() => toggleStatusKpi("CADASTRADO")}
              aria-pressed={statusFiltro.includes("CADASTRADO")}
              title={
                statusFiltro.includes("CADASTRADO")
                  ? "Remover filtro"
                  : "Filtrar só as já cadastradas"
              }
            >
              <div className="num" style={{ color: TONE_VAR.ok }}>
                {loading && !data ? "…" : (data?.kpis.cadastrados ?? 0)}
              </div>
              <div className="lbl flex items-center gap-1.5">
                Cadastrado
                {statusFiltro.includes("CADASTRADO") && (
                  <Icon name="check" className="h-3 w-3 text-accent" />
                )}
              </div>
            </GlassCard>
          )}
          {/* Declínio SEMPRE o último card da fileira (decisão do diretor) — por isso vem DEPOIS do
              card de pendências, e não junto dos demais status. */}
          {kpiDeclinio && cardStatus(kpiDeclinio)}
        </div>

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
          <div className="mb-[14px] flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Bloco E: o botão "Gerar Relatório Clínica" foi para o topo (ao lado do filtro). Aqui
                permanece só o "Limpar seleção" de apoio. */}
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
        <GlassCard className="list flex min-h-0 flex-1 flex-col">
          <div className="ea-scroll min-h-0 flex-1 overflow-auto">
            <div className={gridMin}>
              <div className="list-head" style={{ gridTemplateColumns: gridCols }}>
                {isExame && (
                  <span className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Selecionar todos os candidatos da fila"
                      title="Selecionar todos"
                      disabled={itemsVisiveis.length === 0}
                      checked={todosSelecionados}
                      ref={(el) => {
                        if (el) el.indeterminate = algunsSelecionados;
                      }}
                      onChange={toggleSelecionarTodos}
                    />
                  </span>
                )}
                <span>Tipo de contrato</span>
                <span>Candidato</span>
                <span>Cliente</span>
                <span>Cargo</span>
                <span>Data adm.</span>
                <span>Status</span>
                <span>Pendências Obrig.</span>
                <span>
                  {isExame ? "ASO / Avanço" : isAuditoria ? "Avanço / Auditoria" : "Avanço"}
                </span>
                <span className="col-fix">Ações</span>
              </div>

              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-faint">Carregando frente…</div>
              ) : loadError ? (
                <div className="px-4 py-10 text-center text-sm text-danger">{loadError}</div>
              ) : itemsVisiveis.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-faint">
                  {temFiltro
                    ? "Nenhum candidato nesta frente com os filtros atuais."
                    : "Nenhum candidato em andamento nesta frente."}
                </div>
              ) : (
                itemsVisiveis.map((item) => {
                  const acting = actingId === item.frenteId;
                  // Gate do Cadastro (§A.3 regra 3): a frente só abre com Auditoria E Exame
                  // concluídas. Enquanto não abre, `disponivel` vem false do backend.
                  const pausado = isCadastro && item.disponivel === false;
                  // Coluna Status da aba Cadastro (decisão do diretor): enquanto o gate não abre, o
                  // status real da frente ("A cadastrar") mente para o consultor, porque não há nada
                  // a cadastrar ainda. Mostra "Aguardando" e o motivo no title. O status no banco
                  // NÃO muda: isto é leitura de tela.
                  const tone = pausado ? "nt" : statusTone(item.status, catMap.get(item.status));
                  const rotulo = pausado
                    ? "Aguardando"
                    : (catMap.get(item.status)?.rotulo ?? item.status);
                  // Coluna Pendências Obrig. (§A.12): tom/rótulo pelo sinalizador de preenchimento (F5),
                  // mesma leitura do Gerenciador. O X de frente recusada vive na coluna Status (StatusPill).
                  const sinalP = SINAL[item.sinalizador] ?? {
                    tone: "nt" as PillTone,
                    label: item.sinalizador,
                  };
                  return (
                    <div
                      key={item.frenteId}
                      className="row"
                      style={{ gridTemplateColumns: gridCols }}
                    >
                      {isExame && (
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                            aria-label={`Selecionar ${item.candidatoNome} para o relatório da clínica`}
                            checked={selecionados.has(item.admissaoId)}
                            onChange={() => toggleSelecionado(item.admissaoId)}
                          />
                        </div>
                      )}
                      {/* Tipo de contrato: PRIMEIRA coluna de conteúdo (OST ajustes, item 5a). Vazio =
                          "não informado" (§A.11), em tom apagado para bater o olho em quem está sem o
                          dado. */}
                      <div
                        className={cn(
                          "meta truncate text-center",
                          !item.tipoContrato && "text-faint",
                        )}
                        title={item.tipoContrato || "não informado"}
                      >
                        {item.tipoContrato || "não informado"}
                      </div>
                      {/* Coluna Candidato: só o nome (à ESQUERDA) + badge de origem. Sem sub-linha de
                          data (removida, OST ajustes: não foi pedida). */}
                      <div className="min-w-0 text-left">
                        <div className="flex min-w-0 items-center justify-start gap-1.5">
                          <span className="nm truncate" title={item.candidatoNome}>
                            {item.candidatoNome}
                          </span>
                          <OrigemBadge origem={item.origem} className="flex-none" />
                        </div>
                      </div>
                      {/* Cliente: só o nome da operação (§A.12); o código vai no modal do olho. */}
                      <div className="min-w-0 text-center">
                        <div
                          className="meta truncate text-text"
                          title={item.clienteOperacao || item.clienteRazao}
                        >
                          {item.clienteOperacao || item.clienteRazao}
                        </div>
                      </div>
                      <div className="meta truncate text-center" title={item.cargoNome}>
                        {item.cargoNome}
                      </div>
                      <div className="meta text-center">{fmtDataAdmissao(item.dataAdmissao)}</div>
                      <div className="flex min-w-0 flex-col items-center gap-1">
                        <StatusPill tone={tone} label={rotulo} />
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

                      {/* Coluna Pendências Obrig. (§A.12): só o badge, centralizado. */}
                      <div className="flex min-w-0 items-center justify-center">
                        <PendenciasBadge
                          tone={sinalP.tone}
                          label={sinalP.label}
                          onClick={() => setPendItem(item)}
                        />
                      </div>

                      {/* Coluna AVANÇO / FRENTE: controle de avanço + ação da frente */}
                      <div className="flex min-w-0 flex-col gap-1.5">
                        {/* flex-wrap: se a coluna apertar, ASO/Agendamento descem para a linha de
                            baixo em vez de cortar o rótulo (§A.20, nada esmagado/suprimido). */}
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                              // max-w cap: o seletor não "engole" a linha (era o que espremia ASO/
                              // Agendamento no Exame). Fica com largura confortável e sobra espaço para
                              // os botões da frente, sem cortar (§A.20).
                              className="min-w-[130px] max-w-[240px] flex-1"
                              menuFit
                              ariaLabel={`Mudar status de ${item.candidatoNome}`}
                              disabled={acting}
                              value={item.status}
                              onChange={(novo) => onSelectStatus(item, novo)}
                              options={[
                                ...statusCatalogo.map((c) => ({
                                  value: c.codigo,
                                  label: c.rotulo,
                                  color: TONE_VAR[statusTone(c.codigo, c)],
                                })),
                                // Declínio é uma opção DENTRO do seletor (OST correção, item 2). A
                                // Auditoria já tem "Declinou" no catálogo; nas frentes que não têm
                                // (Exame, Cadastro) injetamos a MESMA opção (sem tocar o catálogo/régua).
                                // onSelectStatus intercepta "DECLINOU" e abre o modal de motivo.
                                ...(statusCatalogo.some((c) => c.codigo === "DECLINOU")
                                  ? []
                                  : [
                                      {
                                        value: "DECLINOU",
                                        label: "Declinou",
                                        color: TONE_VAR[statusTone("DECLINOU")],
                                      },
                                    ]),
                              ]}
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
                                <Icon
                                  name={item.asoAnexado ? "check" : "doc"}
                                  className="h-4 w-4"
                                />
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

                      {/* Coluna AÇÕES: prontuário no Drive (se houver) + olho + editar. */}
                      <div className="col-fix flex items-center justify-center gap-0.5">
                        {isAuditoria && (item.drivePastaUrl || item.driveAsoUrl) && (
                          <a
                            href={item.drivePastaUrl || item.driveAsoUrl || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)]"
                            title="Abrir prontuário no Google Drive"
                            aria-label={`Abrir prontuário de ${item.candidatoNome} no Google Drive`}
                          >
                            <GoogleDriveLogo className="h-[17px] w-[17px]" />
                          </a>
                        )}
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                          title="Ver ficha (somente leitura)"
                          aria-label={`Ver ficha de ${item.candidatoNome}`}
                          onClick={() => setViewId(item.admissaoId)}
                        >
                          <Icon name="eye" className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                          title="Editar admissão"
                          aria-label={`Editar admissão de ${item.candidatoNome}`}
                          onClick={() => {
                            setEditFiltro(undefined);
                            setEditItem(item);
                          }}
                        >
                          <Icon name="pen" className="h-[16px] w-[16px]" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </GlassCard>
      </div>

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
      {/* Modal de declínio da admissão (OST item 3): acionável de qualquer frente; exige motivo. */}
      {declinioItem && (
        <Modal
          onClose={() => {
            setDeclinioItem(null);
            setMotivoDeclinioSel("");
            setDeclinioErro(null);
          }}
          className="max-w-md"
          ariaLabel="Declinar admissão"
        >
          <div className="mb-4">
            <div className="eyebrow !mb-1">Declinar admissão</div>
            <h3 className="truncate text-[18px] font-extrabold">{declinioItem.candidatoNome}</h3>
            <p className="psub !mb-0 mt-1">
              O declínio encerra a admissão inteira nas três frentes (Auditoria, Exame e Cadastro) e a
              tira das filas. Escolha o motivo para confirmar.
            </p>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="ds-label">Motivo do declínio</span>
              <Select
                value={motivoDeclinioSel}
                onChange={setMotivoDeclinioSel}
                placeholder="Selecione o motivo…"
                ariaLabel="Motivo do declínio"
                options={motivosDeclinio.map((m) => ({ value: m.id, label: m.nome }))}
              />
            </label>
            {declinioErro && (
              <p className="text-sm text-danger" role="alert">
                {declinioErro}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                className="px-4 py-2.5"
                onClick={() => {
                  setDeclinioItem(null);
                  setMotivoDeclinioSel("");
                  setDeclinioErro(null);
                }}
                disabled={declinioBusy}
              >
                Cancelar
              </Button>
              <Button
                className="px-4 py-2.5"
                onClick={confirmarDeclinio}
                disabled={declinioBusy || !motivoDeclinioSel}
              >
                {declinioBusy ? "Declinando…" : "Confirmar declínio"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
