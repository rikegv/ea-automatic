"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Origem } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { type PillTone } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";
import { PendenciasBadge } from "@/components/ui/PendenciasBadge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AdmissaoDetalheModal } from "@/components/esteira/AdmissaoDetalheModal";
import { EditAdmissaoModal } from "@/components/gerenciador/EditAdmissaoModal";
import { PendenciasModal } from "@/components/gerenciador/PendenciasModal";
import { farolPill, FAROL_SELECT_OPTIONS } from "@/lib/farol";

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
  origem: Origem;
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
  kpis: {
    total: number;
    emAndamento: number;
    concluidos: number;
    declinados: number;
    comPendencias: number;
  };
}

// Cards clicáveis do topo (Bloco A), seleção mutuamente exclusiva. Ordem fixa na fileira.
type CardId = "total" | "andamento" | "concluidas" | "pendencias" | "declinados";
interface ClienteLite {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao?: string | null;
}
interface CargoLite {
  id: string;
  nome: string;
}

const SINAL: Record<string, { tone: PillTone; label: string }> = {
  OK: { tone: "ok", label: "Completo" },
  PARCIAL: { tone: "wn", label: "Parcial" },
  PENDENTE: { tone: "wn", label: "Pendente" },
  INCONFORMIDADE: { tone: "dg", label: "Inconformidade" },
  COMPETENCIAS: { tone: "nt", label: "Competências" },
};
// Opções multi-select (Bloco B): sem a opção "Todos" (vazio = sem filtro).
const SINAL_OPTS = Object.entries(SINAL).map(([value, v]) => ({ value, label: v.label }));

function fmtDataAdmissao(d?: string | null): string {
  if (!d) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "não informado";
}

/** Tom da pill de uma frente (mesma leitura da Esteira). */
function frenteTone(f?: { status: string; concluida: boolean }): PillTone {
  if (!f) return "nt";
  if (f.concluida) return "ok";
  if (f.status === "DECLINOU" || f.status === "CANCELADO") return "dg";
  if (f.status === "AGUARDA_REENVIO") return "or";
  return "wn";
}

// 11 colunas (com as 3 frentes, G4a). Padrão único de tabela (§A.12): cada coluna tem min-width
// suficiente para NÃO cortar o conteúdo; o container rola na horizontal (overflow-x) em vez de
// esmagar. As de texto (Candidato/Cliente/Cargo/Contrato) têm piso em px (nunca truncam "AJUDANTE
// GERAL" nem o nome) e crescem em `fr`; as de status têm largura para o rótulo mais longo.
const GRID =
  "minmax(232px,1.8fr) minmax(168px,1.2fr) minmax(190px,1.1fr) minmax(120px,0.9fr) 108px 160px 200px 140px 150px 160px 100px";
const GRID_MIN = "min-w-[1880px]";

export default function GerenciadorPage() {
  const { token, isAdmin } = useAuth();

  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtros (Bloco B: multi-select, estados como listas)
  const [candQuery, setCandQuery] = useState("");
  const [q, setQ] = useState("");
  const [codClientes, setCodClientes] = useState<string[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [cargoIds, setCargoIds] = useState<string[]>([]);
  const [cargos, setCargos] = useState<CargoLite[]>([]);
  const [tipoContratos, setTipoContratos] = useState<string[]>([]);
  const [farol, setFarol] = useState<string[]>([]);
  const [sinalizadores, setSinalizadores] = useState<string[]>([]);
  const [concluido, setConcluido] = useState(false);
  const [comPendencias, setComPendencias] = useState(false);
  // Card "Admissões em Andamento" (Bloco A): em aberto no geral (nem concluído nem declínio).
  const [emAndamento, setEmAndamento] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Modais
  const [viewId, setViewId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<AdmRow | null>(null);
  const [editFiltro, setEditFiltro] = useState<string[] | undefined>(undefined);
  const [pendRow, setPendRow] = useState<AdmRow | null>(null);
  const [delRow, setDelRow] = useState<AdmRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // catálogos de cargos e clientes (uma vez)
  useEffect(() => {
    if (!token) return;
    apiFetch<CargoLite[]>("/catalogos/cargos", { token })
      .then(setCargos)
      .catch(() => setCargos([]));
    apiFetch<ClienteLite[]>("/catalogos/clientes", { token })
      .then(setClientes)
      .catch(() => setClientes([]));
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
    if (codClientes.length) qs.set("codCliente", codClientes.join(","));
    if (cargoIds.length) qs.set("cargoId", cargoIds.join(","));
    if (tipoContratos.length) qs.set("tipoContrato", tipoContratos.join(","));
    if (farol.length) qs.set("farol", farol.join(","));
    if (sinalizadores.length) qs.set("sinalizador", sinalizadores.join(","));
    if (concluido) qs.set("concluido", "true");
    if (comPendencias) qs.set("comPendencias", "true");
    if (emAndamento) qs.set("emAndamento", "true");
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
  }, [
    token,
    q,
    codClientes,
    cargoIds,
    tipoContratos,
    farol,
    sinalizadores,
    concluido,
    comPendencias,
    emAndamento,
    from,
    to,
    page,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // reset de página quando um filtro multi muda
  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function limparFiltros() {
    setCandQuery("");
    setQ("");
    setCodClientes([]);
    setCargoIds([]);
    setTipoContratos([]);
    setFarol([]);
    setSinalizadores([]);
    setConcluido(false);
    setComPendencias(false);
    setEmAndamento(false);
    setFrom("");
    setTo("");
    setPage(1);
  }
  const temFiltro = Boolean(
    q ||
    codClientes.length ||
    cargoIds.length ||
    tipoContratos.length ||
    farol.length ||
    sinalizadores.length ||
    concluido ||
    comPendencias ||
    emAndamento ||
    from ||
    to,
  );

  // Contagem de filtros do MODAL ativos (badge do FiltroTrigger). Cards do Bloco A ficam de fora.
  const filtrosModal =
    (codClientes.length ? 1 : 0) +
    (cargoIds.length ? 1 : 0) +
    (tipoContratos.length ? 1 : 0) +
    (farol.length ? 1 : 0) +
    (sinalizadores.length ? 1 : 0) +
    (from || to ? 1 : 0);

  // Cards como filtro ÚNICO (§A.12/Bloco A): só um selecionado por vez, clicar de novo desfaz.
  // O card ativo é derivado dos filtros de card (farol/concluído/pendências/em andamento).
  const cardAtivo: CardId | "" = useMemo(() => {
    if (comPendencias) return "pendencias";
    if (emAndamento) return "andamento";
    if (concluido) return "concluidas";
    if (farol.length > 0 && farol.every((f) => f === "DECLINOU" || f === "RESCISAO"))
      return "declinados";
    if (!farol.length && !concluido && !comPendencias && !emAndamento) return "total";
    return "";
  }, [farol, concluido, comPendencias, emAndamento]);

  // Seleção mutuamente exclusiva: SEMPRE limpa todos os filtros de card antes de setar um. Isso
  // corrige o bug do card "Declínios" preso (antes o card de pendências era um toggle independente
  // e coexistia com os de status).
  function selecionarCard(card: CardId) {
    setPage(1);
    setFarol([]);
    setConcluido(false);
    setComPendencias(false);
    setEmAndamento(false);
    if (card === "total" || card === cardAtivo) return; // reclicar o ativo (ou Total) => nada selecionado
    if (card === "andamento") setEmAndamento(true);
    else if (card === "concluidas") setConcluido(true);
    else if (card === "pendencias") setComPendencias(true);
    else if (card === "declinados") setFarol(["DECLINOU", "RESCISAO"]);
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
  const clienteOpts = useMemo(
    () => clientes.map((c) => ({ value: c.codCliente, label: c.nomeOperacao || c.razaoSocial })),
    [clientes],
  );
  const cargoOpts = useMemo(() => cargos.map((c) => ({ value: c.id, label: c.nome })), [cargos]);
  const contratoOpts = useMemo(
    () => (data?.tiposContrato ?? []).map((t) => ({ value: t, label: t })),
    [data],
  );

  const KpiCard = ({
    id,
    label,
    value,
    tone,
    icon,
  }: {
    id: CardId;
    label: string;
    value: number;
    tone?: string;
    icon?: IconName;
  }) => {
    const ativo = cardAtivo === id;
    return (
      <GlassCard
        as="button"
        className={cn(
          "fk text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5",
          ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
        )}
        onClick={() => selecionarCard(id)}
        aria-pressed={ativo}
      >
        <div className="mb-0.5 flex items-center justify-between">
          {icon && (
            <Icon
              name={icon}
              className="h-4 w-4 opacity-70"
              style={tone ? { color: tone } : undefined}
            />
          )}
          {ativo && <Icon name="check" className="h-3 w-3 text-accent" />}
        </div>
        <div className="num" style={tone ? { color: tone } : undefined}>
          {loading && !data ? "…" : value}
        </div>
        <div className="lbl">{label}</div>
      </GlassCard>
    );
  };

  return (
    <>
      {/* Bloco F: página em coluna flex ocupando a altura da viewport. Cabeçalho e cards são fixos
          (shrink-0); a tabela preenche o resto (flex-1) e rola internamente, então a barra de
          rolagem (horizontal e vertical) fica SEMPRE acessível, sem caçar o rodapé da página, em
          qualquer largura (os cards podem quebrar em várias linhas que a tabela se ajusta). */}
      <div className="flex h-[calc(100dvh-72px)] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <PageHead title="Esteira Admissional" />
          <div className="flex items-center gap-2 pt-1">
            <input
              type="search"
              className="ds-input rounded-full w-72"
              placeholder="Buscar por nome, CPF ou cliente"
              aria-label="Buscar por nome, CPF ou cliente"
              value={candQuery}
              onChange={(e) => setCandQuery(e.target.value)}
            />
            {temFiltro && (
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
                onClick={limparFiltros}
              >
                <Icon name="x" className="h-4 w-4" /> Limpar filtro
              </button>
            )}
            <FiltroTrigger count={filtrosModal} onLimpar={limparFiltros}>
              <FiltroCampo label="Cliente">
                <MultiSelect
                  values={codClientes}
                  onChange={resetPage(setCodClientes)}
                  options={clienteOpts}
                  placeholder="Todos"
                  ariaLabel="Cliente"
                />
              </FiltroCampo>
              <FiltroCampo label="Cargo">
                <MultiSelect
                  values={cargoIds}
                  onChange={resetPage(setCargoIds)}
                  options={cargoOpts}
                  placeholder="Todos"
                  ariaLabel="Cargo"
                />
              </FiltroCampo>
              <FiltroCampo label="Contrato">
                <MultiSelect
                  values={tipoContratos}
                  onChange={resetPage(setTipoContratos)}
                  options={contratoOpts}
                  placeholder="Todos"
                  ariaLabel="Tipo de contrato"
                />
              </FiltroCampo>
              <FiltroCampo label="Status">
                <MultiSelect
                  values={farol}
                  onChange={resetPage(setFarol)}
                  options={FAROL_SELECT_OPTIONS}
                  placeholder="Todos"
                  ariaLabel="Status (farol)"
                />
              </FiltroCampo>
              <FiltroCampo label="Pendências">
                <MultiSelect
                  values={sinalizadores}
                  onChange={resetPage(setSinalizadores)}
                  options={SINAL_OPTS}
                  placeholder="Todas"
                  ariaLabel="Pendências"
                />
              </FiltroCampo>
              <FiltroCampo label="Período">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="ds-input"
                    aria-label="De"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => resetPage(setFrom)(e.target.value)}
                  />
                  <input
                    type="date"
                    className="ds-input"
                    aria-label="Até"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => resetPage(setTo)(e.target.value)}
                  />
                </div>
              </FiltroCampo>
            </FiltroTrigger>
          </div>
        </div>

        {/* KPIs clicáveis = filtro ÚNICO (Bloco A). Ordem fixa; Declínios SEMPRE o último card. */}
        <div className="mb-[18px] grid shrink-0 grid-cols-2 gap-[12px] sm:grid-cols-3 xl:grid-cols-5">
          <KpiCard id="total" label="Total geral" value={k?.total ?? 0} icon="layers" />
          <KpiCard
            id="andamento"
            label="Admissões em Andamento"
            value={k?.emAndamento ?? 0}
            tone="var(--accent)"
            icon="chart"
          />
          <KpiCard
            id="concluidas"
            label="Admissões Concluídas"
            value={k?.concluidos ?? 0}
            tone="var(--ok)"
            icon="check"
          />
          <KpiCard
            id="pendencias"
            label="Com pendências obrigatórias"
            value={k?.comPendencias ?? 0}
            tone="var(--warn)"
            icon="alert"
          />
          <KpiCard
            id="declinados"
            label="Declínios"
            value={k?.declinados ?? 0}
            tone="var(--danger)"
            icon="x"
          />
        </div>

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

        {/* Tabela. Bloco F: área de scroll com altura limitada (a barra fica sempre acessível, sem
          precisar rolar a página até o fim), barra premium (ea-scroll) e coluna Ações fixa. */}
        <GlassCard className="list flex min-h-0 flex-1 flex-col">
          <div className="ea-scroll min-h-0 flex-1 overflow-auto">
            <div className={GRID_MIN}>
              <div className="list-head" style={{ gridTemplateColumns: GRID }}>
                <span>Candidato</span>
                <span>Cliente</span>
                <span>Cargo</span>
                <span>Contrato</span>
                <span>Data adm.</span>
                <span>Status</span>
                <span>Auditoria</span>
                <span>Exame</span>
                <span>Cadastro</span>
                <span>Pendências Obrig.</span>
                <span className="col-fix">Ações</span>
              </div>

              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-faint">Carregando…</div>
              ) : loadError ? (
                <div className="px-4 py-10 text-center text-sm text-danger">{loadError}</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-faint">
                  {temFiltro
                    ? "Nenhuma admissão com os filtros atuais."
                    : "Nenhuma admissão cadastrada."}
                </div>
              ) : (
                items.map((r) => {
                  const farolP = farolPill(r.farolGlobal);
                  // Bloco D (regra permanente §A.16): quem declinou/rescindiu está ENCERRADO, não tem
                  // pendência de processo vivo. A coluna Pendências Obrigatórias mostra "Declínio",
                  // NUNCA "Parcial"/"Completo". Derivado do farol (dado autoritativo), não do sinalizador.
                  const ehDeclinio = r.farolGlobal === "DECLINOU" || r.farolGlobal === "RESCISAO";
                  const sinalP: { tone: PillTone; label: string } = ehDeclinio
                    ? { tone: "dg", label: "Declínio" }
                    : (SINAL[r.sinalizador] ?? { tone: "nt", label: r.sinalizador });
                  const fa = r.frentes?.AUDITORIA;
                  const ex = r.frentes?.EXAME;
                  const cad = r.frentes?.CADASTRO_CONTRATO;
                  return (
                    <div key={r.admissaoId} className="row" style={{ gridTemplateColumns: GRID }}>
                      {/* Ajuste 1: nome do candidato alinhado à ESQUERDA (só o conteúdo; o título da
                        coluna segue centralizado). Ajuste 2: title = tooltip com o texto completo. */}
                      <div className="min-w-0 text-left">
                        {/* SÓ o nome (§A.12). A origem Pandapé fica no detalhe (lápis), não na coluna. */}
                        <div className="nm truncate" title={r.candidatoNome}>
                          {r.candidatoNome}
                        </div>
                      </div>
                      {/* Cliente: só o nome da operação (§A.12); o código vai no modal do olho. */}
                      <div className="min-w-0 text-center">
                        <div
                          className="meta truncate text-text"
                          title={r.clienteOperacao || r.clienteRazao}
                        >
                          {r.clienteOperacao || r.clienteRazao}
                        </div>
                      </div>
                      <div className="meta truncate text-center" title={r.cargoNome}>
                        {r.cargoNome}
                      </div>
                      <div
                        className="meta truncate text-center"
                        title={r.tipoContrato || "não informado"}
                      >
                        {r.tipoContrato || "não informado"}
                      </div>
                      <div className="meta text-center">{fmtDataAdmissao(r.dataAdmissao)}</div>
                      {/* Status movido para ANTES de Auditoria (ajuste de ordem das colunas). */}
                      <div className="flex min-w-0 items-center justify-center">
                        <StatusPill tone={farolP.tone} label={farolP.label} />
                      </div>
                      {/* Auditoria/Exame: em admissão declinada, a coluna mostra "Declínio" DERIVADO do
                          farol (só apresentação, o status real da frente NÃO é lido/alterado — OST
                          declínio não-destrutivo). Fora de declínio, mostra o status real. */}
                      <div className="flex min-w-0 items-center justify-center">
                        {ehDeclinio ? (
                          <StatusPill tone="dg" label="Declínio" />
                        ) : fa ? (
                          <StatusPill tone={frenteTone(fa)} label={fa.rotulo} />
                        ) : (
                          <span className="meta">não informado</span>
                        )}
                      </div>
                      <div className="flex min-w-0 items-center justify-center">
                        {ehDeclinio ? (
                          <StatusPill tone="dg" label="Declínio" />
                        ) : ex ? (
                          <StatusPill tone={frenteTone(ex)} label={ex.rotulo} />
                        ) : (
                          <span className="meta">não informado</span>
                        )}
                      </div>
                      {/* Cadastro: a frente tem nascimento LAZY (só é criada quando o gate abre —
                          Auditoria + Exame concluídas, §A.3 regra 3). Para admissão VIVA, a ausência
                          de frente não é dado faltando, é etapa que ainda não chegou: "Aguardando"
                          (decisão do diretor).
                          EXCEÇÃO — declínio (§A.16, mesma razão da coluna Pendências): quem declinou
                          está ENCERRADO e também não tem frente de Cadastro, mas não está aguardando
                          coisa alguma; dizer "Aguardando" nas 724 seria falsear processo vivo. Mostra
                          "Declínio", igual à coluna Pendências, derivado do farol (dado autoritativo).
                          Os três estados da coluna: Aguardando (viva) · Cadastrado (concluída) ·
                          Declínio (encerrada). */}
                      <div className="flex min-w-0 items-center justify-center">
                        {ehDeclinio ? (
                          <StatusPill tone="dg" label="Declínio" />
                        ) : cad ? (
                          <StatusPill tone={frenteTone(cad)} label={cad.rotulo} />
                        ) : (
                          <StatusPill tone="nt" label="Aguardando" />
                        )}
                      </div>
                      <div className="flex min-w-0 items-center justify-center">
                        <PendenciasBadge
                          tone={sinalP.tone}
                          label={sinalP.label}
                          onClick={() => setPendRow(r)}
                        />
                      </div>
                      <div className="col-fix flex items-center justify-center gap-1">
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
                {data.total} admissõe{data.total === 1 ? "" : "s"} · página {data.page} de{" "}
                {data.totalPages}
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
      </div>

      {/* Modais */}
      {viewId && <AdmissaoDetalheModal admissaoId={viewId} onClose={() => setViewId(null)} />}
      {pendRow && (
        <PendenciasModal
          admissaoId={pendRow.admissaoId}
          candidatoNome={pendRow.candidatoNome}
          onClose={() => setPendRow(null)}
          onPreencher={(campos) => {
            setEditRow(pendRow);
            setEditFiltro(campos);
            setPendRow(null);
          }}
        />
      )}
      {editRow && (
        <EditAdmissaoModal
          admissaoId={editRow.admissaoId}
          candidatoNome={editRow.candidatoNome}
          camposFiltro={editFiltro}
          onClose={() => {
            setEditRow(null);
            setEditFiltro(undefined);
          }}
          onSaved={(msg) => {
            setEditRow(null);
            setEditFiltro(undefined);
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
