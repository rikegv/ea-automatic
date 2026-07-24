"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Modal } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

interface SinalItem {
  admissaoId: string;
  candidato: string;
  detalhe: string;
  horas?: number;
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
interface Snapshot {
  geradoEm: string;
  sinais: Sinal[];
  fopagSemPasta: Sinal;
  dependencias: Dependencia[];
  ultimaColeta: { quando: string | null; candidato: string | null; arquivos: number; nota: string };
  historico: { familia: string; ultimas24h: number; ultimos7d: number }[];
  scheduler: EstadoScheduler;
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
};

function quando(iso: string | null): string {
  if (!iso) return "não informado";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function DiagnosticoPage() {
  const { token } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmVoo, setAcaoEmVoo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Qual "porta" está aberta no detalhe: um sinal (pela chave), "historico" ou "coleta".
  const [aberto, setAberto] = useState<string | null>(null);

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

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Diagnóstico do sistema"
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
              <GlassCard
                key={d.nome}
                className="flex items-center gap-2.5 !px-3.5 !py-3"
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
              {sinalAberto.itens.map((it) => (
                <div key={it.admissaoId} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                  <span className="text-[13.5px] font-semibold text-text">{it.candidato}</span>
                  <span className="text-[12px] text-dim">{it.detalhe}</span>
                  {typeof it.horas === "number" && it.horas > 0 && (
                    <span className="text-[11.5px] text-faint">há {it.horas}h</span>
                  )}
                  <div className="ml-auto flex gap-1.5">
                    {(sinalAberto.chave === "regua-sem-pasta" || sinalAberto.chave === "fopag-sem-pasta") && (
                      <Button
                        variant="secondary"
                        className="!py-1 !px-2.5 text-[12px]"
                        disabled={acaoEmVoo !== null}
                        onClick={() => void acao("rearquivar", { admissaoId: it.admissaoId }, "Rearquivar")}
                      >
                        Rearquivar
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      className="!py-1 !px-2.5 text-[12px]"
                      disabled={acaoEmVoo !== null}
                      onClick={() => void acao("repull", { admissaoId: it.admissaoId }, "Re-pull")}
                    >
                      Re-pull
                    </Button>
                  </div>
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

      {/* ── DETALHE: histórico por família ── */}
      {aberto === "historico" && snap && (
        <Modal onClose={() => setAberto(null)} ariaLabel="Falhas por família" className="max-w-lg">
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
