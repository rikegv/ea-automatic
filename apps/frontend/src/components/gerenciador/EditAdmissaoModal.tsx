"use client";

import { useEffect, useRef, useState } from "react";
import type { AuditoriaStatus, Origem, ResultadoAuditoria } from "@ea/shared-types";
import { apiFetch, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { OrigemBadge } from "@/components/ui/OrigemBadge";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { FAROL_SELECT_OPTIONS } from "@/lib/farol";

interface VagaFolha {
  salario: string | null;
  beneficios: string | null;
  escala: string | null;
  centroCusto: string | null;
  departamento: string | null;
  gestorBp: string | null;
  motivo: string | null;
  tempoContrato: string | null;
  endereco: string | null;
}
interface CandidatoEdit {
  cpf: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  dataNascimento: string | null;
}
interface AdmissaoEdit {
  admissaoId: string;
  tipoContrato: string | null;
  dataAdmissao: string | null;
  matricula: string | null;
  farolGlobal: string;
  isBanco: boolean;
  origem: Origem;
  vagaFolha: VagaFolha;
  candidato: CandidatoEdit;
}
interface TipoDocumento {
  id: string;
  codigo: string;
  nome: string;
}

const FAROL_OPTS = FAROL_SELECT_OPTIONS;

// Veredito da IA → tom da pill (igual ao AuditoriaDocsModal).
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
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

const s = (v: string | null | undefined) => v ?? "";

// Máscara de exibição do CPF (mesma do AdmissaoDetalheModal) — CPF é somente leitura.
function fmtCpf(cpf: string): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="ds-label">{rotulo}</span>
      {children}
    </div>
  );
}

/**
 * F10 — edição de uma admissão (Gerenciador). Edita vaga/folha + contrato/data/matrícula/farol.
 * NÃO edita CPF nem cliente (identidade — §A.3). Persiste via PATCH /admissoes/:id.
 */
export function EditAdmissaoModal({
  admissaoId,
  candidatoNome,
  onClose,
  onSaved,
  camposFiltro,
}: {
  admissaoId: string;
  candidatoNome: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
  /** Chaves de campo a exibir (S2 — "preencher pendências"); ausente = formulário inteiro. */
  camposFiltro?: string[];
}) {
  const mostra = (campo: string) => !camposFiltro || camposFiltro.includes(campo);
  // Seção Candidato só aparece no formulário inteiro ou se o filtro de pendências pedir
  // explicitamente um campo pessoal (não faz parte do fluxo de pendências hoje).
  const verCandidato = ["nome", "email", "telefone", "dataNascimento"].some(mostra);
  const verProcesso = ["tipoContrato", "dataAdmissao", "matricula", "farol"].some(mostra);
  const verFolha = [
    "salario",
    "escala",
    "centroCusto",
    "departamento",
    "gestorBp",
    "tempoContrato",
    "motivo",
    "beneficios",
    "endereco",
  ].some(mostra);
  const { token } = useAuth();
  const [data, setData] = useState<AdmissaoEdit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form fields
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [tipoContrato, setTipoContrato] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [matricula, setMatricula] = useState("");
  const [farol, setFarol] = useState("EM_ADMISSAO");
  const [isBanco, setIsBanco] = useState(false);
  const [vf, setVf] = useState<VagaFolha>({
    salario: "",
    beneficios: "",
    escala: "",
    centroCusto: "",
    departamento: "",
    gestorBp: "",
    motivo: "",
    tempoContrato: "",
    endereco: "",
  });

  // Termo de Banco (upload via endpoint de auditoria, fora da régua) — Item 6.
  const [tiposDoc, setTiposDoc] = useState<TipoDocumento[]>([]);
  const [termoBuscando, setTermoBuscando] = useState(false);
  const [termoResult, setTermoResult] = useState<ResultadoAuditoria | null>(null);
  const [termoErro, setTermoErro] = useState<string | null>(null);
  const termoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    apiFetch<TipoDocumento[]>("/catalogos/tipos-documento", { token })
      .then(setTiposDoc)
      .catch(() => setTiposDoc([]));
  }, [token]);

  useEffect(() => {
    apiFetch<AdmissaoEdit>(`/admissoes/${admissaoId}`, { token })
      .then((r) => {
        setData(r);
        setCpf(s(r.candidato.cpf));
        setNome(s(r.candidato.nome));
        setEmail(s(r.candidato.email));
        setTelefone(s(r.candidato.telefone));
        setDataNascimento(s(r.candidato.dataNascimento).slice(0, 10));
        setTipoContrato(s(r.tipoContrato));
        setDataAdmissao(s(r.dataAdmissao).slice(0, 10));
        setMatricula(s(r.matricula));
        setFarol(r.farolGlobal);
        setIsBanco(Boolean(r.isBanco));
        setVf({
          salario: s(r.vagaFolha.salario),
          beneficios: s(r.vagaFolha.beneficios),
          escala: s(r.vagaFolha.escala),
          centroCusto: s(r.vagaFolha.centroCusto),
          departamento: s(r.vagaFolha.departamento),
          gestorBp: s(r.vagaFolha.gestorBp),
          motivo: s(r.vagaFolha.motivo),
          tempoContrato: s(r.vagaFolha.tempoContrato),
          endereco: s(r.vagaFolha.endereco),
        });
      })
      .catch((e) =>
        setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar a admissão."),
      );
  }, [admissaoId, token]);

  const setVfField = (k: keyof VagaFolha) => (v: string) => setVf((f) => ({ ...f, [k]: v }));

  const termoTipoId = tiposDoc.find((t) => t.codigo === "TERMO_BANCO")?.id;

  async function enviarTermoBanco(file: File) {
    if (!termoTipoId) {
      setTermoErro("Tipo de documento TERMO_BANCO não encontrado no catálogo.");
      return;
    }
    setTermoBuscando(true);
    setTermoErro(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipoDocumentoId", termoTipoId);
      const resp = await apiUpload<{ resultado: ResultadoAuditoria }>(
        `/esteira/auditoria/${admissaoId}/documento`,
        fd,
        token,
      );
      setTermoResult(resp.resultado);
    } catch (e) {
      setTermoErro(e instanceof ApiError ? e.message : "Falha ao enviar o Termo de Banco.");
    } finally {
      setTermoBuscando(false);
    }
  }

  async function salvar() {
    // Nome do candidato é obrigatório — bloqueia no client (o backend manteria o anterior).
    if (verCandidato && !nome.trim()) {
      setErro("O nome do candidato é obrigatório.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await apiFetch(`/admissoes/${admissaoId}`, {
        method: "PATCH",
        token,
        body: {
          tipoContrato,
          dataAdmissao: dataAdmissao || "",
          matricula,
          farolGlobal: farol,
          isBanco,
          vagaFolha: vf,
          candidato: { nome, email, telefone, dataNascimento },
        },
      });
      onSaved(`Admissão de ${candidatoNome} atualizada.`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Editar admissão">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Editar admissão</div>
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-[18px] font-extrabold">{candidatoNome}</h3>
            {data && <OrigemBadge origem={data.origem} className="flex-none" />}
          </div>
          <p className="psub !mb-0 mt-1">CPF e cliente não são editáveis (identidade).</p>
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

      {loadError ? (
        <p className="py-8 text-center text-sm text-danger">{loadError}</p>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-faint">Carregando…</p>
      ) : (
        <div className="space-y-5">
          {camposFiltro && (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-dim">
              Preenchendo apenas as pendências obrigatórias.
            </p>
          )}
          {verCandidato && (
            <section>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">Candidato</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="CPF (identidade — não editável)">
                  <input
                    className="ds-input"
                    value={fmtCpf(cpf)}
                    readOnly
                    disabled
                    aria-label="CPF do candidato"
                  />
                </Campo>
                {mostra("nome") && (
                  <Campo rotulo="Nome">
                    <input
                      className="ds-input"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("email") && (
                  <Campo rotulo="E-mail">
                    <input
                      type="email"
                      className="ds-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("telefone") && (
                  <Campo rotulo="Telefone">
                    <input
                      className="ds-input"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("dataNascimento") && (
                  <Campo rotulo="Data de nascimento">
                    <input
                      type="date"
                      className="ds-input"
                      value={dataNascimento}
                      onChange={(e) => setDataNascimento(e.target.value)}
                    />
                  </Campo>
                )}
              </div>
            </section>
          )}

          {verProcesso && (
            <section>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">Processo</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {mostra("tipoContrato") && (
                  <Campo rotulo="Tipo de contrato">
                    <input
                      className="ds-input"
                      value={tipoContrato}
                      onChange={(e) => setTipoContrato(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("dataAdmissao") && (
                  <Campo rotulo="Data de admissão">
                    <input
                      type="date"
                      className="ds-input"
                      value={dataAdmissao}
                      onChange={(e) => setDataAdmissao(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("matricula") && (
                  <Campo rotulo="Matrícula">
                    <input
                      className="ds-input"
                      value={matricula}
                      onChange={(e) => setMatricula(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("farol") && (
                  <Campo rotulo="Status (farol)">
                    <Select
                      value={farol}
                      onChange={setFarol}
                      options={FAROL_OPTS}
                      ariaLabel="Farol"
                    />
                  </Campo>
                )}
              </div>

              {/* Item 6 — admissão de banco + Termo de Banco */}
              {mostra("isBanco") && (
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                      checked={isBanco}
                      onChange={(e) => setIsBanco(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="text-[13.5px] font-semibold text-text">
                        Admissão de banco
                      </span>
                      <span className="mt-0.5 block text-[12px] text-dim">
                        Para admissão de banco, a ausência de data de admissão é esperada (não é
                        pendência); o Termo de Banco é a pendência de formalização.
                      </span>
                    </span>
                  </label>

                  {isBanco && (
                    <div className="mt-3 border-t border-[var(--border)] pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={termoRef}
                          type="file"
                          accept={ACCEPT}
                          className="hidden"
                          disabled={!termoTipoId || termoBuscando}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void enviarTermoBanco(f);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-50"
                          disabled={!termoTipoId || termoBuscando}
                          title={
                            termoTipoId
                              ? "Enviar Termo de Banco"
                              : "Tipo TERMO_BANCO não encontrado"
                          }
                          onClick={() => termoRef.current?.click()}
                        >
                          {termoBuscando ? (
                            <>
                              <span
                                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                                aria-hidden="true"
                              />
                              Enviando…
                            </>
                          ) : (
                            <>
                              <Icon name="doc" className="h-4 w-4" />
                              {termoResult ? "Reenviar Termo de Banco" : "Termo de Banco"}
                            </>
                          )}
                        </button>
                        {termoResult && (
                          <Pill tone={STATUS_TONE[termoResult.status]}>
                            {STATUS_ROTULO[termoResult.status]}
                          </Pill>
                        )}
                      </div>
                      <p className="mt-2 text-[12px] text-dim">
                        O documento-modelo será fornecido pelo diretor. O upload registra o
                        documento (vai ao Drive na pasta ADMISSÃO no fluxo de arquivamento).
                      </p>
                      {termoResult?.motivo && (
                        <p
                          className={cn(
                            "mt-1 text-[12.5px]",
                            termoResult.status === "VALIDADO"
                              ? "text-ok"
                              : termoResult.status === "INCONFORME"
                                ? "text-danger"
                                : "text-warn",
                          )}
                        >
                          {termoResult.motivo}
                        </p>
                      )}
                      {termoErro && (
                        <p className="mt-1 text-[12.5px] text-danger" role="alert">
                          {termoErro}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {verFolha && (
            <section>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                Vaga / folha
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {mostra("salario") && (
                  <Campo rotulo="Salário">
                    <input
                      className="ds-input"
                      inputMode="decimal"
                      value={vf.salario ?? ""}
                      onChange={(e) => setVfField("salario")(e.target.value)}
                      placeholder="0,00"
                    />
                  </Campo>
                )}
                {mostra("escala") && (
                  <Campo rotulo="Escala">
                    <input
                      className="ds-input"
                      value={vf.escala ?? ""}
                      onChange={(e) => setVfField("escala")(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("centroCusto") && (
                  <Campo rotulo="Centro de custo">
                    <input
                      className="ds-input"
                      value={vf.centroCusto ?? ""}
                      onChange={(e) => setVfField("centroCusto")(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("departamento") && (
                  <Campo rotulo="Departamento">
                    <input
                      className="ds-input"
                      value={vf.departamento ?? ""}
                      onChange={(e) => setVfField("departamento")(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("gestorBp") && (
                  <Campo rotulo="Gestor / BP">
                    <input
                      className="ds-input"
                      value={vf.gestorBp ?? ""}
                      onChange={(e) => setVfField("gestorBp")(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("tempoContrato") && (
                  <Campo rotulo="Tempo de contrato">
                    <input
                      className="ds-input"
                      value={vf.tempoContrato ?? ""}
                      onChange={(e) => setVfField("tempoContrato")(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("motivo") && (
                  <Campo rotulo="Motivo">
                    <input
                      className="ds-input"
                      value={vf.motivo ?? ""}
                      onChange={(e) => setVfField("motivo")(e.target.value)}
                    />
                  </Campo>
                )}
              </div>
              <div className="mt-3 grid gap-3">
                {mostra("beneficios") && (
                  <Campo rotulo="Benefícios">
                    <textarea
                      className="ds-input min-h-[64px] resize-y"
                      value={vf.beneficios ?? ""}
                      onChange={(e) => setVfField("beneficios")(e.target.value)}
                    />
                  </Campo>
                )}
                {mostra("endereco") && (
                  <Campo rotulo="Endereço">
                    <textarea
                      className="ds-input min-h-[64px] resize-y"
                      value={vf.endereco ?? ""}
                      onChange={(e) => setVfField("endereco")(e.target.value)}
                    />
                  </Campo>
                )}
              </div>
            </section>
          )}

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button className="px-4 py-2.5" onClick={salvar} disabled={busy}>
              {busy ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
