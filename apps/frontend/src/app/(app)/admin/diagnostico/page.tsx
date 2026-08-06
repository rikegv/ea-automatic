"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Modal } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { DependenciaDrawer } from "@/components/diagnostico/DependenciaDrawer";

interface SinalItem {
  // Sinais por admissão trazem admissaoId + candidato; sinais sem pessoa (coleta de VT) não.
  admissaoId?: string;
  candidato?: string;
  detalhe: string;
  horas?: number;
  // Prefixo do md5 do objeto no bucket (coleta de VT). NÃO é PII (§A.6).
  md5Prefixo?: string;
}
interface Sinal {
  chave: string;
  rotulo: string;
  total: number;
  itens: SinalItem[];
}
interface Dependencia {
  nome: string;
  estado: "ok" | "fora" | "degradado" | "indisponivel";
  detalhe: string;
  verificadoEm: string;
  ultimoErro?: string;
}
interface EstadoScheduler {
  ligado: boolean;
  parado: boolean;
  ultimoCicloEm: string | null;
  ultimoCicloOkEm: string | null;
  varridas: number;
  novos: number;
  falhas: number;
  abortado: boolean;
  nota: string | null;
}
// Scheduler da coleta de VT (§A.17 etapa 3): espelha o do Pandapé, com a contagem extra `semAdmissao`
// (arquivos varridos que não casaram com admissão viva).
interface EstadoSchedulerVtColeta {
  ligado: boolean;
  parado: boolean;
  ultimoCicloEm: string | null;
  ultimoCicloOkEm: string | null;
  varridas: number;
  novos: number;
  semAdmissao: number;
  falhas: number;
  abortado: boolean;
  nota: string | null;
}
/** Estado do scheduler da assinatura (INT-4). Contagens próprias: assinados e expirados. */
interface EstadoSchedulerClicksign {
  ligado: boolean;
  parado: boolean;
  ultimoCicloEm: string | null;
  ultimoCicloOkEm: string | null;
  varridas: number;
  assinados: number;
  expirados: number;
  falhas: number;
  nota: string | null;
}
interface Snapshot {
  geradoEm: string;
  sinais: Sinal[];
  fopagSemPasta: Sinal;
  dependencias: Dependencia[];
  ultimaColeta: { quando: string | null; candidato: string | null; arquivos: number; nota: string };
  historico: { familia: string; ultimas24h: number; ultimos7d: number }[];
  scheduler: EstadoScheduler;
  // Estado do scheduler da coleta de VT. Opcional para compatibilidade com snapshots antigos.
  vtColeta?: EstadoSchedulerVtColeta;
  // Estado do scheduler da assinatura Clicksign. Opcional para compatibilidade.
  clicksign?: EstadoSchedulerClicksign;
  /** Verificador de status do Exame (OST Onda 2). */
  exame?: {
    ligado: boolean;
    parado: boolean;
    ultimoCicloEm: string | null;
    ultimoCicloOkEm: string | null;
    varridas: number;
    aguardando: number;
    pendentes: number;
    falhas: number;
    nota: string | null;
    totalAguardando: number;
    totalPendentes: number;
  };
  alerta: { aceso: boolean; total: number; motivos: string[] };
}

const TOM_DEP: Record<Dependencia["estado"], "ok" | "dg" | "wn" | "nt"> = {
  ok: "ok",
  fora: "dg",
  degradado: "wn",
  indisponivel: "nt",
};

/** Ícone curto por sinal (linguagem visual dos cards do Menu Gerencial). */
const ICONE_SINAL: Record<string, IconName> = {
  "pendente-staging": "layers",
  "regua-sem-pasta": "folder",
  "parado-6h": "clock",
  "falha-familia": "alert",
  "fopag-sem-pasta": "folder",
  "drive-vt-sem-casar": "doc",
  // Arquivamento no Drive que não concluiu (ou concluiu incompleto), com o motivo real no detalhe.
  "arquivamento-drive-falhou": "folder",
};

function quando(iso: string | null): string {
  if (!iso) return "não informado";
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * Extrai o cod_cliente do detalhe do sinal "Cliente Fopag sem pasta-pai" (formato do backend:
 * "cliente <cod> (Fopag) sem pasta-pai mapeada"). Alimenta o atalho "Cadastrar pasta", que abre a
 * tela de Pastas do Drive já no escopo Fopag com a chave preenchida.
 */
function codFopagDoDetalhe(detalhe: string): string | null {
  return /cliente\s+(\S+)\s+\(Fopag\)/i.exec(detalhe)?.[1] ?? null;
}

export default function DiagnosticoPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmVoo, setAcaoEmVoo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Qual "porta" está aberta no detalhe: um sinal (pela chave), "historico" ou "coleta".
  const [aberto, setAberto] = useState<string | null>(null);
  /** Dependência aberta no drawer (onda 1). Estado próprio: a porta é o card da faixa 2. */
  const [depAberta, setDepAberta] = useState<Dependencia | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setSnap(await apiFetch<Snapshot>("/diagnostico", { token }));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar o diagnóstico.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void carregar();
  }, [token, carregar]);

  const acao = useCallback(
    async (rota: string, body: Record<string, string>, rotulo: string) => {
      const chave = `${rota}:${Object.values(body).join(":")}`;
      setAcaoEmVoo(chave);
      setAviso(null);
      try {
        const r = await apiFetch<Record<string, unknown>>(`/diagnostico/acao/${rota}`, {
          method: "POST",
          token,
          body,
        });
        setAviso(`${rotulo}: ${JSON.stringify(r)}`);
        await carregar();
      } catch (e) {
        setAviso(e instanceof ApiError ? e.message : "Falha na ação.");
      } finally {
        setAcaoEmVoo(null);
      }
    },
    [token, carregar],
  );

  // Sinais de banco (Bloco 1 + Fopag do Bloco 2) na primeira faixa de KPIs. O "scheduler-parado" vem
  // nos sinais (para acender o alerta no backend), mas sai daqui: tem card próprio, mais rico, na
  // Faixa 3 (estado + resultado do último ciclo + controle).
  const sinais = useMemo(
    () => (snap ? [...snap.sinais.filter((s) => s.chave !== "scheduler-parado"), snap.fopagSemPasta] : []),
    [snap],
  );
  const sinalAberto = useMemo(() => sinais.find((s) => s.chave === aberto) ?? null, [sinais, aberto]);

  // Controle do scheduler (Bloco 5): liga/desliga e disparo manual, sem deploy.
  const acaoScheduler = useCallback(
    async (rota: "toggle" | "rodar-agora", body: Record<string, unknown>, rotulo: string) => {
      setAcaoEmVoo(`scheduler:${rota}`);
      setAviso(null);
      try {
        const r = await apiFetch<Record<string, unknown>>(`/diagnostico/scheduler/${rota}`, {
          method: "POST",
          token,
          body,
        });
        setAviso(`${rotulo}: ${JSON.stringify(r)}`);
        await carregar();
      } catch (e) {
        setAviso(e instanceof ApiError ? e.message : "Falha na ação.");
      } finally {
        setAcaoEmVoo(null);
      }
    },
    [token, carregar],
  );

  // Controle do scheduler da ASSINATURA (INT-4): mesmo padrão dos outros dois, rotas próprias.
  const acaoClicksign = useCallback(
    async (rota: "toggle" | "rodar-agora", body: Record<string, unknown>, rotulo: string) => {
      setAcaoEmVoo(`clicksign:${rota}`);
      setAviso(null);
      try {
        const r = await apiFetch<Record<string, unknown>>(`/diagnostico/clicksign/${rota}`, {
          method: "POST",
          token,
          body,
        });
        setAviso(`${rotulo}: ${JSON.stringify(r)}`);
        await carregar();
      } catch (e) {
        setAviso(e instanceof ApiError ? e.message : "Falha na ação.");
      } finally {
        setAcaoEmVoo(null);
      }
    },
    [token, carregar],
  );

  // Controle do verificador do EXAME (OST Onda 2): mesmo padrão dos outros três, rotas próprias.
  const acaoExame = useCallback(
    async (rota: "toggle" | "rodar-agora", body: Record<string, unknown>, rotulo: string) => {
      setAcaoEmVoo(`exame:${rota}`);
      setAviso(null);
      try {
        const r = await apiFetch<Record<string, unknown>>(`/diagnostico/exame/${rota}`, {
          method: "POST",
          token,
          body,
        });
        setAviso(`${rotulo}: ${JSON.stringify(r)}`);
        await carregar();
      } catch (e) {
        setAviso(e instanceof ApiError ? e.message : "Falha na ação.");
      } finally {
        setAcaoEmVoo(null);
      }
    },
    [token, carregar],
  );

  // Controle do scheduler da coleta de VT (§A.17 etapa 3): mesmo padrão do Pandapé, rotas próprias.
  const acaoVtColeta = useCallback(
    async (rota: "toggle" | "rodar-agora", body: Record<string, unknown>, rotulo: string) => {
      setAcaoEmVoo(`vt-coleta:${rota}`);
      setAviso(null);
      try {
        const r = await apiFetch<Record<string, unknown>>(`/diagnostico/vt-coleta/${rota}`, {
          method: "POST",
          token,
          body,
        });
        setAviso(`${rotulo}: ${JSON.stringify(r)}`);
        await carregar();
      } catch (e) {
        setAviso(e instanceof ApiError ? e.message : "Falha na ação.");
      } finally {
        setAcaoEmVoo(null);
      }
    },
    [token, carregar],
  );

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Diagnóstico Do Sistema"
        subtitle="Estado do sistema num olhar. Clique num card para o detalhe e as ações por alvo."
      />

      {/* Barra de topo: atualizar + carimbo + alerta global */}
      <div className="mb-[14px] flex items-center gap-3">
        <Button variant="secondary" onClick={() => void carregar()} disabled={carregando} className="!py-2">
          {carregando ? "Atualizando…" : "Atualizar"}
        </Button>
        {snap && <span className="text-[12px] text-faint">Gerado em {quando(snap.geradoEm)}</span>}
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold",
            snap?.alerta.aceso
              ? "border-[rgba(214,69,69,0.35)] bg-[rgba(214,69,69,0.1)] text-danger"
              : "border-[rgba(46,158,99,0.35)] bg-[rgba(46,158,99,0.1)] text-ok",
          )}
        >
          <Icon name={snap?.alerta.aceso ? "alert" : "check"} className="h-4 w-4" />
          {snap?.alerta.aceso ? `${snap.alerta.total} problema(s)` : "Tudo saudável"}
        </span>
      </div>

      {erro && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mb-4 break-words rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-dim">
          {aviso}
        </p>
      )}

      {!snap ? (
        <p className="py-10 text-center text-sm text-faint">Carregando diagnóstico…</p>
      ) : (
        <>
          {/* ── FAIXA 1: sinais como KPIs grandes, clicáveis. Zero = saudável (não grita). ── */}
          <div className="mb-[14px] grid grid-cols-2 gap-[12px] sm:grid-cols-3 xl:grid-cols-5">
            {sinais.map((s) => {
              const alerta = s.total > 0;
              const cor = alerta ? "var(--danger)" : "var(--ok)";
              return (
                <GlassCard
                  key={s.chave}
                  as="button"
                  onClick={() => setAberto(s.chave)}
                  className={cn(
                    "fk text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5",
                    alerta && "!border-[rgba(214,69,69,0.45)] ring-1 ring-[rgba(214,69,69,0.35)]",
                  )}
                  aria-label={`${s.rotulo}: ${s.total}`}
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <Icon name={ICONE_SINAL[s.chave] ?? "alert"} className="h-4 w-4" style={{ color: cor, opacity: 0.85 }} />
                    <Icon name={alerta ? "alert" : "check"} className="h-3.5 w-3.5" style={{ color: cor }} />
                  </div>
                  <div className="num" style={{ color: alerta ? cor : undefined }}>
                    {s.total}
                  </div>
                  <div className="lbl">{s.rotulo}</div>
                </GlassCard>
              );
            })}
          </div>

          {/* ── FAIXA 2: dependências como indicadores compactos lado a lado ── */}
          <div className="mb-[14px] grid grid-cols-2 gap-[10px] sm:grid-cols-3 xl:grid-cols-5">
            {snap.dependencias.map((d) => (
              /* CLICÁVEL desde a onda 1: o card diz o estado, o drawer diz o que está acontecendo,
                 desde quando e o que fazer. Antes disto, "degradado" era um beco sem saída. */
              <GlassCard
                key={d.nome}
                as="button"
                onClick={() => setDepAberta(d)}
                className={cn(
                  "flex items-center gap-2.5 text-left transition hover:bg-[var(--surface-2)] !px-3.5 !py-3",
                  (d.estado === "fora" || d.estado === "degradado") &&
                    "!border-[rgba(214,69,69,0.45)] ring-1 ring-[rgba(214,69,69,0.35)]",
                )}
                title={d.detalhe + (d.ultimoErro ? ` (último erro: ${d.ultimoErro})` : "")}
              >
                <StatusPill tone={TOM_DEP[d.estado]} label={d.estado} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-text">{d.nome}</div>
                  <div className="truncate text-[11px] text-faint">{d.detalhe}</div>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* ── FAIXA 3 (compacta): scheduler de coleta + última coleta + histórico ── */}
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
            <GlassCard
              as="button"
              onClick={() => setAberto("scheduler")}
              className={cn(
                "flex items-center justify-between text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5",
                snap.scheduler.parado && "!border-[rgba(214,69,69,0.45)] ring-1 ring-[rgba(214,69,69,0.35)]",
              )}
            >
              <div>
                <div className="lbl !mb-0.5">Scheduler de coleta</div>
                <div
                  className="text-[13.5px] font-semibold"
                  style={{
                    color: snap.scheduler.parado
                      ? "var(--danger)"
                      : snap.scheduler.ligado
                        ? "var(--ok)"
                        : "var(--dim)",
                  }}
                >
                  {snap.scheduler.parado
                    ? "parado"
                    : snap.scheduler.ligado
                      ? `ativo · último ciclo ${snap.scheduler.varridas} varridas, ${snap.scheduler.novos} novos`
                      : "desligado"}
                </div>
              </div>
              <Icon
                name={snap.scheduler.parado ? "alert" : snap.scheduler.ligado ? "check" : "right"}
                className="h-4 w-4"
                style={{ color: snap.scheduler.parado ? "var(--danger)" : "var(--faint)" }}
              />
            </GlassCard>
            {snap.vtColeta && (
              <GlassCard
                as="button"
                onClick={() => setAberto("vt-coleta")}
                className={cn(
                  "flex items-center justify-between text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5",
                  snap.vtColeta.parado && "!border-[rgba(214,69,69,0.45)] ring-1 ring-[rgba(214,69,69,0.35)]",
                )}
              >
                <div>
                  <div className="lbl !mb-0.5">Scheduler da coleta de VT</div>
                  <div
                    className="text-[13.5px] font-semibold"
                    style={{
                      color: snap.vtColeta.parado
                        ? "var(--danger)"
                        : snap.vtColeta.ligado
                          ? "var(--ok)"
                          : "var(--dim)",
                    }}
                  >
                    {snap.vtColeta.parado
                      ? "parado"
                      : snap.vtColeta.ligado
                        ? `ativo · último ciclo ${snap.vtColeta.varridas} varridas, ${snap.vtColeta.novos} novos`
                        : "desligado"}
                  </div>
                </div>
                <Icon
                  name={snap.vtColeta.parado ? "alert" : snap.vtColeta.ligado ? "check" : "right"}
                  className="h-4 w-4"
                  style={{ color: snap.vtColeta.parado ? "var(--danger)" : "var(--faint)" }}
                />
              </GlassCard>
            )}
            {snap.clicksign && (
              <GlassCard
                as="button"
                onClick={() => setAberto("clicksign")}
                className={cn(
                  "flex items-center justify-between text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5",
                  snap.clicksign.parado && "!border-[rgba(214,69,69,0.45)] ring-1 ring-[rgba(214,69,69,0.35)]",
                )}
              >
                <div>
                  <div className="lbl !mb-0.5">Scheduler da assinatura</div>
                  <div
                    className="text-[13.5px] font-semibold"
                    style={{
                      color: snap.clicksign.parado
                        ? "var(--danger)"
                        : snap.clicksign.ligado
                          ? "var(--ok)"
                          : "var(--dim)",
                    }}
                  >
                    {snap.clicksign.parado
                      ? "parado"
                      : snap.clicksign.ligado
                        ? `ativo, último ciclo ${snap.clicksign.varridas} envelope(s)`
                        : "desligado"}
                  </div>
                </div>
                <Icon
                  name={snap.clicksign.parado ? "alert" : snap.clicksign.ligado ? "check" : "right"}
                  className="h-4 w-4"
                  style={{ color: snap.clicksign.parado ? "var(--danger)" : "var(--faint)" }}
                />
              </GlassCard>
            )}
            {snap.exame && (
              <GlassCard
                as="button"
                onClick={() => setAberto("exame")}
                className={cn(
                  "flex items-center justify-between text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5",
                  snap.exame.parado && "!border-[rgba(214,69,69,0.45)] ring-1 ring-[rgba(214,69,69,0.35)]",
                )}
              >
                <div>
                  <div className="lbl !mb-0.5">Verificador do exame</div>
                  <div
                    className="text-[13.5px] font-semibold"
                    style={{
                      color: snap.exame.parado
                        ? "var(--danger)"
                        : snap.exame.ligado
                          ? "var(--ok)"
                          : "var(--dim)",
                    }}
                  >
                    {snap.exame.parado
                      ? "parado"
                      : snap.exame.ligado
                        ? `ativo, ${snap.exame.totalPendentes} com ASO pendente`
                        : "desligado"}
                  </div>
                </div>
                <Icon
                  name={snap.exame.parado ? "alert" : snap.exame.ligado ? "check" : "right"}
                  className="h-4 w-4"
                  style={{ color: snap.exame.parado ? "var(--danger)" : "var(--faint)" }}
                />
              </GlassCard>
            )}
            <GlassCard
              as="button"
              onClick={() => setAberto("coleta")}
              className="flex items-center justify-between text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5"
            >
              <div>
                <div className="lbl !mb-0.5">Última coleta do Pandapé</div>
                <div className="text-[13.5px] font-semibold text-text">
                  {snap.ultimaColeta.quando ? `${snap.ultimaColeta.arquivos} arquivo(s), ${quando(snap.ultimaColeta.quando)}` : "sem registro"}
                </div>
              </div>
              <Icon name="right" className="h-4 w-4 text-faint" />
            </GlassCard>
            <GlassCard
              as="button"
              onClick={() => setAberto("historico")}
              className="flex items-center justify-between text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5"
            >
              <div>
                <div className="lbl !mb-0.5">Falhas por família (24h e 7 dias)</div>
                <div className="text-[13.5px] font-semibold text-text">
                  {snap.historico.reduce((a, h) => a + h.ultimas24h, 0)} em 24h ·{" "}
                  {snap.historico.reduce((a, h) => a + h.ultimos7d, 0)} em 7 dias
                </div>
              </div>
              <Icon name="right" className="h-4 w-4 text-faint" />
            </GlassCard>
          </div>
        </>
      )}

      {/* ── DETALHE de uma DEPENDÊNCIA: o padrão único de 4 blocos (onda 1) ── */}
      {depAberta && (
        <DependenciaDrawer
          dependencia={depAberta}
          onClose={() => setDepAberta(null)}
          onMudou={() => void carregar()}
        />
      )}

      {/* ── DETALHE de um SINAL: lista de afetados + ações por alvo (a porta é o card) ── */}
      {sinalAberto && (
        <Modal onClose={() => setAberto(null)} ariaLabel={sinalAberto.rotulo} className="max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow !mb-1">Sinal</div>
              <h2 className="text-lg font-semibold text-text">{sinalAberto.rotulo}</h2>
            </div>
            <StatusPill tone={sinalAberto.total > 0 ? "wn" : "ok"} label={String(sinalAberto.total)} />
          </div>
          {sinalAberto.total === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">Nenhuma ocorrência. Estado saudável.</p>
          ) : (
            <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
              {sinalAberto.itens.map((it, i) => (
                <div key={it.admissaoId ?? it.md5Prefixo ?? i} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                  {/* Sinais por admissão mostram o candidato; a coleta de VT identifica pelo prefixo do
                      md5 do objeto no bucket (o admin abre o arquivo no bucket), sem PII (§A.6). */}
                  <span className="text-[13.5px] font-semibold text-text">
                    {it.candidato ?? (it.md5Prefixo ? `Arquivo ${it.md5Prefixo}` : "não informado")}
                  </span>
                  <span className="text-[12px] text-dim">{it.detalhe}</span>
                  {typeof it.horas === "number" && it.horas > 0 && (
                    <span className="text-[11.5px] text-faint">há {it.horas}h</span>
                  )}
                  {it.admissaoId && (
                    <div className="ml-auto flex gap-1.5">
                      {sinalAberto.chave === "fopag-sem-pasta" && codFopagDoDetalhe(it.detalhe) && (
                        <Button
                          variant="secondary"
                          className="!py-1 !px-2.5 text-[12px]"
                          onClick={() =>
                            router.push(
                              `/admin/pastas-drive?fopag=${encodeURIComponent(codFopagDoDetalhe(it.detalhe)!)}`,
                            )
                          }
                        >
                          Cadastrar pasta
                        </Button>
                      )}
                      {(sinalAberto.chave === "regua-sem-pasta" || sinalAberto.chave === "fopag-sem-pasta") && (
                        <Button
                          variant="secondary"
                          className="!py-1 !px-2.5 text-[12px]"
                          disabled={acaoEmVoo !== null}
                          onClick={() => void acao("rearquivar", { admissaoId: it.admissaoId! }, "Rearquivar")}
                        >
                          Rearquivar
                        </Button>
                      )}
                      {/* LIGAR À PASTA EXISTENTE: para quando o prontuário JÁ está no Drive e só o
                          link não ficou gravado (arquivamento que caiu no meio). Grava a URL e a
                          admissão sai do card na hora, sem acionar a fábrica. */}
                      {sinalAberto.chave === "regua-sem-pasta" && (
                        <Button
                          variant="secondary"
                          className="!py-1 !px-2.5 text-[12px]"
                          disabled={acaoEmVoo !== null}
                          onClick={() => {
                            const pasta = window.prompt(
                              "Cole o link da pasta do Drive que já tem os documentos deste candidato:",
                              "",
                            );
                            if (pasta?.trim()) {
                              void acao(
                                "ligar-pasta",
                                { admissaoId: it.admissaoId!, pasta: pasta.trim() },
                                "Ligar à pasta existente",
                              );
                            }
                          }}
                        >
                          Ligar à pasta existente
                        </Button>
                      )}
                      {/* ZERAR O SINAL DA DUPLICATA: o diretor decidiu conviver com as pastas
                          extras por ora e removê-las à mão depois, então o que sai é o AVISO. Nada
                          é apagado no Drive (§A.6). Fica registrado quem zerou, e o aviso não volta
                          sozinho enquanto as pastas existirem. */}
                      {sinalAberto.chave === "pasta-duplicada" && (
                        <Button
                          variant="secondary"
                          className="!py-1 !px-2.5 text-[12px]"
                          disabled={acaoEmVoo !== null}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Zerar o sinal de pasta duplicada de ${it.candidato}? ` +
                                  "As pastas continuam no Drive, nada é apagado. A baixa fica registrada com o seu usuário.",
                              )
                            ) {
                              void acao(
                                "zerar-duplicata",
                                { admissaoId: it.admissaoId! },
                                "Zerar sinal",
                              );
                            }
                          }}
                        >
                          Zerar sinal
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        className="!py-1 !px-2.5 text-[12px]"
                        disabled={acaoEmVoo !== null}
                        onClick={() => void acao("repull", { admissaoId: it.admissaoId! }, "Re-pull")}
                      >
                        Re-pull
                      </Button>
                      {/* ZERAR A PENDÊNCIA: o diretor fecha o sinal sozinho quando constatou que o
                          caso está resolvido, sem acionar a fábrica. Fica registrado quem zerou. Se
                          o problema persistir, o próximo arquivamento acende de novo. */}
                      {sinalAberto.chave === "arquivamento-drive-falhou" && (
                        <Button
                          variant="secondary"
                          className="!py-1 !px-2.5 text-[12px]"
                          disabled={acaoEmVoo !== null}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Zerar a pendência de arquivamento de ${it.candidato}? A baixa fica registrada com o seu usuário.`,
                              )
                            ) {
                              void acao(
                                "zerar-pendencia",
                                { admissaoId: it.admissaoId! },
                                "Zerar pendência",
                              );
                            }
                          }}
                        >
                          Zerar pendência
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── DETALHE: última coleta ── */}
      {aberto === "coleta" && snap && (
        <Modal onClose={() => setAberto(null)} ariaLabel="Última coleta do Pandapé" className="max-w-lg">
          <div className="eyebrow !mb-1">Última coleta do Pandapé</div>
          <h2 className="mb-3 text-lg font-semibold text-text">
            {snap.ultimaColeta.quando ? `${snap.ultimaColeta.candidato}` : "Sem coleta registrada"}
          </h2>
          {snap.ultimaColeta.quando && (
            <p className="text-[13.5px] text-text">
              {snap.ultimaColeta.arquivos} arquivo(s), em {quando(snap.ultimaColeta.quando)}.
            </p>
          )}
          <p className="mt-3 rounded-lg border border-[rgba(201,138,18,0.3)] bg-[rgba(201,138,18,0.08)] px-3 py-2 text-[12px] text-warn">
            {snap.ultimaColeta.nota}
          </p>
        </Modal>
      )}

      {/* ── DETALHE: scheduler de coleta (estado + resultado do último ciclo + controle) ── */}
      {aberto === "scheduler" && snap && (
        <Modal onClose={() => setAberto(null)} ariaLabel="Scheduler de coleta" className="max-w-lg">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow !mb-1">Coleta automática</div>
              <h2 className="text-lg font-semibold text-text">Scheduler de re-consulta do Pandapé</h2>
            </div>
            <StatusPill
              tone={snap.scheduler.parado ? "dg" : snap.scheduler.ligado ? "ok" : "nt"}
              label={snap.scheduler.parado ? "parado" : snap.scheduler.ligado ? "ativo" : "desligado"}
            />
          </div>
          <p className="mb-3 text-[12.5px] text-dim">
            Re-consulta as admissões vivas de origem Pandapé a cada 12 minutos: fecha o buraco de o
            documento anexado após a liberação não entrar sozinho (o Pandapé não avisa envio de
            documento). Incremental pela dedup por arquivo: só o que é novo é baixado e auditado.
          </p>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.scheduler.varridas}</div>
              <div className="text-[11px] text-faint">varridas</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.scheduler.novos}</div>
              <div className="text-[11px] text-faint">arquivos novos</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div
                className="text-lg font-bold"
                style={{ color: snap.scheduler.falhas > 0 ? "var(--danger)" : undefined }}
              >
                {snap.scheduler.falhas}
              </div>
              <div className="text-[11px] text-faint">falhas</div>
            </div>
          </div>
          <div className="mb-3 space-y-1 text-[12.5px] text-dim">
            <div>Último ciclo bem-sucedido: {quando(snap.scheduler.ultimoCicloOkEm)}</div>
            {snap.scheduler.abortado && (
              <div className="text-warn">Último ciclo interrompido pelo teto de segurança de IA.</div>
            )}
            {snap.scheduler.nota && <div className="text-faint">Nota: {snap.scheduler.nota}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              disabled={acaoEmVoo !== null || !snap.scheduler.ligado}
              onClick={() => void acaoScheduler("rodar-agora", {}, "Rodar ciclo agora")}
            >
              Rodar ciclo agora
            </Button>
            <Button
              variant={snap.scheduler.ligado ? "secondary" : "primary"}
              disabled={acaoEmVoo !== null}
              onClick={() =>
                void acaoScheduler("toggle", { ligado: !snap.scheduler.ligado }, snap.scheduler.ligado ? "Desligar" : "Ligar")
              }
            >
              {snap.scheduler.ligado ? "Desligar scheduler" : "Ligar scheduler"}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── DETALHE: scheduler da assinatura (INT-4) ── */}
      {aberto === "clicksign" && snap?.clicksign && (
        <Modal onClose={() => setAberto(null)} ariaLabel="Scheduler Da Assinatura" className="max-w-lg">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow !mb-1">Assinatura de contrato</div>
              <h2 className="text-lg font-semibold text-text">Scheduler da assinatura</h2>
            </div>
            <StatusPill
              tone={snap.clicksign.parado ? "dg" : snap.clicksign.ligado ? "ok" : "nt"}
              label={snap.clicksign.parado ? "parado" : snap.clicksign.ligado ? "ativo" : "desligado"}
            />
          </div>
          <p className="mb-3 text-[12.5px] text-dim">
            Consulta os envelopes que estão aguardando assinatura na Clicksign. Fechou, baixa o
            contrato assinado e arquiva no Drive. Foi cancelado, marca cancelado. Passou do prazo de
            30 dias sem nenhum dos dois, marca expirado e acende o sinal.
          </p>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.clicksign.varridas}</div>
              <div className="text-[11px] text-faint">varridas</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.clicksign.assinados}</div>
              <div className="text-[11px] text-faint">assinados</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div
                className="text-lg font-bold"
                style={{ color: snap.clicksign.expirados > 0 ? "var(--danger)" : undefined }}
              >
                {snap.clicksign.expirados}
              </div>
              <div className="text-[11px] text-faint">expirados</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div
                className="text-lg font-bold"
                style={{ color: snap.clicksign.falhas > 0 ? "var(--danger)" : undefined }}
              >
                {snap.clicksign.falhas}
              </div>
              <div className="text-[11px] text-faint">falhas</div>
            </div>
          </div>
          <div className="mb-3 space-y-1 text-[12.5px] text-dim">
            <div>Último ciclo: {quando(snap.clicksign.ultimoCicloEm)}</div>
            <div>Último ciclo bem-sucedido: {quando(snap.clicksign.ultimoCicloOkEm)}</div>
            {snap.clicksign.nota && <div className="text-faint">Nota: {snap.clicksign.nota}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              disabled={acaoEmVoo !== null || !snap.clicksign.ligado}
              onClick={() => void acaoClicksign("rodar-agora", {}, "Rodar ciclo agora")}
            >
              Rodar ciclo agora
            </Button>
            <Button
              variant={snap.clicksign.ligado ? "secondary" : "primary"}
              disabled={acaoEmVoo !== null}
              onClick={() =>
                void acaoClicksign(
                  "toggle",
                  { ligado: !snap.clicksign?.ligado },
                  snap.clicksign?.ligado ? "Desligar" : "Ligar",
                )
              }
            >
              {snap.clicksign.ligado ? "Desligar scheduler" : "Ligar scheduler"}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── DETALHE: verificador de status do Exame (OST Onda 2) ── */}
      {aberto === "exame" && snap?.exame && (
        <Modal onClose={() => setAberto(null)} ariaLabel="Verificador Do Exame" className="max-w-lg">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow !mb-1">Frente de exame</div>
              <h2 className="text-lg font-semibold text-text">Verificador do exame</h2>
            </div>
            <StatusPill
              tone={snap.exame.parado ? "dg" : snap.exame.ligado ? "ok" : "nt"}
              label={snap.exame.parado ? "parado" : snap.exame.ligado ? "ativo" : "desligado"}
            />
          </div>
          <p className="mb-3 text-[12.5px] text-dim">
            De hora em hora, ajusta o status da frente ao que o relógio já decidiu. Exame que passou
            sem ASO anexado vira &quot;ASO Pendente&quot;; previsão do ASO posterior à data do exame
            vira &quot;Aguardando Liberação Do ASO&quot;. Com mais de um endereço no dia, a
            referência é o ÚLTIMO horário. Ele nunca conclui a frente: quem faz isso é o APTO.
          </p>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.exame.varridas}</div>
              <div className="text-[11px] text-faint">varridas</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.exame.totalAguardando}</div>
              <div className="text-[11px] text-faint">aguardando ASO</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div
                className="text-lg font-bold"
                style={{ color: snap.exame.totalPendentes > 0 ? "var(--danger)" : undefined }}
              >
                {snap.exame.totalPendentes}
              </div>
              <div className="text-[11px] text-faint">ASO pendente</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div
                className="text-lg font-bold"
                style={{ color: snap.exame.falhas > 0 ? "var(--danger)" : undefined }}
              >
                {snap.exame.falhas}
              </div>
              <div className="text-[11px] text-faint">falhas</div>
            </div>
          </div>
          <div className="mb-3 space-y-1 text-[12.5px] text-dim">
            <div>Último ciclo: {quando(snap.exame.ultimoCicloEm)}</div>
            <div>Último ciclo bem-sucedido: {quando(snap.exame.ultimoCicloOkEm)}</div>
            {snap.exame.nota && <div className="text-faint">Nota: {snap.exame.nota}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              disabled={acaoEmVoo !== null || !snap.exame.ligado}
              onClick={() => void acaoExame("rodar-agora", {}, "Rodar ciclo agora")}
            >
              Rodar ciclo agora
            </Button>
            <Button
              variant={snap.exame.ligado ? "secondary" : "primary"}
              disabled={acaoEmVoo !== null}
              onClick={() =>
                void acaoExame(
                  "toggle",
                  { ligado: !snap.exame?.ligado },
                  snap.exame?.ligado ? "Desligar" : "Ligar",
                )
              }
            >
              {snap.exame.ligado ? "Desligar verificador" : "Ligar verificador"}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── DETALHE: scheduler da coleta de VT (§A.17 etapa 3) ── */}
      {aberto === "vt-coleta" && snap?.vtColeta && (
        <Modal onClose={() => setAberto(null)} ariaLabel="Scheduler Da Coleta De VT" className="max-w-lg">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow !mb-1">Coleta automática</div>
              <h2 className="text-lg font-semibold text-text">Scheduler da coleta de VT</h2>
            </div>
            <StatusPill
              tone={snap.vtColeta.parado ? "dg" : snap.vtColeta.ligado ? "ok" : "nt"}
              label={snap.vtColeta.parado ? "parado" : snap.vtColeta.ligado ? "ativo" : "desligado"}
            />
          </div>
          <p className="mb-3 text-[12.5px] text-dim">
            Varre a pasta de coleta de formulários de VT e casa cada arquivo com a admissão viva pelo
            CPF. Incremental pela dedup por arquivo: só o que é novo é baixado e arquivado. Arquivos
            que não casam viram o sinal &quot;Formulário de VT no Drive sem casar&quot;.
          </p>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.vtColeta.varridas}</div>
              <div className="text-[11px] text-faint">varridas</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.vtColeta.novos}</div>
              <div className="text-[11px] text-faint">novos</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div className="text-lg font-bold text-text">{snap.vtColeta.semAdmissao}</div>
              <div className="text-[11px] text-faint">sem admissão</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] px-2 py-2">
              <div
                className="text-lg font-bold"
                style={{ color: snap.vtColeta.falhas > 0 ? "var(--danger)" : undefined }}
              >
                {snap.vtColeta.falhas}
              </div>
              <div className="text-[11px] text-faint">falhas</div>
            </div>
          </div>
          <div className="mb-3 space-y-1 text-[12.5px] text-dim">
            <div>Último ciclo: {quando(snap.vtColeta.ultimoCicloEm)}</div>
            <div>Último ciclo bem-sucedido: {quando(snap.vtColeta.ultimoCicloOkEm)}</div>
            {snap.vtColeta.abortado && (
              <div className="text-warn">Último ciclo interrompido pelo teto de segurança.</div>
            )}
            {snap.vtColeta.nota && <div className="text-faint">Nota: {snap.vtColeta.nota}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              disabled={acaoEmVoo !== null || !snap.vtColeta.ligado}
              onClick={() => void acaoVtColeta("rodar-agora", {}, "Rodar ciclo agora")}
            >
              Rodar ciclo agora
            </Button>
            <Button
              variant={snap.vtColeta.ligado ? "secondary" : "primary"}
              disabled={acaoEmVoo !== null}
              onClick={() =>
                void acaoVtColeta("toggle", { ligado: !snap.vtColeta?.ligado }, snap.vtColeta?.ligado ? "Desligar" : "Ligar")
              }
            >
              {snap.vtColeta.ligado ? "Desligar scheduler" : "Ligar scheduler"}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── DETALHE: histórico por família ── */}
      {aberto === "historico" && snap && (
        <Modal onClose={() => setAberto(null)} ariaLabel="Falhas Por Família" className="max-w-lg">
          <div className="eyebrow !mb-1">Histórico</div>
          <h2 className="mb-3 text-lg font-semibold text-text">Falhas por família</h2>
          <div className="space-y-1.5">
            {snap.historico.map((h) => (
              <div key={h.familia} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-[13px]">
                <span className="font-semibold text-text">{h.familia}</span>
                <span className="text-dim">24h: {h.ultimas24h} · 7 dias: {h.ultimos7d}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
