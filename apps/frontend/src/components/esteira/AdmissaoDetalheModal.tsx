"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { GoogleDriveLogo } from "@/components/ui/GoogleDriveLogo";
import { farolPill } from "@/lib/farol";

interface FrenteDetalhe {
  tipo: string;
  status: string;
  rotulo: string;
  concluida: boolean;
  dataInicio: string | null;
  dataConclusao: string | null;
}
interface DocDetalhe {
  nome: string;
  exigencia: "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";
  estado: "PENDENTE" | "ENTREGUE" | "INCONFORME";
}
interface AdmissaoDetalhe {
  admissaoId: string;
  recebidoEm: string | null;
  dataAdmissao: string | null;
  tipoContrato: string | null;
  farolGlobal: string;
  sinalizador: string;
  // Preenchido quando a régua fecha e o prontuário é arquivado no Drive (T4 / Fase 4).
  drivePastaUrl: string | null;
  driveAsoUrl: string | null;
  candidato: { nome: string; cpf: string; email: string | null; telefone: string | null };
  cliente: { codCliente: string; razaoSocial: string; operacao: string | null };
  cargo: string;
  frentes: FrenteDetalhe[];
  documentos: DocDetalhe[];
  pendencias: string[];
  passagens: {
    tipo: string;
    rotulo: string;
    camposPendentes: string | null;
    autor: string | null;
    criadoEm: string;
  }[];
}

const FRENTE_ROTULO: Record<string, string> = {
  AUDITORIA: "Auditoria",
  EXAME: "Exame",
  CADASTRO_CONTRATO: "Cadastro / Contrato",
};
const SINAL_TONE: Record<string, PillTone> = {
  OK: "ok",
  PARCIAL: "wn",
  PENDENTE: "nt",
  INCONFORMIDADE: "dg",
  COMPETENCIAS: "nt",
};
const SINAL_ROTULO: Record<string, string> = {
  OK: "Completo",
  PARCIAL: "Parcial",
  PENDENTE: "Pendente",
  INCONFORMIDADE: "Inconformidade",
  COMPETENCIAS: "Competências",
};
const EXIG_ROTULO: Record<string, string> = {
  OBRIGATORIO: "Obrigatório",
  NAO_OBRIGATORIO: "Não obrigatório",
  FACULTATIVO: "Facultativo",
};

function frenteTone(f: FrenteDetalhe): PillTone {
  if (f.concluida) return "ok";
  if (f.status === "DECLINOU" || f.status === "CANCELADO") return "dg";
  return "wn";
}
function docTone(estado: string): PillTone {
  if (estado === "ENTREGUE") return "ok";
  if (estado === "INCONFORME") return "dg";
  return "wn";
}
function fmtCpf(cpf: string): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
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

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</div>
      <div className="mt-0.5 truncate text-[13.5px] text-text">{valor}</div>
    </div>
  );
}

/**
 * Item 4 (2C) — modal SOMENTE LEITURA com a ficha da admissão. Não edita: visão rápida do
 * candidato, frentes, checklist de documentos e sinalizador.
 */
export function AdmissaoDetalheModal({
  admissaoId,
  onClose,
}: {
  admissaoId: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<AdmissaoDetalhe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiFetch<AdmissaoDetalhe>(`/esteira/admissao/${admissaoId}`, { token })
      .then((r) => vivo && setData(r))
      .catch(
        (e) => vivo && setError(e instanceof ApiError ? e.message : "Falha ao carregar a ficha."),
      );
    return () => {
      vivo = false;
    };
  }, [admissaoId, token]);

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Ficha da admissão">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Ficha da admissão</div>
          <h3 className="truncate text-[18px] font-extrabold">
            {data?.candidato.nome ?? (error ? "—" : "Carregando…")}
          </h3>
          {data && (
            <p className="psub !mb-0 mt-1">
              Somente leitura · recebido em {fmtData(data.recebidoEm)}
            </p>
          )}
        </div>
        <button
          type="button"
          className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
          onClick={onClose}
          aria-label="Fechar"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-danger">{error}</p>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-faint">Carregando ficha…</p>
      ) : (
        <div className="space-y-5">
          {/* Identificação */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo rotulo="CPF" valor={fmtCpf(data.candidato.cpf)} />
            <Campo rotulo="Telefone" valor={data.candidato.telefone || "—"} />
            <Campo rotulo="E-mail" valor={data.candidato.email || "—"} />
            <Campo rotulo="Cliente" valor={data.cliente.razaoSocial} />
            <Campo rotulo="Cargo" valor={data.cargo} />
            <Campo rotulo="Data de admissão" valor={fmtDataAdmissao(data.dataAdmissao)} />
            <Campo rotulo="Contrato" valor={data.tipoContrato || "—"} />
          </section>

          {/* Farol global da admissão (§A.3) */}
          <section className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-dim">Status:</span>
            {(() => {
              const f = farolPill(data.farolGlobal);
              return <Pill tone={f.tone}>{f.label}</Pill>;
            })()}
            {/* Prontuário no Drive (T4) — só após a régua fechar; pasta ou ASO */}
            {(data.drivePastaUrl || data.driveAsoUrl) && (
              <a
                href={data.drivePastaUrl || data.driveAsoUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] font-semibold text-text transition hover:bg-[var(--surface-2)]"
                title="Abrir prontuário no Google Drive"
              >
                <GoogleDriveLogo className="h-4 w-4" />
                Prontuário no Drive
              </a>
            )}
          </section>

          {/* Sinalizador + pendências obrigatórias (S2) */}
          <section className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-dim">Pendências obrigatórias:</span>
            <Pill tone={SINAL_TONE[data.sinalizador] ?? "nt"}>
              {SINAL_ROTULO[data.sinalizador] ?? data.sinalizador}
            </Pill>
            {data.pendencias.length > 0 && (
              <span className="text-[12.5px] text-warn">{data.pendencias.join(" · ")}</span>
            )}
          </section>

          {/* Trilha de passagem (S3) */}
          {data.passagens.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                Trilha de passagem (avanços com pendência)
              </div>
              <div className="space-y-1.5">
                {data.passagens.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-text">{p.rotulo}</span>
                      <span className="text-faint">
                        {p.autor ?? "—"} · {fmtData(p.criadoEm)}
                      </span>
                    </div>
                    {p.camposPendentes && (
                      <div className="mt-0.5 text-warn">{p.camposPendentes}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Frentes */}
          <section>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">
              Status das frentes
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {data.frentes.map((f) => (
                <div key={f.tipo} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="mb-1.5 text-[12.5px] font-semibold text-text">
                    {FRENTE_ROTULO[f.tipo] ?? f.tipo}
                  </div>
                  <Pill tone={frenteTone(f)}>{f.rotulo}</Pill>
                </div>
              ))}
              {data.frentes.length === 0 && <p className="text-sm text-faint">Nenhuma frente.</p>}
            </div>
          </section>

          {/* Checklist de documentos */}
          <section>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">
              Checklist de documentos
            </div>
            {data.documentos.length === 0 ? (
              <p className="text-sm text-faint">
                Sem régua para este par cliente+cargo (nenhum documento exigido).
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.documentos.map((d) => (
                  <div
                    key={d.nome}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-[var(--surface)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] text-text">{d.nome}</div>
                      <div className="text-[11.5px] text-faint">{EXIG_ROTULO[d.exigencia]}</div>
                    </div>
                    <Pill tone={docTone(d.estado)}>
                      {d.estado === "ENTREGUE"
                        ? "Entregue"
                        : d.estado === "INCONFORME"
                          ? "Inconforme"
                          : "Pendente"}
                    </Pill>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
