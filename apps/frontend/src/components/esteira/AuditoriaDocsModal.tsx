"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditoriaStatus, ProgressoRegua, ResultadoAuditoria } from "@ea/shared-types";
import { apiFetch, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

// ── Tipos locais (espelham o detalhe de admissão e o catálogo de tipos) ──────
interface DocDetalhe {
  nome: string;
  exigencia: "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";
  estado: "PENDENTE" | "ENTREGUE" | "INCONFORME";
}
interface AdmissaoDetalhe {
  candidato: { nome: string };
  documentos: DocDetalhe[];
}
interface TipoDocumento {
  id: string;
  codigo: string;
  nome: string;
}

/** Resposta do POST de auditoria de UM documento (contrato Fase 4 / F2). */
interface AuditarResp {
  resultado: ResultadoAuditoria;
  documento: { tipoDocumentoId: string; estado: string };
  progresso: ProgressoRegua;
  sinalizador?: string;
  arquivado?: { pastaUrl: string };
}

const EXIG_ROTULO: Record<DocDetalhe["exigencia"], string> = {
  OBRIGATORIO: "Obrigatório",
  NAO_OBRIGATORIO: "Não obrigatório",
  FACULTATIVO: "Facultativo",
};

// Veredito da IA → tom da pill (DESIGN-SYSTEM): validado verde, inconforme vermelho, pendente âmbar.
const STATUS_TONE: Record<AuditoriaStatus, PillTone> = {
  VALIDADO: "ok",
  INCONFORME: "dg",
  PENDENTE: "wn",
};
const STATUS_ROTULO: Record<AuditoriaStatus, string> = {
  VALIDADO: "Validado",
  INCONFORME: "Inconforme",
  PENDENTE: "Pendente",
};
// Estado persistido inicial (antes de auditar nesta sessão) → veredito equivalente para exibição.
const ESTADO_PARA_STATUS: Record<DocDetalhe["estado"], AuditoriaStatus> = {
  ENTREGUE: "VALIDADO",
  INCONFORME: "INCONFORME",
  PENDENTE: "PENDENTE",
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/**
 * Modal de auditoria documental por IA (F2 / INT-3) de uma admissão. Por documento da régua:
 * "Auditar documento" → seleção de arquivo (PDF/JPG/PNG) → spinner → badge do veredito + motivo.
 * Barra de progresso da régua obrigatória ("X de Y validados"). Quando a régua fecha, o backend
 * arquiva no Drive e devolve `arquivado.pastaUrl`, exibido como aviso com link. Nenhum binário é
 * persistido nem exibido; só status e motivo (§A.3 r.7 / §A.6). CPF não aparece aqui.
 */
export function AuditoriaDocsModal({
  admissaoId,
  onClose,
}: {
  admissaoId: string;
  /** Fecha o modal; recebe `true` se houve ao menos uma auditoria (para a lista recarregar). */
  onClose: (mudou: boolean) => void;
}) {
  const { token } = useAuth();
  const [detalhe, setDetalhe] = useState<AdmissaoDetalhe | null>(null);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [progresso, setProgresso] = useState<ProgressoRegua | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado por documento (chave = tipoDocumentoId).
  const [resultados, setResultados] = useState<Record<string, ResultadoAuditoria>>({});
  const [auditandoId, setAuditandoId] = useState<string | null>(null);
  const [erroDoc, setErroDoc] = useState<Record<string, string>>({});
  const [arquivado, setArquivado] = useState<string | null>(null);
  const mudouRef = useRef(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Carga inicial: ficha (documentos), catálogo de tipos e progresso da régua.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      apiFetch<AdmissaoDetalhe>(`/esteira/admissao/${admissaoId}`, { token }),
      apiFetch<TipoDocumento[]>("/catalogos/tipos-documento", { token }),
      apiFetch<ProgressoRegua>(`/esteira/auditoria/${admissaoId}/progresso`, { token }),
    ])
      .then(([det, tip, prog]) => {
        if (!vivo) return;
        setDetalhe(det);
        setTipos(tip);
        setProgresso(prog);
      })
      .catch((e) => {
        if (vivo)
          setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar os documentos.");
      });
    return () => {
      vivo = false;
    };
  }, [admissaoId, token]);

  // Mapa nome do documento → tipoDocumentoId (ambos vêm da mesma tabela TipoDocumento).
  const idPorNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tipos) m.set(t.nome, t.id);
    return m;
  }, [tipos]);

  const auditar = useCallback(
    async (tipoDocumentoId: string, file: File) => {
      setAuditandoId(tipoDocumentoId);
      setErroDoc((e) => ({ ...e, [tipoDocumentoId]: "" }));
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tipoDocumentoId", tipoDocumentoId);
        const resp = await apiUpload<AuditarResp>(
          `/esteira/auditoria/${admissaoId}/documento`,
          fd,
          token,
        );
        mudouRef.current = true;
        setResultados((r) => ({ ...r, [tipoDocumentoId]: resp.resultado }));
        if (resp.progresso) setProgresso(resp.progresso);
        if (resp.arquivado?.pastaUrl) setArquivado(resp.arquivado.pastaUrl);
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha de rede ao auditar o documento. Verifique a conexão e tente de novo.";
        setErroDoc((er) => ({ ...er, [tipoDocumentoId]: msg }));
      } finally {
        setAuditandoId(null);
      }
    },
    [admissaoId, token],
  );

  const documentos = detalhe?.documentos ?? [];
  const pct =
    progresso && progresso.obrigatoriosTotal > 0
      ? Math.round((progresso.obrigatoriosEntregues / progresso.obrigatoriosTotal) * 100)
      : 0;

  return (
    <Modal
      onClose={() => onClose(mudouRef.current)}
      className="max-w-2xl"
      ariaLabel="Auditar documentos"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Auditoria documental por IA</div>
          <h3 className="truncate text-[18px] font-extrabold">
            {detalhe?.candidato.nome ?? (loadError ? "não informado" : "Carregando…")}
          </h3>
          <p className="psub !mb-0 mt-1">
            Envie cada documento para análise. O arquivo é efêmero, guardamos só o veredito.
          </p>
        </div>
        <button
          type="button"
          className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
          onClick={() => onClose(mudouRef.current)}
          aria-label="Fechar"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      {/* ── Barra de progresso da régua obrigatória ──────────────────────── */}
      {progresso && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
            <span className="font-semibold text-text">
              {progresso.obrigatoriosEntregues} de {progresso.obrigatoriosTotal} obrigatórios
              validados
            </span>
            <span className={cn(progresso.completa ? "text-ok" : "text-dim")}>
              {progresso.completa ? "Régua completa" : `${pct}%`}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
            role="progressbar"
            aria-valuenow={progresso.obrigatoriosEntregues}
            aria-valuemin={0}
            aria-valuemax={progresso.obrigatoriosTotal}
            aria-label="Progresso da régua obrigatória"
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${pct}%`,
                background: progresso.completa ? "var(--ok)" : "var(--accent)",
              }}
            />
          </div>
          {progresso.faltantes.length > 0 && (
            <p className="mt-2 text-[12px] text-warn">Faltam: {progresso.faltantes.join(" · ")}</p>
          )}
        </div>
      )}

      {/* ── Aviso de arquivamento no Drive ───────────────────────────────── */}
      {arquivado && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
          <Icon name="check" className="h-4 w-4 flex-none" />
          Prontuário arquivado no Drive.
          <a
            href={arquivado}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent underline"
          >
            Abrir pasta
          </a>
        </p>
      )}

      {/* ── Lista de documentos da régua ─────────────────────────────────── */}
      {loadError ? (
        <p className="py-8 text-center text-sm text-danger">{loadError}</p>
      ) : !detalhe ? (
        <p className="py-8 text-center text-sm text-faint">Carregando documentos…</p>
      ) : documentos.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">
          Sem régua para este par cliente+cargo (nenhum documento exigido).
        </p>
      ) : (
        <div className="space-y-2">
          {documentos.map((d) => {
            const tipoId = idPorNome.get(d.nome);
            const result = tipoId ? resultados[tipoId] : undefined;
            // Veredito a exibir: o desta sessão tem prioridade; senão, o estado persistido.
            const status: AuditoriaStatus = result?.status ?? ESTADO_PARA_STATUS[d.estado];
            const auditando = auditandoId === tipoId;
            const erro = tipoId ? erroDoc[tipoId] : undefined;
            const jaTeveVeredito = Boolean(result) || d.estado !== "PENDENTE";
            return (
              <div key={d.nome} className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-text">{d.nome}</div>
                    <div className="text-[11.5px] text-faint">{EXIG_ROTULO[d.exigencia]}</div>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    {jaTeveVeredito && (
                      <Pill tone={STATUS_TONE[status]}>{STATUS_ROTULO[status]}</Pill>
                    )}
                    <input
                      ref={(el) => {
                        if (tipoId) fileRefs.current[tipoId] = el;
                      }}
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
                      disabled={!tipoId || auditando}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && tipoId) void auditar(tipoId, f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-50"
                      disabled={!tipoId || auditando}
                      title={tipoId ? "Auditar documento" : "Tipo de documento não identificado"}
                      onClick={() => tipoId && fileRefs.current[tipoId]?.click()}
                    >
                      {auditando ? (
                        <>
                          <Spinner /> Processando…
                        </>
                      ) : (
                        <>
                          <Icon name="doc" className="h-4 w-4" />
                          {jaTeveVeredito ? "Reauditar" : "Auditar documento"}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Motivo do veredito (texto da regra, sem PII) */}
                {result?.motivo && (
                  <p
                    className={cn(
                      "mt-2 text-[12.5px]",
                      status === "VALIDADO"
                        ? "text-ok"
                        : status === "INCONFORME"
                          ? "text-danger"
                          : "text-warn",
                    )}
                  >
                    {result.motivo}
                  </p>
                )}
                {erro && (
                  <p className="mt-2 text-[12.5px] text-danger" role="alert">
                    {erro}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/** Spinner inline (Tailwind animate-spin), herda a cor do texto. */
function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}
