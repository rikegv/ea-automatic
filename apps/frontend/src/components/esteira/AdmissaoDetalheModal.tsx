"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClicksignStatus, Origem } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { OrigemBadge } from "@/components/ui/OrigemBadge";
import { GoogleDriveLogo } from "@/components/ui/GoogleDriveLogo";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { farolPill } from "@/lib/farol";
import { clicksignPill, temEnvelopeReenviavel } from "@/lib/clicksign";
import { Bloco } from "@/components/ui/Bloco";

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
  // Motivo do declínio (Fase 2): só exibido quando o farol é de declínio; null = "não informado".
  motivoDeclinio: string | null;
  origem: Origem;
  sinalizador: string;
  // Preenchido quando a régua fecha e o prontuário é arquivado no Drive (T4 / Fase 4).
  drivePastaUrl: string | null;
  driveAsoUrl: string | null;
  // Clicksign (INT-4 / F9), status do envelope de assinatura do contrato.
  clicksignStatus: ClicksignStatus;
  temEnvelope: boolean;
  contratoAssinadoDriveUrl: string | null;
  matricula: string | null;
  candidato: {
    nome: string;
    cpf: string;
    email: string | null;
    telefone: string | null;
    dataNascimento: string | null;
  };
  cliente: { codCliente: string; razaoSocial: string; operacao: string | null };
  cargo: string;
  // BLOCO 2: salário/escala/endereço da folha (endereço = o da admissão).
  vagaFolha: { salario: string | null; escala: string | null; endereco: string | null };
  // BLOCO 3: dados do exame (coletados do agendamento). null = exame ainda não agendado.
  exame: {
    data: string | null;
    horario: string | null;
    nomeClinica: string | null;
    local: string | null;
    fornecedor: string | null;
    valor: string | null;
    previsaoAso: string | null;
  } | null;
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
  // Histórico de alterações de campos da admissão (mais recente primeiro). Somente leitura.
  alteracoes?: {
    campo: string;
    valorAnterior: string | null;
    valorNovo: string | null;
    autorNome: string | null;
    criadoEm: string;
  }[];
}

// Rótulos amigáveis dos campos versionados no histórico de alterações.
const CAMPO_ROTULO: Record<string, string> = {
  salario: "Salário",
  dataAdmissao: "Data de admissão",
  data_admissao: "Data de admissão",
  tipoContrato: "Tipo de contrato",
  tipo_contrato: "Tipo de contrato",
  cargo: "Cargo",
  matricula: "Matrícula",
  beneficios: "Benefícios",
  escala: "Escala",
  endereco: "Endereço",
  centroCusto: "Centro de custo",
  centro_custo: "Centro de custo",
  departamento: "Departamento",
  gestorBp: "Gestor BP",
  gestor_bp: "Gestor BP",
  motivo: "Motivo",
  tempoContrato: "Tempo de contrato",
  tempo_contrato: "Tempo de contrato",
  farolGlobal: "Farol global",
  farol_global: "Farol global",
  email: "E-mail",
  telefone: "Telefone",
  nome: "Nome",
};
function campoRotulo(campo: string): string {
  return CAMPO_ROTULO[campo] ?? campo;
}
function fmtDataHora(d?: string | null): string {
  if (!d) return "não informado";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "não informado" : dt.toLocaleString("pt-BR");
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
const FORNECEDOR_ROTULO: Record<string, string> = { MEDICAL: "Medical", LIMER: "Limer" };

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
  if (d.length !== 11) return cpf || "não informado";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "não informado" : dt.toLocaleDateString("pt-BR");
}
// Data de admissão é um `date` (YYYY-MM-DD), formata por partes p/ não sofrer fuso.
function fmtDataAdmissao(d?: string | null): string {
  if (!d) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fmtData(d);
}
function fmtMoeda(v?: string | null): string {
  if (v === null || v === undefined || v === "") return "não informado";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</div>
      <div className="mt-0.5 truncate text-[13.5px] text-text" title={valor}>
        {valor}
      </div>
    </div>
  );
}

/**
 * Modal SOMENTE LEITURA com a ficha da admissão, em BLOCOS (mesmo design do lápis). Não edita nada.
 * BLOCO 1 dados pessoais · 2 trabalho/cadastro · 3 exame · 4 status das frentes · 5 documentos
 * pendentes (só os que faltam). Trilha de passagem e histórico ficam ao fim (auditoria).
 */
export function AdmissaoDetalheModal({
  admissaoId,
  asoAnexado,
  asoValidado,
  onClose,
}: {
  admissaoId: string;
  // Veredito do ASO pela I.A (aba Exame), read-only; ausente (undefined) fora da aba Exame.
  asoAnexado?: boolean;
  asoValidado?: boolean;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<AdmissaoDetalhe | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reenvio por correção (INT-4 / §A.5): loading, erro e o modal de aceite de dupla correção.
  const [reenviando, setReenviando] = useState(false);
  const [reenvioError, setReenvioError] = useState<string | null>(null);
  const [reenvioFlash, setReenvioFlash] = useState<string | null>(null);
  const [duplaCorrecaoMsg, setDuplaCorrecaoMsg] = useState<string | null>(null);

  const carregar = useCallback(() => {
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

  useEffect(() => carregar(), [carregar]);

  // Reenvio por correção. Sem aceite → backend pode responder 409 (origem Pandapé sem aceite),
  // pedindo confirmação de dupla correção: abrimos o modal com o termo de ciência (`message`) e,
  // ao confirmar, repetimos o POST com { aceiteDuplaCorrecao: true }.
  const reenviar = useCallback(
    async (aceiteDuplaCorrecao: boolean) => {
      setReenviando(true);
      setReenvioError(null);
      setReenvioFlash(null);
      try {
        await apiFetch(`/clicksign/${admissaoId}/reenviar-correcao`, {
          method: "POST",
          token,
          body: aceiteDuplaCorrecao ? { aceiteDuplaCorrecao: true } : {},
        });
        setDuplaCorrecaoMsg(null);
        setReenvioFlash("Envelope cancelado e reenviado para correção.");
        carregar();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const body = e.data as { reason?: string; message?: string } | undefined;
          if (body?.reason === "duplaCorrecao") {
            setDuplaCorrecaoMsg(body.message ?? e.message);
            return;
          }
        }
        setDuplaCorrecaoMsg(null);
        setReenvioError(e instanceof ApiError ? e.message : "Falha ao reenviar por correção.");
      } finally {
        setReenviando(false);
      }
    },
    [admissaoId, token, carregar],
  );

  // BLOCO 5: só os documentos que FALTAM (não-entregues). Se vazio, o bloco não aparece.
  const docsPendentes = data?.documentos.filter((d) => d.estado !== "ENTREGUE") ?? [];
  const temAssinatura =
    !!data &&
    (data.temEnvelope ||
      data.clicksignStatus !== "SEM_ENVELOPE" ||
      !!data.contratoAssinadoDriveUrl);
  const temProntuario = !!data && (!!data.drivePastaUrl || !!data.driveAsoUrl);

  return (
    <>
      <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Ficha da admissão">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow !mb-1">Ficha da admissão</div>
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[18px] font-extrabold">
                {data?.candidato.nome ?? (error ? "não informado" : "Carregando…")}
              </h3>
              {data && <OrigemBadge origem={data.origem} className="flex-none" />}
            </div>
            {data && (
              <p className="psub !mb-0 mt-1">Somente leitura · recebido em {fmtData(data.recebidoEm)}</p>
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
          <div className="space-y-4">
            {/* BLOCO 1 — Dados pessoais */}
            <Bloco titulo="Dados pessoais">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Campo rotulo="Nome" valor={data.candidato.nome || "não informado"} />
                <Campo rotulo="CPF" valor={fmtCpf(data.candidato.cpf)} />
                <Campo rotulo="Telefone" valor={data.candidato.telefone || "não informado"} />
                <Campo rotulo="E-mail" valor={data.candidato.email || "não informado"} />
                <Campo
                  rotulo="Data de nascimento"
                  valor={fmtData(data.candidato.dataNascimento)}
                />
              </div>
            </Bloco>

            {/* BLOCO 2 — Trabalho e cadastro */}
            <Bloco titulo="Trabalho e cadastro">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Campo rotulo="Cliente" valor={data.cliente.operacao || data.cliente.razaoSocial} />
                <Campo rotulo="Cargo" valor={data.cargo} />
                <Campo rotulo="Salário" valor={fmtMoeda(data.vagaFolha.salario)} />
                <Campo rotulo="Tipo de contrato" valor={data.tipoContrato || "não informado"} />
                <Campo rotulo="Data de admissão" valor={fmtDataAdmissao(data.dataAdmissao)} />
                <Campo rotulo="Matrícula" valor={data.matricula || "não informado"} />
                <Campo rotulo="Escala" valor={data.vagaFolha.escala || "não informado"} />
                <Campo
                  rotulo="Endereço de trabalho"
                  valor={data.vagaFolha.endereco || "não informado"}
                />
              </div>
            </Bloco>

            {/* BLOCO 3 — Exame admissional (coletado do agendamento) */}
            <Bloco titulo="Exame admissional">
              {data.exame ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Campo rotulo="Data" valor={fmtDataAdmissao(data.exame.data)} />
                  <Campo rotulo="Horário" valor={data.exame.horario || "não informado"} />
                  <Campo rotulo="Clínica" valor={data.exame.nomeClinica || "não informado"} />
                  <Campo rotulo="Local" valor={data.exame.local || "não informado"} />
                  <Campo
                    rotulo="Fornecedor"
                    valor={
                      data.exame.fornecedor
                        ? (FORNECEDOR_ROTULO[data.exame.fornecedor] ?? data.exame.fornecedor)
                        : "não informado"
                    }
                  />
                  <Campo rotulo="Valor do exame" valor={fmtMoeda(data.exame.valor)} />
                  <Campo
                    rotulo="Previsão do ASO"
                    valor={fmtDataAdmissao(data.exame.previsaoAso)}
                  />
                </div>
              ) : (
                <p className="text-[13px] text-faint">Exame ainda não agendado.</p>
              )}
              {/* Veredito do ASO pela I.A (aba Exame), read-only: a I.A decide apto/inapto na leitura. */}
              {asoAnexado !== undefined && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <span className="text-[12.5px] text-dim">ASO (I.A):</span>
                  {asoValidado ? (
                    <Pill tone="ok">ASO validado pela I.A</Pill>
                  ) : asoAnexado ? (
                    <Pill tone="wn">ASO anexado, aguardando validação da I.A</Pill>
                  ) : (
                    <Pill tone="nt">ASO não anexado</Pill>
                  )}
                </div>
              )}
            </Bloco>

            {/* BLOCO 4 — Status das frentes (+ farol, motivo de declínio, assinatura/Drive) */}
            <Bloco titulo="Status das frentes">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-dim">Farol:</span>
                {(() => {
                  const f = farolPill(data.farolGlobal);
                  return <Pill tone={f.tone}>{f.label}</Pill>;
                })()}
                {(data.farolGlobal === "DECLINOU" || data.farolGlobal === "RESCISAO") && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[12.5px]">
                    <span className="text-dim">Motivo do declínio:</span>
                    <span className="font-semibold text-text">
                      {data.motivoDeclinio || "não informado"}
                    </span>
                  </span>
                )}
                <span className="text-[12.5px] text-dim">Pendências:</span>
                <Pill tone={SINAL_TONE[data.sinalizador] ?? "nt"}>
                  {SINAL_ROTULO[data.sinalizador] ?? data.sinalizador}
                </Pill>
              </div>
              {data.pendencias.length > 0 && (
                <p className="mb-3 text-[12.5px] text-warn">{data.pendencias.join(" · ")}</p>
              )}
              <div className="grid gap-2 sm:grid-cols-3">
                {data.frentes.map((f) => (
                  <div
                    key={f.tipo}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
                  >
                    <div className="mb-1.5 text-[12.5px] font-semibold text-text">
                      {FRENTE_ROTULO[f.tipo] ?? f.tipo}
                    </div>
                    <Pill tone={frenteTone(f)}>{f.rotulo}</Pill>
                  </div>
                ))}
                {data.frentes.length === 0 && <p className="text-sm text-faint">Nenhuma frente.</p>}
              </div>

              {/* Assinatura (Clicksign / INT-4) + prontuário/contrato no Drive + reenviar por correção. */}
              {(temAssinatura || temProntuario) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  {temAssinatura && (
                    <>
                      <span className="text-[12.5px] text-dim">Assinatura:</span>
                      {(() => {
                        const c = clicksignPill(data.clicksignStatus);
                        return <Pill tone={c.tone}>{c.label}</Pill>;
                      })()}
                    </>
                  )}
                  {temProntuario && (
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
                  {data.contratoAssinadoDriveUrl && (
                    <a
                      href={data.contratoAssinadoDriveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] font-semibold text-text transition hover:bg-[var(--surface-2)]"
                      title="Abrir contrato assinado no Google Drive"
                    >
                      <GoogleDriveLogo className="h-4 w-4" />
                      Contrato assinado no Drive
                    </a>
                  )}
                  {temEnvelopeReenviavel(data.clicksignStatus) && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-accent disabled:opacity-60"
                      onClick={() => reenviar(false)}
                      disabled={reenviando}
                      title="Cancelar o envelope atual e reenviar para correção"
                    >
                      {reenviando ? (
                        <span
                          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                          aria-hidden="true"
                        />
                      ) : (
                        <Icon name="pen" className="h-3.5 w-3.5" />
                      )}
                      {reenviando ? "Reenviando…" : "Reenviar por correção"}
                    </button>
                  )}
                </div>
              )}
              {reenvioError && (
                <p className="mt-2 text-[12.5px] text-danger" role="alert">
                  {reenvioError}
                </p>
              )}
              {reenvioFlash && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-ok">
                  <Icon name="check" className="h-3.5 w-3.5" /> {reenvioFlash}
                </p>
              )}
            </Bloco>

            {/* BLOCO 5 — Documentos pendentes (só os que faltam; some se não há pendência) */}
            {docsPendentes.length > 0 && (
              <Bloco titulo="Documentos pendentes">
                <div className="space-y-1.5">
                  {docsPendentes.map((d) => (
                    <div
                      key={d.nome}
                      className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] text-text">{d.nome}</div>
                        <div className="text-[11.5px] text-faint">{EXIG_ROTULO[d.exigencia]}</div>
                      </div>
                      <Pill tone={docTone(d.estado)}>
                        {d.estado === "INCONFORME" ? "Inconforme" : "Pendente"}
                      </Pill>
                    </div>
                  ))}
                </div>
              </Bloco>
            )}

            {/* Trilha de passagem (S3) — auditoria, preservada. */}
            {data.passagens.length > 0 && (
              <Bloco titulo="Trilha de passagem (avanços com pendência)">
                <div className="space-y-1.5">
                  {data.passagens.map((p, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-text">{p.rotulo}</span>
                        <span className="text-faint">
                          {p.autor ?? "não informado"} · {fmtData(p.criadoEm)}
                        </span>
                      </div>
                      {p.camposPendentes && <div className="mt-0.5 text-warn">{p.camposPendentes}</div>}
                    </div>
                  ))}
                </div>
              </Bloco>
            )}

            {/* Histórico de alterações — auditoria, preservada. */}
            {data.alteracoes && data.alteracoes.length > 0 && (
              <Bloco titulo="Histórico de alterações">
                <div className="space-y-1.5">
                  {data.alteracoes.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-text">{campoRotulo(a.campo)}</span>
                        <span className="text-faint">
                          {a.autorNome ?? "Sistema"} · {fmtDataHora(a.criadoEm)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-dim">
                        <span className="text-faint line-through">
                          {a.valorAnterior ?? "não informado"}
                        </span>
                        <Icon name="arr" className="h-3 w-3 flex-none text-faint" />
                        <span className="text-text">{a.valorNovo ?? "não informado"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Bloco>
            )}
          </div>
        )}
      </Modal>

      {/* Aceite de dupla correção (§A.5 INT-4), bloqueio ativo: origem Pandapé exige ciência de
        que a correção foi feita no EA Automatic E diretamente no G.I. */}
      <ConfirmDialog
        open={duplaCorrecaoMsg !== null}
        title="Confirmar dupla correção"
        message={duplaCorrecaoMsg ?? ""}
        confirmLabel="Estou ciente, reenviar"
        tone="danger"
        busy={reenviando}
        onConfirm={() => reenviar(true)}
        onCancel={() => setDuplaCorrecaoMsg(null)}
      />
    </>
  );
}
