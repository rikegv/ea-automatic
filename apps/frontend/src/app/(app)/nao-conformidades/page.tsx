"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NC_TIPO_ROTULO, type NcTipo } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
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
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "—" : dt.toLocaleDateString("pt-BR");
}
// Data de admissão é um `date` (YYYY-MM-DD) — formata por partes p/ não sofrer fuso.
function fmtDataAdmissao(d?: string | null): string {
  if (!d) return "—";
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

  // Filtros
  const [tipo, setTipo] = useState("");
  const [situacao, setSituacao] = useState("");
  const [consultorId, setConsultorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Modais
  const [viewId, setViewId] = useState<string | null>(null);
  const [liberacaoNc, setLiberacaoNc] = useState<NcItem | null>(null);
  const [registrarOpen, setRegistrarOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    const qs = new URLSearchParams();
    if (tipo) qs.set("tipo", tipo);
    if (situacao) qs.set("situacao", situacao);
    if (consultorId) qs.set("consultorId", consultorId);
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
  }, [token, tipo, situacao, consultorId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const consultorOpts = useMemo(() => {
    const opts = (data?.contadores ?? [])
      .filter((c) => c.consultorId)
      .map((c) => ({ value: c.consultorId as string, label: c.consultorNome ?? "—" }));
    return [{ value: "", label: "Todos" }, ...opts];
  }, [data]);

  const temFiltro = Boolean(tipo || situacao || consultorId || from || to);
  function limparFiltros() {
    setTipo("");
    setSituacao("");
    setConsultorId("");
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
      <PageHead
        eyebrow="Conformidade do processo"
        title="Não conformidades"
        subtitle="Desvios de processo por admissão. Via 1 penaliza o consultor; Via 2 (liberação por diretoria) é exceção reconhecida pela supervisão."
      />

      {/* ── Contador por consultor (gestão) ───────────────────────────────── */}
      {data && data.contadores.length > 0 && (
        <GlassCard className="mb-[18px] p-4">
          <div className="mb-3 text-[11px] uppercase tracking-wide text-faint">
            NCs que penalizam, por consultor
          </div>
          <div className="flex flex-wrap gap-2">
            {data.contadores.map((c) => {
              const ativo = consultorId === c.consultorId;
              return (
                <button
                  key={c.consultorId ?? "sem"}
                  type="button"
                  disabled={!c.consultorId}
                  onClick={() => c.consultorId && setConsultorId(ativo ? "" : c.consultorId)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] transition",
                    c.consultorId && "hover:bg-[var(--surface-2)]",
                    ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
                  )}
                  title={c.consultorId ? "Filtrar por este consultor" : "Admissões sem consultor associado"}
                >
                  <span className="font-semibold text-text">{c.consultorNome ?? "Sem consultor"}</span>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[rgba(214,69,69,0.14)] px-1.5 text-[12px] font-bold text-danger">
                    {c.total}
                  </span>
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* ── Filtros + ação de registro ────────────────────────────────────── */}
      <GlassCard className="mb-[18px] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1.2fr_0.9fr_0.9fr_auto] md:items-end">
          <div>
            <span className="ds-label">Tipo</span>
            <Select
              ariaLabel="Filtrar por tipo"
              value={tipo}
              onChange={setTipo}
              placeholder="Todos"
              options={[
                { value: "", label: "Todos" },
                { value: "NC1", label: NC_TIPO_ROTULO.NC1 },
                { value: "NC2", label: NC_TIPO_ROTULO.NC2 },
                { value: "NC3", label: NC_TIPO_ROTULO.NC3 },
              ]}
            />
          </div>
          <div>
            <span className="ds-label">Situação</span>
            <Select
              ariaLabel="Filtrar por situação"
              value={situacao}
              onChange={setSituacao}
              placeholder="Todas"
              options={[
                { value: "", label: "Todas" },
                { value: "ABERTA", label: "Aberta" },
                { value: "AGUARDA_SUPERVISAO", label: "Aguardando supervisão" },
                { value: "RESOLVIDA", label: "Resolvida" },
                { value: "LIBERADA_DIRETORIA", label: "Liberada pela diretoria" },
              ]}
            />
          </div>
          <div>
            <span className="ds-label">Consultor</span>
            <Select
              ariaLabel="Filtrar por consultor"
              value={consultorId}
              onChange={setConsultorId}
              placeholder="Todos"
              options={consultorOpts}
            />
          </div>
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
        <div className="mt-3 flex justify-end">
          <Button className="px-4 py-2.5" onClick={() => setRegistrarOpen(true)}>
            <span className="inline-flex items-center gap-2">
              <Icon name="plus" className="h-4 w-4" /> Registrar NC de Cadastro
            </span>
          </Button>
        </div>
      </GlassCard>

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
      <GlassCard className="list">
        <div
          className="list-head"
          style={{ gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1.05fr) 126px 124px 92px 92px minmax(0,1.45fr) 40px" }}
        >
          <span>Candidato</span>
          <span>Cliente</span>
          <span>Tipo</span>
          <span>Consultor</span>
          <span>Data adm.</span>
          <span>Registrada</span>
          <span>Situação / ação</span>
          <span />
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
            const podeLiberar = nc.liberacaoStatus === "NENHUMA" || nc.liberacaoStatus === "REPROVADA";
            const pendente = nc.liberacaoStatus === "PENDENTE";
            return (
              <div
                key={nc.id}
                className="row"
                style={{ gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1.05fr) 126px 124px 92px 92px minmax(0,1.45fr) 40px" }}
              >
                <div className="min-w-0">
                  <div className="nm truncate">{nc.candidatoNome}</div>
                  <div className="meta truncate" title={nc.detalhe ?? ""}>
                    {nc.detalhe ?? "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="meta truncate text-text">{nc.clienteRazao}</div>
                  <div className="meta truncate">Código {nc.codCliente}</div>
                </div>
                <div className="min-w-0">
                  <Pill tone="nt">{nc.tipo}</Pill>
                  <div className="meta mt-1 truncate">{NC_TIPO_ROTULO[nc.tipo]}</div>
                </div>
                <div className="meta truncate">{nc.consultorNome ?? "—"}</div>
                <div className="meta">{fmtDataAdmissao(nc.dataAdmissao)}</div>
                <div className="meta">{fmtData(nc.criadoEm)}</div>

                {/* Situação + ações */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Pill tone={SIT_TONE[nc.situacao]}>{SIT_ROTULO[nc.situacao]}</Pill>

                  {nc.status !== "RESOLVIDA" && nc.situacao !== "LIBERADA_DIRETORIA" && (
                    <button
                      type="button"
                      className="btn-secondary px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                      disabled={acting}
                      onClick={() => patch(nc.id, "/resolver", undefined, "NC resolvida (registro mantido no histórico).")}
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
                        onClick={() => patch(nc.id, "/liberacao/decisao", { aprovar: true }, "Liberação aprovada — exceção reconhecida.")}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                        disabled={acting}
                        onClick={() => patch(nc.id, "/liberacao/decisao", { aprovar: false }, "Liberação reprovada — volta a NC comum.")}
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
            );
          })
        )}
      </GlassCard>

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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,17,31,0.55)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <GlassCard className="panel w-full max-w-md" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
      </GlassCard>
    </div>
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
  const [flags, setFlags] = useState({ semKit: false, semAssinatura: false, cadastroNaoMarcado: false });
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
      apiFetch<{ items: CadAdmissao[] }>(`/esteira/cadastro?q=${encodeURIComponent(term)}`, { token })
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,17,31,0.55)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <GlassCard className="panel w-full max-w-lg" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <h3 className="text-[17px] font-extrabold">Registrar NC de Cadastro</h3>
        <p className="psub !mb-3 mt-1">
          Cadastro incompleto (NC-3). As flags são manuais nesta fase — kit (F9) e assinatura
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
      </GlassCard>
    </div>
  );
}
