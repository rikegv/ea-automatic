"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NC_TIPO_ROTULO, type NcTipo } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { AdmissaoDetalheModal } from "@/components/esteira/AdmissaoDetalheModal";

type Situacao = "ABERTA" | "AGUARDA_SUPERVISAO" | "RESOLVIDA" | "LIBERADA_DIRETORIA";

interface NcItem {
  id: string;
  admissaoId: string;
  tipo: NcTipo;
  status: "ABERTA" | "RESOLVIDA";
  detalhe: string | null;
  liberacaoStatus: "NENHUMA" | "PENDENTE" | "APROVADA" | "REPROVADA";
  liberacaoMotivo: string | null;
  criadoEm: string;
  consultorId: string | null;
  consultorNome: string | null;
  candidatoNome: string;
  dataAdmissao: string | null;
  codCliente: string;
  clienteRazao: string;
  cargoNome: string;
  situacao: Situacao;
  penaliza: boolean;
}
interface Contador {
  consultorId: string | null;
  consultorNome: string | null;
  total: number;
}
interface NcResp {
  items: NcItem[];
  contadores: Contador[];
}
interface CadAdmissao {
  admissaoId: string;
  candidatoNome: string;
  clienteRazao: string;
  codCliente: string;
}
interface ClienteCat {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
}

const SIT_ROTULO: Record<Situacao, string> = {
  ABERTA: "Aberta",
  AGUARDA_SUPERVISAO: "Aguardando supervisão",
  RESOLVIDA: "Resolvida",
  LIBERADA_DIRETORIA: "Liberada pela diretoria",
};
const SIT_TONE: Record<Situacao, PillTone> = {
  ABERTA: "dg",
  AGUARDA_SUPERVISAO: "or",
  RESOLVIDA: "ok",
  LIBERADA_DIRETORIA: "nt",
};

function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "não informado" : dt.toLocaleDateString("pt-BR");
}
// Data de admissão é um `date` (YYYY-MM-DD): formata por partes p/ não sofrer fuso.
function fmtDataAdmissao(d?: string | null): string {
  if (!d) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fmtData(d);
}

export default function NaoConformidadesPage() {
  const { token, isAdmin } = useAuth();

  const [data, setData] = useState<NcResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  // Busca rápida (cilindro no cabeçalho) com debounce simples
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  // Filtros
  const [tipos, setTipos] = useState<string[]>([]);
  const [situacoes, setSituacoes] = useState<string[]>([]);
  const [consultorIds, setConsultorIds] = useState<string[]>([]);
  const [codClientes, setCodClientes] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Catálogo de clientes (para o filtro Cliente)
  const [clientes, setClientes] = useState<ClienteCat[]>([]);

  // Modais
  const [viewId, setViewId] = useState<string | null>(null);
  const [liberacaoNc, setLiberacaoNc] = useState<NcItem | null>(null);
  const [registrarOpen, setRegistrarOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (tipos.length) qs.set("tipo", tipos.join(","));
    if (situacoes.length) qs.set("situacao", situacoes.join(","));
    if (consultorIds.length) qs.set("consultorId", consultorIds.join(","));
    if (codClientes.length) qs.set("codCliente", codClientes.join(","));
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    try {
      const resp = await apiFetch<NcResp>(`/nao-conformidades${suffix}`, { token });
      setData(resp);
    } catch (e) {
      setData(null);
      setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar as não conformidades.");
    } finally {
      setLoading(false);
    }
  }, [token, q, tipos, situacoes, consultorIds, codClientes, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // debounce da busca rápida
  useEffect(() => {
    const h = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(h);
  }, [qInput]);

  // Carrega o catálogo de clientes uma vez (opções do filtro Cliente).
  useEffect(() => {
    if (!token) return;
    apiFetch<ClienteCat[]>("/catalogos/clientes", { token })
      .then(setClientes)
      .catch(() => setClientes([]));
  }, [token]);

  const tipoOpts = useMemo(
    () => [
      { value: "NC1", label: NC_TIPO_ROTULO.NC1 },
      { value: "NC2", label: NC_TIPO_ROTULO.NC2 },
      { value: "NC3", label: NC_TIPO_ROTULO.NC3 },
    ],
    [],
  );
  const situacaoOpts = useMemo(
    () => [
      { value: "ABERTA", label: "Aberta" },
      { value: "AGUARDA_SUPERVISAO", label: "Aguardando supervisão" },
      { value: "RESOLVIDA", label: "Resolvida" },
      { value: "LIBERADA_DIRETORIA", label: "Liberada pela diretoria" },
    ],
    [],
  );
  const consultorOpts = useMemo(
    () =>
      (data?.contadores ?? [])
        .filter((c) => c.consultorId)
        .map((c) => ({
          value: c.consultorId as string,
          label: c.consultorNome ?? "não informado",
        })),
    [data],
  );
  const clienteOpts = useMemo(
    () => clientes.map((c) => ({ value: c.codCliente, label: c.nomeOperacao || c.razaoSocial })),
    [clientes],
  );

  const filtroCount =
    (tipos.length ? 1 : 0) +
    (situacoes.length ? 1 : 0) +
    (consultorIds.length ? 1 : 0) +
    (codClientes.length ? 1 : 0) +
    (from || to ? 1 : 0);
  const temFiltro = filtroCount > 0 || Boolean(q) || Boolean(qInput.trim());
  function limparFiltros() {
    setQInput("");
    setQ("");
    setTipos([]);
    setSituacoes([]);
    setConsultorIds([]);
    setCodClientes([]);
    setFrom("");
    setTo("");
  }

  async function patch(id: string, path: string, body?: unknown, okMsg?: string) {
    setActingId(id);
    setActionError(null);
    setFlash(null);
    try {
      await apiFetch(`/nao-conformidades/${id}${path}`, { method: "PATCH", token, body });
      if (okMsg) setFlash(okMsg);
      setLiberacaoNc(null);
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Falha na ação.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <>
      {/* Bloco F: página em coluna flex ocupando a altura da viewport. Cabeçalho, contador e ação de
          registro ficam fixos (shrink-0); a tabela preenche o resto (flex-1) e rola internamente, com
          a barra de rolagem premium (ea-scroll) sempre acessível e a coluna Situação/ação fixa
          (col-fix) durante o scroll horizontal. */}
      <div className="flex h-[calc(100dvh-72px)] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <PageHead
            eyebrow="Conformidade do processo"
            title="Não conformidades"
            subtitle="Desvios de processo por admissão. Via 1 penaliza o consultor; Via 2 (liberação por diretoria) é exceção reconhecida pela supervisão."
          />
          <div className="flex items-center gap-2 pt-1">
            <input
              type="search"
              className="ds-input rounded-full w-72"
              placeholder="Buscar por nome, CPF ou cliente"
              aria-label="Buscar por nome, CPF ou cliente"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
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
            <FiltroTrigger count={filtroCount} onLimpar={limparFiltros}>
              <FiltroCampo label="Tipo">
                <MultiSelect
                  ariaLabel="Filtrar por tipo"
                  values={tipos}
                  onChange={setTipos}
                  options={tipoOpts}
                  placeholder="Todos os tipos"
                />
              </FiltroCampo>
              <FiltroCampo label="Situação">
                <MultiSelect
                  ariaLabel="Filtrar por situação"
                  values={situacoes}
                  onChange={setSituacoes}
                  options={situacaoOpts}
                  placeholder="Todas as situações"
                />
              </FiltroCampo>
              <FiltroCampo label="Consultor">
                <MultiSelect
                  ariaLabel="Filtrar por consultor"
                  values={consultorIds}
                  onChange={setConsultorIds}
                  options={consultorOpts}
                  placeholder="Todos os consultores"
                />
              </FiltroCampo>
              <FiltroCampo label="Cliente">
                <MultiSelect
                  ariaLabel="Filtrar por cliente"
                  values={codClientes}
                  onChange={setCodClientes}
                  options={clienteOpts}
                  placeholder="Todos os clientes"
                />
              </FiltroCampo>
              <FiltroCampo label="Período">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="ds-input"
                    aria-label="Registrada de"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                  <input
                    type="date"
                    className="ds-input"
                    aria-label="Registrada até"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </FiltroCampo>
            </FiltroTrigger>
          </div>
        </div>

        {/* ── Contador por consultor (gestão) ───────────────────────────────── */}
        {data && data.contadores.length > 0 && (
          <GlassCard className="mb-[18px] shrink-0 p-4">
            <div className="mb-3 text-[11px] uppercase tracking-wide text-faint">
              NCs que penalizam, por consultor
            </div>
            <div className="flex flex-wrap gap-2">
              {data.contadores.map((c) => {
                const ativo = Boolean(c.consultorId && consultorIds.includes(c.consultorId));
                return (
                  <button
                    key={c.consultorId ?? "sem"}
                    type="button"
                    disabled={!c.consultorId}
                    onClick={() =>
                      c.consultorId &&
                      setConsultorIds((prev) =>
                        prev.includes(c.consultorId as string)
                          ? prev.filter((x) => x !== c.consultorId)
                          : [...prev, c.consultorId as string],
                      )
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] transition",
                      c.consultorId && "hover:bg-[var(--surface-2)]",
                      ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
                    )}
                    title={
                      c.consultorId
                        ? "Filtrar por este consultor"
                        : "Admissões sem consultor associado"
                    }
                  >
                    <span className="font-semibold text-text">
                      {c.consultorNome ?? "Sem consultor"}
                    </span>
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[rgba(214,69,69,0.14)] px-1.5 text-[12px] font-bold text-danger">
                      {c.total}
                    </span>
                  </button>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* ── Ação de registro ──────────────────────────────────────────────── */}
        <div className="mb-[18px] flex shrink-0 items-center justify-end gap-3">
          <Button className="px-4 py-2.5" onClick={() => setRegistrarOpen(true)}>
            <span className="inline-flex items-center gap-2">
              <Icon name="plus" className="h-4 w-4" /> Registrar NC de Cadastro
            </span>
          </Button>
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

        {/* ── Lista ─────────────────────────────────────────────────────────── */}
        <GlassCard className="list flex min-h-0 flex-1 flex-col">
          <div className="ea-scroll min-h-0 flex-1 overflow-auto">
            {/* Bloco F: min-width para a tabela ROLAR em telas menores (em vez de esmagar as colunas),
            no mesmo padrão das outras telas. As duas últimas colunas (Situação/ação e olho) ficam
            fixas à direita (col-fix), com a Situação deslocada 40px (largura do olho). */}
            <div className="min-w-[1120px]">
              <div
                className="list-head"
                style={{
                  gridTemplateColumns:
                    "minmax(0,1.35fr) minmax(0,1.05fr) 126px 124px 92px 92px minmax(0,1.45fr) 40px",
                }}
              >
                <span>Candidato</span>
                <span>Cliente</span>
                <span>Tipo</span>
                <span>Consultor</span>
                <span>Data adm.</span>
                <span>Registrada</span>
                <span className="col-fix" style={{ right: 40 }}>
                  Situação / ação
                </span>
                <span className="col-fix" />
              </div>

              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-faint">Carregando…</div>
              ) : loadError ? (
                <div className="px-4 py-10 text-center text-sm text-danger">{loadError}</div>
              ) : (data?.items.length ?? 0) === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-faint">
                  {temFiltro
                    ? "Nenhuma não conformidade com os filtros atuais."
                    : "Nenhuma não conformidade registrada. 🎉"}
                </div>
              ) : (
                data!.items.map((nc) => {
                  const acting = actingId === nc.id;
                  const podeLiberar =
                    nc.liberacaoStatus === "NENHUMA" || nc.liberacaoStatus === "REPROVADA";
                  const pendente = nc.liberacaoStatus === "PENDENTE";
                  return (
                    <div
                      key={nc.id}
                      className="row"
                      style={{
                        gridTemplateColumns:
                          "minmax(0,1.35fr) minmax(0,1.05fr) 126px 124px 92px 92px minmax(0,1.45fr) 40px",
                      }}
                    >
                      {/* Ajuste 1: nome do candidato à ESQUERDA (título da coluna segue centralizado). */}
                      <div className="min-w-0 text-left">
                        <div className="nm truncate" title={nc.candidatoNome}>
                          {nc.candidatoNome}
                        </div>
                        <div className="meta truncate" title={nc.detalhe ?? ""}>
                          {nc.detalhe ?? "não informado"}
                        </div>
                      </div>
                      <div className="min-w-0 text-center">
                        <div className="meta truncate text-text" title={nc.clienteRazao}>
                          {nc.clienteRazao}
                        </div>
                        <div className="meta truncate">Código {nc.codCliente}</div>
                      </div>
                      <div className="min-w-0 text-center">
                        <Pill tone="nt">{nc.tipo}</Pill>
                        <div className="meta mt-1 truncate">{NC_TIPO_ROTULO[nc.tipo]}</div>
                      </div>
                      <div
                        className="meta truncate text-center"
                        title={nc.consultorNome ?? "não informado"}
                      >
                        {nc.consultorNome ?? "não informado"}
                      </div>
                      <div className="meta text-center">{fmtDataAdmissao(nc.dataAdmissao)}</div>
                      <div className="meta text-center">{fmtData(nc.criadoEm)}</div>

                      {/* Situação + ações */}
                      <div
                        className="col-fix flex min-w-0 flex-wrap items-center justify-center gap-2"
                        style={{ right: 40 }}
                      >
                        <Pill tone={SIT_TONE[nc.situacao]}>{SIT_ROTULO[nc.situacao]}</Pill>

                        {nc.status !== "RESOLVIDA" && nc.situacao !== "LIBERADA_DIRETORIA" && (
                          <button
                            type="button"
                            className="btn-secondary px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                            disabled={acting}
                            onClick={() =>
                              patch(
                                nc.id,
                                "/resolver",
                                undefined,
                                "NC resolvida (registro mantido no histórico).",
                              )
                            }
                          >
                            Resolver
                          </button>
                        )}

                        {podeLiberar && nc.situacao !== "LIBERADA_DIRETORIA" && (
                          <button
                            type="button"
                            className="btn-secondary px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                            disabled={acting}
                            onClick={() => setLiberacaoNc(nc)}
                          >
                            Liberação por diretoria
                          </button>
                        )}

                        {pendente && isAdmin && (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              className="btn-primary px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                              disabled={acting}
                              onClick={() =>
                                patch(
                                  nc.id,
                                  "/liberacao/decisao",
                                  { aprovar: true },
                                  "Liberação aprovada: exceção reconhecida.",
                                )
                              }
                            >
                              Aprovar
                            </button>
                            <button
                              type="button"
                              className="btn-secondary px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                              disabled={acting}
                              onClick={() =>
                                patch(
                                  nc.id,
                                  "/liberacao/decisao",
                                  { aprovar: false },
                                  "Liberação reprovada: volta a NC comum.",
                                )
                              }
                            >
                              Reprovar
                            </button>
                          </span>
                        )}
                        {pendente && !isAdmin && (
                          <span className="text-[12px] text-faint" title={nc.liberacaoMotivo ?? ""}>
                            aguarda supervisão
                          </span>
                        )}
                      </div>

                      <div className="col-fix grid place-items-center">
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                          title="Ver ficha (somente leitura)"
                          aria-label={`Ver ficha de ${nc.candidatoNome}`}
                          onClick={() => setViewId(nc.admissaoId)}
                        >
                          <Icon name="eye" className="h-[18px] w-[18px]" />
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

      {viewId && <AdmissaoDetalheModal admissaoId={viewId} onClose={() => setViewId(null)} />}
      {liberacaoNc && (
        <LiberacaoModal
          nc={liberacaoNc}
          busy={actingId === liberacaoNc.id}
          onClose={() => setLiberacaoNc(null)}
          onSubmit={(motivo) =>
            patch(liberacaoNc.id, "/liberacao", { motivo }, "Liberação enviada à supervisão.")
          }
        />
      )}
      {registrarOpen && (
        <RegistrarNc3Modal
          token={token}
          onClose={() => setRegistrarOpen(false)}
          onDone={(msg) => {
            setRegistrarOpen(false);
            setFlash(msg);
            void load();
          }}
        />
      )}
    </>
  );
}

// ── Modal: solicitar liberação por diretoria (Via 2) ─────────────────────────
function LiberacaoModal({
  nc,
  busy,
  onClose,
  onSubmit,
}: {
  nc: NcItem;
  busy: boolean;
  onClose: () => void;
  onSubmit: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal onClose={onClose} className="max-w-md" ariaLabel="Liberação por diretoria">
      <h3 className="text-[17px] font-extrabold">Liberação por determinação da diretoria</h3>
      <p className="psub !mb-3 mt-1">
        {nc.candidatoNome} · {NC_TIPO_ROTULO[nc.tipo]}. Descreva o motivo; a supervisão aprova ou
        reprova. Aprovada, a NC deixa de penalizar o consultor.
      </p>
      <span className="ds-label">Motivo</span>
      <textarea
        className="ds-input min-h-[96px] resize-y"
        placeholder="Ex.: liberação autorizada pela diretoria por urgência operacional…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        autoFocus
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          className="px-4 py-2.5"
          disabled={busy || !motivo.trim()}
          onClick={() => onSubmit(motivo.trim())}
        >
          {busy ? "Enviando…" : "Enviar à supervisão"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Modal: registrar NC-3 de Cadastro (flags manuais) ────────────────────────
function RegistrarNc3Modal({
  token,
  onClose,
  onDone,
}: {
  token: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CadAdmissao[]>([]);
  const [sel, setSel] = useState<CadAdmissao | null>(null);
  const [flags, setFlags] = useState({
    semKit: false,
    semAssinatura: false,
    cadastroNaoMarcado: false,
  });
  const [detalhe, setDetalhe] = useState("");
  const [diretoria, setDiretoria] = useState(false);
  const [motivoLib, setMotivoLib] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!token || !term || sel) {
      setResults([]);
      return;
    }
    const h = setTimeout(() => {
      apiFetch<{ items: CadAdmissao[] }>(`/esteira/cadastro?q=${encodeURIComponent(term)}`, {
        token,
      })
        .then((r) => setResults(r.items.slice(0, 8)))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(h);
  }, [q, token, sel]);

  const algumaFlag = flags.semKit || flags.semAssinatura || flags.cadastroNaoMarcado;
  const bloqueado = !sel || !algumaFlag || (diretoria && !motivoLib.trim());

  async function submit() {
    if (bloqueado || !sel) return;
    setBusy(true);
    setErro(null);
    try {
      await apiFetch("/nao-conformidades/cadastro", {
        method: "POST",
        token,
        body: {
          admissaoId: sel.admissaoId,
          flagSemKit: flags.semKit,
          flagSemAssinatura: flags.semAssinatura,
          flagCadastroNaoMarcado: flags.cadastroNaoMarcado,
          detalhe: detalhe.trim() || undefined,
          liberacaoDiretoria: diretoria,
          liberacaoMotivo: diretoria ? motivoLib.trim() : undefined,
        },
      });
      onDone(
        diretoria
          ? `Liberação por diretoria enviada à supervisão (${sel.candidatoNome}).`
          : `NC de Cadastro registrada para ${sel.candidatoNome}.`,
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao registrar a NC.");
    } finally {
      setBusy(false);
    }
  }

  const Check = ({ k, label }: { k: keyof typeof flags; label: string }) => (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2.5 text-[13.5px] hover:bg-[var(--surface)]">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--accent)]"
        checked={flags[k]}
        onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))}
      />
      {label}
    </label>
  );

  return (
    <Modal onClose={onClose} className="max-w-lg" ariaLabel="Registrar NC de Cadastro">
      <h3 className="text-[17px] font-extrabold">Registrar NC de Cadastro</h3>
      <p className="psub !mb-3 mt-1">
        Cadastro incompleto (NC-3). As flags são manuais nesta fase: kit (F9) e assinatura
        (Clicksign) ainda não foram construídos; a detecção será automática quando existirem.
      </p>

      {!sel ? (
        <div className="relative">
          <span className="ds-label">Candidato (em Cadastro)</span>
          <input
            className="ds-input"
            placeholder="Buscar por nome ou CPF…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {results.length > 0 && (
            <div className="glass absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-auto p-1.5">
              {results.map((r) => (
                <button
                  key={r.admissaoId}
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                  onClick={() => {
                    setSel(r);
                    setResults([]);
                  }}
                >
                  <span className="truncate text-[13.5px] font-semibold">{r.candidatoNome}</span>
                  <span className="truncate text-[12px] text-dim">{r.clienteRazao}</span>
                </button>
              ))}
            </div>
          )}
          {q.trim() && results.length === 0 && (
            <p className="mt-2 text-[12.5px] text-faint">
              Nenhuma admissão em Cadastro com esse termo.
            </p>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{sel.candidatoNome}</div>
              <div className="truncate text-[12px] text-dim">{sel.clienteRazao}</div>
            </div>
            <button
              type="button"
              className="text-[12px] text-accent hover:underline"
              onClick={() => setSel(null)}
            >
              trocar
            </button>
          </div>

          <span className="ds-label">Flags de cadastro incompleto</span>
          <div className="grid gap-2">
            <Check k="semKit" label="Liberada sem kit adicionado" />
            <Check k="semAssinatura" label="Finalizada sem assinatura" />
            <Check k="cadastroNaoMarcado" label='Flag "cadastro realizado" não marcada' />
          </div>

          <span className="ds-label mt-3">Observação (opcional)</span>
          <textarea
            className="ds-input min-h-[72px] resize-y"
            placeholder="Detalhe adicional…"
            value={detalhe}
            onChange={(e) => setDetalhe(e.target.value)}
          />

          {/* Escolha Via 1 / Via 2 (item 2) */}
          <span className="ds-label mt-3">Esta liberação foi a pedido da diretoria?</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDiretoria(false)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-[13px] transition",
                !diretoria
                  ? "border-[var(--accent)] bg-[var(--surface-2)] ring-1 ring-[var(--accent)]"
                  : "border-[var(--border)] hover:bg-[var(--surface)]",
              )}
            >
              <b className="block font-semibold">Não</b>
              <span className="text-[11.5px] text-dim">NC do consultor (Via 1)</span>
            </button>
            <button
              type="button"
              onClick={() => setDiretoria(true)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-[13px] transition",
                diretoria
                  ? "border-[var(--accent)] bg-[var(--surface-2)] ring-1 ring-[var(--accent)]"
                  : "border-[var(--border)] hover:bg-[var(--surface)]",
              )}
            >
              <b className="block font-semibold">Sim</b>
              <span className="text-[11.5px] text-dim">Liberação por diretoria (Via 2)</span>
            </button>
          </div>
          {diretoria && (
            <div className="mt-2">
              <span className="ds-label">
                Motivo <span className="text-danger">*</span>
              </span>
              <textarea
                className="ds-input min-h-[72px] resize-y"
                placeholder="Descreva a determinação da diretoria…"
                value={motivoLib}
                onChange={(e) => setMotivoLib(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button className="px-4 py-2.5" disabled={busy || bloqueado} onClick={submit}>
          {busy ? "Registrando…" : diretoria ? "Enviar à supervisão" : "Registrar NC"}
        </Button>
      </div>
    </Modal>
  );
}
