"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isValidCpf, normalizeCpf, type ExigenciaDocumento } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { Stepper, type StepDef } from "@/components/nova/Stepper";

// ── Tipos do contrato de API (F6) ──────────────────────────────────────────
interface Cliente {
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
  // Fase 1B — campos expandidos do cliente (informativos + padrões de folha, F1)
  empresaGrupo?: string | null;
  regiao?: string | null;
  descricaoRegiao?: string | null;
  beneficiosPadrao?: string | null;
  escalaPadrao?: string | null;
  enderecoPadrao?: string | null;
}
interface Cargo {
  id: string;
  nome: string;
}
interface ReguaItem {
  tipoDocumentoId: string;
  codigo: string;
  nome: string;
  exigencia: ExigenciaDocumento;
}
interface CandidatoLookup {
  candidato: { cpf: string; nome: string; email: string | null; telefone: string | null } | null;
  admissoes: number;
}
interface CreateResult {
  admissaoId: string;
  sinalizadorPreenchimento: "PENDENTE" | "PARCIAL" | "OK";
  frentes: string[];
  documentos: number;
}

const STEPS: StepDef[] = [
  { label: "Cliente", hint: "Quem contrata" },
  { label: "Vaga / Cargo", hint: "Cargo, régua e folha" },
  { label: "Candidato", hint: "Identidade e admissão" },
];

const VAGA_EMPTY = {
  salario: "",
  beneficios: "",
  tipoContrato: "",
  tempoContrato: "",
  motivo: "",
  centroCusto: "",
  escala: "",
  endereco: "",
  departamento: "",
  gestorBp: "",
};
const CAND_EMPTY = { nome: "", cpf: "", telefone: "", email: "", dataAdmissao: "" };

function formatCpf(value: string): string {
  const d = normalizeCpf(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

// Região do cliente em texto legível (F1): "Região 7 — São José Campos".
function formatRegiao(regiao?: string | null, descricao?: string | null): string {
  const partes = [regiao?.trim(), descricao?.trim()].filter(Boolean);
  return partes.length ? partes.join(" — ") : "—";
}

// Pill por exigência da régua (F5/F2): obrigatório destaca, facultativo dim.
const EXIGENCIA_TONE: Record<ExigenciaDocumento, PillTone> = {
  OBRIGATORIO: "wn",
  FACULTATIVO: "nt",
  NAO_OBRIGATORIO: "nt",
};
const EXIGENCIA_LABEL: Record<ExigenciaDocumento, string> = {
  OBRIGATORIO: "Obrigatório",
  FACULTATIVO: "Facultativo",
  NAO_OBRIGATORIO: "Não obrigatório",
};

/** Campo rotulado (label DS + controle), no grid do admin. */
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="ds-label">{label}</span>
      {children}
    </label>
  );
}

export default function NovaAdmissaoPage() {
  const { token } = useAuth();
  const [step, setStep] = useState(0);

  // Etapa 1 — cliente
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteResults, setClienteResults] = useState<Cliente[]>([]);
  const [clienteSearching, setClienteSearching] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  // Etapa 2 — cargo + régua + folha
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [cargoId, setCargoId] = useState("");
  const [regua, setRegua] = useState<ReguaItem[]>([]);
  const [reguaLoading, setReguaLoading] = useState(false);
  const [vaga, setVaga] = useState(VAGA_EMPTY);

  // Etapa 3 — candidato
  const [cand, setCand] = useState(CAND_EMPTY);
  const [lookup, setLookup] = useState<CandidatoLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [reaproveitado, setReaproveitado] = useState(false);

  // Confirmação
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  const cpfDigits = normalizeCpf(cand.cpf);
  const cpfTouched = cpfDigits.length > 0;
  const cpfValid = isValidCpf(cand.cpf);

  // ── Etapa 1: busca de clientes com debounce (~300ms) ──────────────────────
  useEffect(() => {
    const q = clienteQuery.trim();
    if (!token || !q) {
      setClienteResults([]);
      setClienteSearching(false);
      return;
    }
    setClienteSearching(true);
    const handle = setTimeout(() => {
      apiFetch<Cliente[]>(`/catalogos/clientes?q=${encodeURIComponent(q)}`, { token })
        .then((rows) => setClienteResults(rows))
        .catch(() => setClienteResults([]))
        .finally(() => setClienteSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [clienteQuery, token]);

  // ── Etapa 2: carrega cargos uma vez ───────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    apiFetch<Cargo[]>("/catalogos/cargos", { token })
      .then(setCargos)
      .catch(() => setCargos([]));
  }, [token]);

  // ── Etapa 2: preview da régua quando há cliente + cargo ───────────────────
  useEffect(() => {
    if (!token || !cliente || !cargoId) {
      setRegua([]);
      return;
    }
    setReguaLoading(true);
    const params = `codCliente=${encodeURIComponent(cliente.codCliente)}&cargoId=${encodeURIComponent(cargoId)}`;
    apiFetch<ReguaItem[]>(`/catalogos/regua?${params}`, { token })
      .then(setRegua)
      .catch(() => setRegua([]))
      .finally(() => setReguaLoading(false));
  }, [token, cliente, cargoId]);

  // ── Etapa 3: lookup de candidato por CPF válido (F11), com debounce ───────
  const lastLookup = useRef<string>("");
  useEffect(() => {
    if (!token || !cpfValid) {
      setLookup(null);
      setLookupLoading(false);
      return;
    }
    setLookupLoading(true);
    const handle = setTimeout(() => {
      apiFetch<CandidatoLookup>(`/admissoes/candidato/${cpfDigits}`, { token })
        .then((r) => {
          lastLookup.current = cpfDigits;
          setLookup(r);
        })
        .catch(() => setLookup(null))
        .finally(() => setLookupLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [token, cpfValid, cpfDigits]);

  // F1 — seleção do cliente: aplica os padrões de folha (benefícios/escala/endereço)
  // já no momento da escolha. Preserva edições do usuário: um campo só é reescrito
  // se estiver vazio ou ainda igual ao padrão do cliente anterior (não tocado).
  function selecionarCliente(c: Cliente) {
    const prev = cliente;
    const aplicar = (
      atual: string,
      padraoAnterior?: string | null,
      padraoNovo?: string | null,
    ) => (atual === "" || atual === (padraoAnterior ?? "") ? (padraoNovo ?? "") : atual);

    setVaga((v) => ({
      ...v,
      beneficios: aplicar(v.beneficios, prev?.beneficiosPadrao, c.beneficiosPadrao),
      escala: aplicar(v.escala, prev?.escalaPadrao, c.escalaPadrao),
      endereco: aplicar(v.endereco, prev?.enderecoPadrao, c.enderecoPadrao),
    }));
    setCliente(c);
  }

  const clienteTemPadroes = Boolean(
    cliente?.beneficiosPadrao || cliente?.escalaPadrao || cliente?.enderecoPadrao,
  );

  function reaproveitar() {
    if (!lookup?.candidato) return;
    setCand((c) => ({
      ...c,
      nome: lookup.candidato!.nome,
      email: lookup.candidato!.email ?? "",
      telefone: lookup.candidato!.telefone ?? "",
    }));
    setReaproveitado(true);
  }

  const reguaObrigatorios = useMemo(
    () => regua.filter((r) => r.exigencia === "OBRIGATORIO").length,
    [regua],
  );

  const canConfirm = Boolean(cliente && cargoId && cand.nome.trim() && cpfValid);

  async function confirmar() {
    if (!cliente || !cargoId) return;
    setSubmitting(true);
    setSubmitError(null);

    const vagaFolha = {
      salario: vaga.salario || undefined,
      beneficios: vaga.beneficios || undefined,
      escala: vaga.escala || undefined,
      endereco: vaga.endereco || undefined,
      centroCusto: vaga.centroCusto || undefined,
      departamento: vaga.departamento || undefined,
      gestorBp: vaga.gestorBp || undefined,
      motivo: vaga.motivo || undefined,
      tempoContrato: vaga.tempoContrato || undefined,
    };
    const hasVaga = Object.values(vagaFolha).some((v) => v !== undefined);

    try {
      const res = await apiFetch<CreateResult>("/admissoes", {
        method: "POST",
        token,
        body: {
          codCliente: cliente.codCliente,
          cargoId,
          candidato: {
            cpf: cand.cpf,
            nome: cand.nome.trim(),
            telefone: cand.telefone || undefined,
            email: cand.email || undefined,
          },
          dataAdmissao: cand.dataAdmissao || undefined,
          tipoContrato: vaga.tipoContrato || undefined,
          vagaFolha: hasVaga ? vagaFolha : undefined,
        },
      });
      setResult(res);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Erro ao criar admissão");
    } finally {
      setSubmitting(false);
    }
  }

  function resetWizard() {
    setStep(0);
    setClienteQuery("");
    setClienteResults([]);
    setCliente(null);
    setCargoId("");
    setRegua([]);
    setVaga(VAGA_EMPTY);
    setCand(CAND_EMPTY);
    setLookup(null);
    setReaproveitado(false);
    setSubmitError(null);
    setResult(null);
  }

  // ── Tela de êxito ─────────────────────────────────────────────────────────
  if (result) {
    const sinalTone: PillTone =
      result.sinalizadorPreenchimento === "OK"
        ? "ok"
        : result.sinalizadorPreenchimento === "PARCIAL"
          ? "wn"
          : "nt";
    return (
      <>
        <PageHead eyebrow="Nova admissão" title="Admissão criada" subtitle="Frentes paralelas nascidas (F12)." />
        <GlassCard className="panel max-w-2xl">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[rgba(91,214,138,0.15)] text-ok">
              <Icon name="check" className="h-5 w-5" />
            </span>
            <div>
              <h3>Admissão registrada com sucesso</h3>
              <p className="psub !mb-0 font-mono text-[12.5px]">{result.admissaoId}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <GlassCard className="fk">
              <div className="lbl">Pendências Obrigatórias (F5)</div>
              <div className="mt-2">
                <Pill tone={sinalTone}>{result.sinalizadorPreenchimento}</Pill>
              </div>
            </GlassCard>
            <GlassCard className="fk">
              <div className="num">{result.documentos}</div>
              <div className="lbl">Documentos na régua</div>
            </GlassCard>
            <GlassCard className="fk">
              <div className="num">{result.frentes.length}</div>
              <div className="lbl">Frentes abertas</div>
            </GlassCard>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {result.frentes.map((f) => (
              <Pill key={f} tone="nt">
                {f}
              </Pill>
            ))}
          </div>

          <div className="mt-6">
            <Button onClick={resetWizard}>Nova admissão</Button>
          </div>
        </GlassCard>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Nova admissão"
        title="Cadastro em etapas"
        subtitle="Wizard: cliente → vaga → candidato. Pendências sinalizam, nunca bloqueiam (F4)."
      />

      <GlassCard className="panel">
        <Stepper steps={STEPS} current={step} />

        {/* ── ETAPA 1 — CLIENTE ─────────────────────────────────────────── */}
        {step === 0 && (
          <div className="grid gap-4">
            <Field label="Buscar cliente por razão social, CNPJ, operação ou código">
              <input
                autoFocus
                className="ds-input"
                placeholder="Digite para buscar…"
                value={clienteQuery}
                onChange={(e) => setClienteQuery(e.target.value)}
              />
            </Field>

            {clienteSearching && <p className="text-sm text-faint">Buscando…</p>}

            {!clienteSearching && clienteQuery.trim() && clienteResults.length === 0 && (
              <p className="text-sm text-faint">Nenhum cliente encontrado.</p>
            )}

            {clienteResults.length > 0 && (
              <div className="grid gap-2">
                {clienteResults.map((c) => {
                  const selected = cliente?.codCliente === c.codCliente;
                  return (
                    <button
                      key={c.codCliente}
                      onClick={() => selecionarCliente(c)}
                      className={cnRow(selected)}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{c.razaoSocial}</div>
                        <div className="truncate text-[12.5px] text-dim">
                          Código {c.codCliente}
                          {c.cnpj ? ` · CNPJ ${c.cnpj}` : ""}
                          {c.nomeOperacao ? ` · ${c.nomeOperacao}` : ""}
                        </div>
                      </div>
                      {selected && <Icon name="check" className="h-5 w-5 flex-none text-accent" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* F1 — resumo do cliente selecionado */}
            {cliente && (
              <GlassCard className="p-4">
                <div className="eyebrow">Cliente selecionado</div>
                <div className="text-[15px] font-semibold">{cliente.razaoSocial}</div>
                <div className="mt-1 grid gap-1 text-[13px] text-dim sm:grid-cols-3">
                  <span>
                    Código <b className="text-text">{cliente.codCliente}</b>
                  </span>
                  <span>CNPJ {cliente.cnpj ?? "—"}</span>
                  <span>Operação {cliente.nomeOperacao ?? "—"}</span>
                </div>

                {/* F1 — informativos expandidos (read-only) */}
                <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                  <div>
                    <div className="eyebrow !mb-1">Empresa do grupo</div>
                    <div className="text-[13px] text-dim">{cliente.empresaGrupo ?? "—"}</div>
                  </div>
                  <div>
                    <div className="eyebrow !mb-1">Região</div>
                    <div className="text-[13px] text-dim">
                      {formatRegiao(cliente.regiao, cliente.descricaoRegiao)}
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {/* ── ETAPA 2 — VAGA / CARGO ────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid gap-5">
            {/* F1 — informativos do cliente, contexto da folha (read-only) */}
            {cliente && (
              <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-3">
                <div>
                  <div className="eyebrow !mb-1">Cliente</div>
                  <div className="truncate text-[13px] text-dim">{cliente.razaoSocial}</div>
                </div>
                <div>
                  <div className="eyebrow !mb-1">Empresa do grupo</div>
                  <div className="truncate text-[13px] text-dim">{cliente.empresaGrupo ?? "—"}</div>
                </div>
                <div>
                  <div className="eyebrow !mb-1">Região</div>
                  <div className="truncate text-[13px] text-dim">
                    {formatRegiao(cliente.regiao, cliente.descricaoRegiao)}
                  </div>
                </div>
              </div>
            )}

            <Field label="Cargo *">
              <Select
                value={cargoId}
                onChange={setCargoId}
                placeholder="Selecione o cargo…"
                ariaLabel="Cargo"
                options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </Field>

            {/* Preview do checklist da régua (cliente + cargo) */}
            {cargoId && (
              <GlassCard className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="eyebrow !mb-1">Checklist da régua</div>
                    <p className="text-[12.5px] text-dim">
                      Documentos que esta admissão vai exigir (cliente + cargo).
                    </p>
                  </div>
                  {regua.length > 0 && (
                    <Pill tone="wn">{reguaObrigatorios} obrigatório(s)</Pill>
                  )}
                </div>

                {reguaLoading ? (
                  <p className="text-sm text-faint">Carregando régua…</p>
                ) : regua.length === 0 ? (
                  <p className="text-sm text-faint">
                    Sem régua definida para este cliente + cargo. A admissão pode ser criada mesmo assim (F4).
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    {regua.map((r) => {
                      const dim = r.exigencia === "NAO_OBRIGATORIO";
                      return (
                        <div
                          key={r.tipoDocumentoId}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2",
                            dim && "opacity-55",
                          )}
                        >
                          <span className="truncate text-[13.5px]">
                            <span className="font-mono text-dim">{r.codigo}</span> · {r.nome}
                          </span>
                          <Pill tone={EXIGENCIA_TONE[r.exigencia]}>{EXIGENCIA_LABEL[r.exigencia]}</Pill>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            )}

            {/* Folha / vaga — todos opcionais (F4) */}
            <div>
              <div className="eyebrow">Dados de vaga / folha (opcional)</div>
              {clienteTemPadroes && (
                <p className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-dim">
                  <Icon name="check" className="h-3.5 w-3.5 text-accent" />
                  Pré-preenchido a partir do padrão do cliente — edite à vontade.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Salário">
                  <input
                    className="ds-input"
                    inputMode="decimal"
                    placeholder="1800.00"
                    value={vaga.salario}
                    onChange={(e) => setVaga({ ...vaga, salario: e.target.value })}
                  />
                </Field>
                <Field label="Tipo de contrato">
                  <input
                    className="ds-input"
                    placeholder="CLT"
                    value={vaga.tipoContrato}
                    onChange={(e) => setVaga({ ...vaga, tipoContrato: e.target.value })}
                  />
                </Field>
                <Field label="Tempo de contrato">
                  <input
                    className="ds-input"
                    placeholder="Indeterminado"
                    value={vaga.tempoContrato}
                    onChange={(e) => setVaga({ ...vaga, tempoContrato: e.target.value })}
                  />
                </Field>
                <Field label="Escala">
                  <input
                    className="ds-input"
                    placeholder="6x1"
                    value={vaga.escala}
                    onChange={(e) => setVaga({ ...vaga, escala: e.target.value })}
                  />
                </Field>
                <Field label="Centro de custo">
                  <input
                    className="ds-input"
                    value={vaga.centroCusto}
                    onChange={(e) => setVaga({ ...vaga, centroCusto: e.target.value })}
                  />
                </Field>
                <Field label="Departamento">
                  <input
                    className="ds-input"
                    value={vaga.departamento}
                    onChange={(e) => setVaga({ ...vaga, departamento: e.target.value })}
                  />
                </Field>
                <Field label="Gestor / BP">
                  <input
                    className="ds-input"
                    value={vaga.gestorBp}
                    onChange={(e) => setVaga({ ...vaga, gestorBp: e.target.value })}
                  />
                </Field>
                <Field label="Motivo" className="sm:col-span-2">
                  <input
                    className="ds-input"
                    placeholder="Aumento de quadro, substituição…"
                    value={vaga.motivo}
                    onChange={(e) => setVaga({ ...vaga, motivo: e.target.value })}
                  />
                </Field>
                <Field label="Benefícios" className="sm:col-span-2 lg:col-span-3">
                  <input
                    className="ds-input"
                    placeholder="VT, VR, plano de saúde…"
                    value={vaga.beneficios}
                    onChange={(e) => setVaga({ ...vaga, beneficios: e.target.value })}
                  />
                </Field>
                <Field label="Endereço" className="sm:col-span-2 lg:col-span-3">
                  <input
                    className="ds-input"
                    placeholder="Rua, número, bairro, cidade/UF…"
                    value={vaga.endereco}
                    onChange={(e) => setVaga({ ...vaga, endereco: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── ETAPA 3 — CANDIDATO ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome completo *" className="sm:col-span-2">
                <input
                  className="ds-input"
                  placeholder="Maria Souza"
                  value={cand.nome}
                  onChange={(e) => setCand({ ...cand, nome: e.target.value })}
                />
              </Field>

              <Field label="CPF *">
                <input
                  className={cn(
                    "ds-input",
                    cpfTouched && !cpfValid && "!border-[var(--danger)]",
                    cpfValid && "!border-[var(--ok)]",
                  )}
                  placeholder="000.000.000-00"
                  value={cand.cpf}
                  onChange={(e) => {
                    setCand({ ...cand, cpf: formatCpf(e.target.value) });
                    setReaproveitado(false);
                  }}
                />
                <div className="mt-1.5 h-5">
                  {cpfTouched &&
                    (cpfValid ? (
                      <Pill tone="ok">CPF válido</Pill>
                    ) : (
                      <Pill tone="dg">CPF inválido</Pill>
                    ))}
                </div>
              </Field>

              <Field label="Data prevista de admissão">
                <input
                  type="date"
                  className="ds-input"
                  value={cand.dataAdmissao}
                  onChange={(e) => setCand({ ...cand, dataAdmissao: e.target.value })}
                />
              </Field>

              <Field label="Telefone">
                <input
                  className="ds-input"
                  placeholder="(11) 99999-0000"
                  value={cand.telefone}
                  onChange={(e) => setCand({ ...cand, telefone: e.target.value })}
                />
              </Field>

              <Field label="E-mail">
                <input
                  type="email"
                  className="ds-input"
                  placeholder="maria@exemplo.com"
                  value={cand.email}
                  onChange={(e) => setCand({ ...cand, email: e.target.value })}
                />
              </Field>
            </div>

            {/* F11 — CPF já cadastrado */}
            {lookupLoading && <p className="text-sm text-faint">Verificando histórico do CPF…</p>}

            {lookup?.candidato && (
              <GlassCard className="border-[var(--border-strong)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--sico-warn)] text-warn">
                      <Icon name="users" className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-semibold">CPF já cadastrado</div>
                      <p className="text-[12.5px] text-dim">
                        {lookup.candidato.nome} · {lookup.admissoes} admissão(ões) anterior(es). A nova
                        admissão preserva o histórico do mesmo candidato (F11).
                      </p>
                    </div>
                  </div>
                  {reaproveitado ? (
                    <Pill tone="ok">Dados reaproveitados</Pill>
                  ) : (
                    <Button variant="secondary" onClick={reaproveitar} className="px-3 py-2">
                      Reaproveitar dados
                    </Button>
                  )}
                </div>
              </GlassCard>
            )}

            {submitError && (
              <p
                className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
                role="alert"
              >
                {submitError}
              </p>
            )}
          </div>
        )}

        {/* ── NAVEGAÇÃO ─────────────────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
          <Button
            variant="secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-3 py-2.5"
          >
            <span className="inline-flex items-center gap-2">
              <Icon name="left" className="h-4 w-4" /> Anterior
            </span>
          </Button>

          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => Math.min(2, s + 1))}
              disabled={(step === 0 && !cliente) || (step === 1 && !cargoId)}
              className="px-4 py-2.5"
            >
              <span className="inline-flex items-center gap-2">
                Próximo <Icon name="right" className="h-4 w-4" />
              </span>
            </Button>
          ) : (
            <Button onClick={confirmar} disabled={!canConfirm || submitting} className="px-5 py-2.5">
              {submitting ? "Criando…" : "Confirmar admissão"}
            </Button>
          )}
        </div>
      </GlassCard>
    </>
  );
}

// Linha selecionável de resultado de cliente (glass), realça quando ativa.
function cnRow(selected: boolean): string {
  return cn(
    "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
    selected
      ? "border-[var(--accent)] bg-[var(--surface-2)]"
      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
  );
}
