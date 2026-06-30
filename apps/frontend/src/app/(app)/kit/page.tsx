"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiUpload, apiDownload, apiOpenInline, ApiError } from "@/lib/api";
import { autoMatch, normalizeNome, podeGerar } from "@/lib/kit";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

// Linha de admissão (subconjunto do que /admissoes devolve — sem CPF, §A.6).
interface AdmRow {
  admissaoId: string;
  candidatoNome: string;
  codCliente: string;
  clienteRazao: string;
  cargoNome: string;
}
interface ListResp {
  items: AdmRow[];
}
interface GerarResp {
  downloadToken: string;
  nomeArquivo: string;
}
// Histórico de kits gerados (T5a). `disponivel=false` → token expirado: ações desabilitadas.
interface KitHistoricoItem {
  token: string;
  admissaoId: string;
  candidatoNome: string;
  nomeArquivo: string;
  criadoEm: string;
  disponivel: boolean;
}
interface HistoricoResp {
  items: KitHistoricoItem[];
}

/** Formata ISO → dd/mm/aaaa hh:mm (pt-BR). */
function fmtDataHora(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(+dt)) return "—";
  return dt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Gerador de kit de assinatura (F9). Seleciona a admissão (busca por nome), envia o PDF-mãe e o
 * backend desmembra a página do candidato; o kit pronto é baixado via token de download de uso único.
 * Nenhum CPF é exibido. O envelope de assinatura (Clicksign / INT-4) é disparado pelo backend.
 */
export default function KitPage() {
  const { token } = useAuth();

  // Busca/seleção de admissão
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<AdmRow[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [erroBusca, setErroBusca] = useState(false);
  const [selecionada, setSelecionada] = useState<AdmRow | null>(null);

  // Arquivo + geração
  const [file, setFile] = useState<File | null>(null);
  const [gerando, setGerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Histórico de kits (T5a)
  const [historico, setHistorico] = useState<KitHistoricoItem[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [histError, setHistError] = useState<string | null>(null);
  const [acaoToken, setAcaoToken] = useState<string | null>(null);
  // Filtros client-side do histórico: busca por nome (sem acento/caixa) + período sobre criadoEm.
  const [histBusca, setHistBusca] = useState("");
  const [histDe, setHistDe] = useState("");
  const [histAte, setHistAte] = useState("");

  const historicoFiltrado = useMemo(() => {
    const alvo = normalizeNome(histBusca);
    const tDe = histDe ? new Date(`${histDe}T00:00:00`).getTime() : null;
    const tAte = histAte ? new Date(`${histAte}T23:59:59.999`).getTime() : null;
    return historico.filter((h) => {
      if (alvo && !normalizeNome(h.candidatoNome).includes(alvo)) return false;
      const t = new Date(h.criadoEm).getTime();
      if (!Number.isNaN(t)) {
        if (tDe !== null && t < tDe) return false;
        if (tAte !== null && t > tAte) return false;
      }
      return true;
    });
  }, [historico, histBusca, histDe, histAte]);

  const histTemFiltro = Boolean(histBusca || histDe || histAte);

  const carregarHistorico = useCallback(async () => {
    if (!token) return;
    setLoadingHist(true);
    setHistError(null);
    try {
      const resp = await apiFetch<HistoricoResp>("/kit/historico", { token });
      setHistorico(resp.items ?? []);
    } catch (e) {
      setHistError(e instanceof ApiError ? e.message : "Falha ao carregar o histórico de kits.");
    } finally {
      setLoadingHist(false);
    }
  }, [token]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  async function visualizar(item: KitHistoricoItem) {
    setAcaoToken(item.token);
    try {
      await apiOpenInline(`/kit/download/${item.token}?inline=1`, token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao abrir o kit.");
    } finally {
      setAcaoToken(null);
    }
  }

  async function baixar(item: KitHistoricoItem) {
    setAcaoToken(item.token);
    try {
      await apiDownload(`/kit/download/${item.token}`, item.nomeArquivo, token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao baixar o kit.");
    } finally {
      setAcaoToken(null);
    }
  }

  // Debounce da busca (~300ms).
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  // Busca por nome/CPF quando há texto; SEM texto (campo só focado) lista as admissões disponíveis
  // — assim o consultor sempre vê o que pode selecionar, em vez de ter de adivinhar o nome.
  useEffect(() => {
    if (!token || !open) {
      setResults([]);
      return;
    }
    let vivo = true;
    setSearching(true);
    setErroBusca(false);
    const qs = debounced ? `?q=${encodeURIComponent(debounced)}` : "";
    apiFetch<ListResp>(`/admissoes${qs}`, { token })
      .then((r) => vivo && setResults(r.items ?? []))
      .catch(() => {
        if (vivo) {
          setResults([]);
          setErroBusca(true);
        }
      })
      .finally(() => vivo && setSearching(false));
    return () => {
      vivo = false;
    };
  }, [debounced, token, open]);

  function selecionar(a: AdmRow) {
    setSelecionada(a);
    setQuery(a.candidatoNome);
    setOpen(false);
    setResults([]);
    setError(null);
    setOk(null);
  }

  // Auto-seleção: se a busca retorna um match inequívoco para o texto digitado, fixa a admissão
  // (reduz a fricção de "digitei o nome mas o botão não habilitou"). Só usa item real da lista.
  useEffect(() => {
    if (selecionada || results.length === 0) return;
    const m = autoMatch(results, query);
    if (m) selecionar(m);
  }, [results, query, selecionada]);

  // Ao sair do campo com um único resultado ainda não fixado, seleciona-o.
  function onBlurBusca() {
    setTimeout(() => setOpen(false), 150);
    if (!selecionada && results.length === 1) selecionar(results[0]);
  }

  const gerar = useCallback(async () => {
    if (!podeGerar(selecionada, file, gerando)) return;
    if (!selecionada || !file) return;
    setGerando(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await apiUpload<GerarResp>(`/kit/${selecionada.admissaoId}/gerar`, fd, token);
      await apiDownload(`/kit/download/${resp.downloadToken}`, resp.nomeArquivo, token);
      setOk(`Kit gerado: ${resp.nomeArquivo}. O download foi iniciado.`);
      void carregarHistorico();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setError(
          "Nenhuma página do PDF casou com este candidato. Confira se enviou o PDF-mãe correto.",
        );
      } else {
        setError(
          e instanceof ApiError
            ? e.message
            : "Falha de rede ao gerar o kit. Verifique a conexão e tente de novo.",
        );
      }
    } finally {
      setGerando(false);
    }
  }, [selecionada, file, gerando, token, carregarHistorico]);

  const habilitado = podeGerar(selecionada, file, gerando);

  return (
    <>
      <PageHead
        eyebrow="Assinatura"
        title="Gerador de kit"
        subtitle="Desmembra o PDF-mãe pela admissão escolhida e baixa o kit pronto para assinatura (F9)."
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* ════ COLUNA ESQUERDA — formulário de geração ════════════════════ */}
        <GlassCard className="space-y-5 p-5">
        {/* ── 1. Admissão ──────────────────────────────────────────────── */}
        <div className="relative">
          <label className="ds-label" htmlFor="kit-busca">
            Admissão (candidato)
          </label>
          <input
            id="kit-busca"
            className="ds-input"
            placeholder="Buscar candidato por nome…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (selecionada) setSelecionada(null);
            }}
            onFocus={() => setOpen(true)}
            onBlur={onBlurBusca}
            autoComplete="off"
            aria-describedby="kit-busca-ajuda"
          />
          {!selecionada && (
            <p id="kit-busca-ajuda" className="mt-1.5 text-[12px] text-dim">
              Selecione a admissão na lista para habilitar a geração.
            </p>
          )}
          {open && (
            <div className="glass absolute left-0 right-0 top-[100%] z-30 mt-1 max-h-64 overflow-auto p-1.5">
              {searching ? (
                <div className="px-3 py-2 text-[13px] text-faint">Buscando…</div>
              ) : erroBusca ? (
                <div className="px-3 py-2 text-[13px] text-danger">
                  Falha ao buscar admissões. Recarregue a página (a sessão pode ter expirado).
                </div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-[13px] text-faint">
                  {query.trim().length > 0
                    ? "Nenhuma admissão encontrada para essa busca."
                    : "Nenhuma admissão disponível."}
                </div>
              ) : (
                results.map((a) => (
                  <button
                    key={a.admissaoId}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionar(a)}
                  >
                    <span className="truncate text-[13.5px] font-semibold">{a.candidatoNome}</span>
                    <span className="truncate text-[12px] text-dim">
                      {a.clienteRazao} · {a.cargoNome}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {selecionada && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px]">
            <Icon name="users" className="h-4 w-4 flex-none text-accent" />
            <span className="min-w-0 truncate">
              <b>{selecionada.candidatoNome}</b> — {selecionada.clienteRazao} ·{" "}
              {selecionada.cargoNome}
            </span>
          </div>
        )}

        {/* ── 2. PDF-mãe ───────────────────────────────────────────────── */}
        <div>
          <span className="ds-label">PDF-mãe</span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
              setOk(null);
            }}
          />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-left text-[13px] text-dim transition hover:bg-[var(--surface-2)]"
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="doc" className="h-4 w-4 flex-none text-accent" />
            {file ? <span className="truncate text-text">{file.name}</span> : "Selecionar PDF-mãe…"}
          </button>
        </div>

        {/* ── Feedback ─────────────────────────────────────────────────── */}
        {error && (
          <p
            className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
        {ok && (
          <p className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
            <Icon name="check" className="h-4 w-4 flex-none" /> {ok}
          </p>
        )}

        {/* ── 3. Gerar ─────────────────────────────────────────────────── */}
        <Button
          onClick={gerar}
          disabled={!habilitado}
          className={cn("w-full justify-center py-3", gerando && "opacity-80")}
        >
          {gerando ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Gerando kit…
            </span>
          ) : (
            "Gerar kit"
          )}
        </Button>
      </GlassCard>

        {/* ════ COLUNA DIREITA — kits gerados (+ espaço futuro p/ Clicksign) ═ */}
        <GlassCard className="list">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-extrabold">Kits gerados</h2>
              <p className="mt-0.5 text-[11.5px] text-faint">
                Disponíveis por 1h após a geração (TTL). Assinatura via Clicksign em breve.
              </p>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent disabled:opacity-50"
              title="Atualizar histórico"
              aria-label="Atualizar histórico"
              disabled={loadingHist}
              onClick={() => void carregarHistorico()}
            >
              <Icon name="arr" className="h-4 w-4" />
            </button>
          </div>

          {/* Busca + filtro por período (client-side) */}
          <div className="flex flex-col gap-3 px-4 pb-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="ds-label" htmlFor="kit-hist-busca">
                Buscar funcionário
              </label>
              <input
                id="kit-hist-busca"
                className="ds-input"
                placeholder="Nome do funcionário…"
                value={histBusca}
                onChange={(e) => setHistBusca(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="ds-label" htmlFor="kit-hist-de">
                De
              </label>
              <input
                id="kit-hist-de"
                type="date"
                className="ds-input"
                value={histDe}
                max={histAte || undefined}
                onChange={(e) => setHistDe(e.target.value)}
              />
            </div>
            <div>
              <label className="ds-label" htmlFor="kit-hist-ate">
                Até
              </label>
              <input
                id="kit-hist-ate"
                type="date"
                className="ds-input"
                value={histAte}
                min={histDe || undefined}
                onChange={(e) => setHistAte(e.target.value)}
              />
            </div>
          </div>

          {loadingHist ? (
            <div className="px-4 py-8 text-center text-sm text-faint">Carregando histórico…</div>
          ) : histError ? (
            <div className="px-4 py-8 text-center text-sm text-danger">{histError}</div>
          ) : historico.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-faint">Nenhum kit gerado ainda.</div>
          ) : historicoFiltrado.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-faint">
              {histTemFiltro
                ? "Nenhum kit corresponde aos filtros atuais."
                : "Nenhum kit gerado ainda."}
            </div>
          ) : (
            <div>
              {historicoFiltrado.map((h) => {
                const ocupado = acaoToken === h.token;
                return (
                  <div
                    key={h.token}
                    className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-3 first:border-t-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-text">
                        {h.candidatoNome}
                      </div>
                      <div className="truncate text-[12px] text-dim">{h.nomeArquivo}</div>
                      <div className="flex items-center gap-2 text-[11.5px] text-faint">
                        {fmtDataHora(h.criadoEm)}
                        {!h.disponivel && (
                          <span className="font-semibold text-warn">· Expirado</span>
                        )}
                      </div>
                    </div>

                    {h.disponivel ? (
                      <div className="flex flex-none items-center gap-1">
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-accent disabled:opacity-50"
                          title="Visualizar (abre em nova aba)"
                          aria-label={`Visualizar kit de ${h.candidatoNome}`}
                          disabled={ocupado}
                          onClick={() => void visualizar(h)}
                        >
                          <Icon name="eye" className="h-[17px] w-[17px]" />
                        </button>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-accent disabled:opacity-50"
                          title="Baixar kit"
                          aria-label={`Baixar kit de ${h.candidatoNome}`}
                          disabled={ocupado}
                          onClick={() => void baixar(h)}
                        >
                          <Icon name="download" className="h-[17px] w-[17px]" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className="flex-none rounded-lg border border-[var(--border)] px-2.5 py-1 text-[12px] font-semibold text-faint"
                        title="Token expirado (TTL 1h) — gere o kit novamente para baixar"
                      >
                        Expirado
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* ── Indicador de processamento (T5b) — overlay destacado ─────────── */}
      {gerando && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.55)] backdrop-blur-sm"
          role="status"
          aria-live="assertive"
        >
          <GlassCard className="mx-4 flex max-w-sm items-center gap-4 px-6 py-5">
            <Icon name="cog" className="h-8 w-8 flex-none animate-spin text-accent" />
            <div className="min-w-0">
              <div className="text-[15px] font-extrabold text-text">Agente trabalhando, aguarde…</div>
              <div className="mt-0.5 text-[13px] text-dim">
                Desmembrando o PDF-mãe e gerando o kit. Pode levar alguns segundos.
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </>
  );
}
