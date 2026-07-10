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
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Stepper, type StepDef } from "@/components/nova/Stepper";

// ── Tipos do contrato de API (F6) ──────────────────────────────────────────
interface Cliente {
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
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
interface CatItem {
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

// W5: tipo de contrato, valores fixos.
const TIPOS_CONTRATO = ["Temporário", "Terceirizado", "Estágio", "Interno", "Fopag", "Jovem Aprendiz"];
// OST Regras de Fluxo, item 5: tempo de contrato em lista fixa (dias), sem digitação livre.
const TEMPOS_CONTRATO = ["30", "60", "90", "120", "150", "180", "210", "240", "270"];
const MOTIVO_SUBSTITUICAO = "Substituição";
// OST Regras de Fluxo, item 3: benefícios que abrem campo de valor editável ao serem selecionados.
const BENEFICIOS_COM_VALOR = ["VR", "AM"];
// Prefixo estável ("VR"/"AM") do benefício, usado como chave do valor-padrão por cliente (item 4).
function prefixoBeneficio(nome: string): string | null {
  const up = nome.trim().toUpperCase();
  return BENEFICIOS_COM_VALOR.find((p) => up.startsWith(p)) ?? null;
}
function precisaValorBeneficio(nome: string): boolean {
  return prefixoBeneficio(nome) !== null;
}

const VAGA_EMPTY = {
  salario: "",
  tipoContrato: "",
  tempoContrato: "",
  motivo: "",
  centroCusto: "",
  escala: "",
  endereco: "",
  departamento: "",
  gestorBp: "",
  substituidoNome: "",
  substituidoCpf: "",
};
const CAND_EMPTY = { nome: "", cpf: "", telefone: "", email: "", dataAdmissao: "", dataNascimento: "" };

function formatCpf(value: string): string {
  const d = normalizeCpf(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}
function formatRegiao(regiao?: string | null, descricao?: string | null): string {
  const partes = [regiao?.trim(), descricao?.trim()].filter(Boolean);
  return partes.length ? partes.join(", ") : "não informado";
}
function calcIdade(nasc: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nasc);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hoje = new Date();
  let idade = hoje.getFullYear() - y;
  if (hoje.getMonth() + 1 < mo || (hoje.getMonth() + 1 === mo && hoje.getDate() < d)) idade--;
  return idade;
}

const EXIGENCIA_LABEL: Record<ExigenciaDocumento, string> = {
  OBRIGATORIO: "Obrigatório",
  FACULTATIVO: "Facultativo",
  NAO_OBRIGATORIO: "Não obrigatório",
};

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
  const { token, isAdmin } = useAuth();
  const [step, setStep] = useState(0);

  // Etapa 1: cliente
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteResults, setClienteResults] = useState<Cliente[]>([]);
  const [clienteSearching, setClienteSearching] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  // Etapa 2: cargo + régua + folha
  // Item 1 (TRAVA): só cargos com régua cadastrada para o cliente. Sem régua = trava, nunca catálogo.
  const [cargosCliente, setCargosCliente] = useState<Cargo[]>([]);
  const [clienteTemRegua, setClienteTemRegua] = useState<boolean | null>(null);
  const [cargoId, setCargoId] = useState("");
  const [regua, setRegua] = useState<ReguaItem[]>([]);
  const [reguaLoading, setReguaLoading] = useState(false);
  const [docsAbertos, setDocsAbertos] = useState(false); // W1: recolhido por padrão
  const [vaga, setVaga] = useState(VAGA_EMPTY);
  const [beneficiosSel, setBeneficiosSel] = useState<string[]>([]);
  // Item 3: valor por benefício (VR/AM), editável; combinado ao texto de benefícios no envio.
  const [beneficiosValores, setBeneficiosValores] = useState<Record<string, string>>({});
  // Item 4: valores-padrão de VR/AM DAQUELE cliente (chave "VR"/"AM"), pré-preenchem o campo.
  const [beneficiosPadraoCliente, setBeneficiosPadraoCliente] = useState<Record<string, string>>({});

  // catálogos abertos (W2/W3/W4)
  const [motivos, setMotivos] = useState<CatItem[]>([]);
  const [beneficios, setBeneficios] = useState<CatItem[]>([]);
  const [escalas, setEscalas] = useState<CatItem[]>([]);

  // Etapa 3: candidato
  const [cand, setCand] = useState(CAND_EMPTY);
  const [lookup, setLookup] = useState<CandidatoLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [reaproveitado, setReaproveitado] = useState(false);

  // Confirmação + aceite (W6)
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [aceiteCampos, setAceiteCampos] = useState<string[] | null>(null);
  const [catErro, setCatErro] = useState<string | null>(null);

  const cpfDigits = normalizeCpf(cand.cpf);
  const cpfTouched = cpfDigits.length > 0;
  const cpfValid = isValidCpf(cand.cpf);
  const idade = useMemo(() => calcIdade(cand.dataNascimento), [cand.dataNascimento]);
  const menorIdade = idade !== null && idade < 18;
  const ehSubstituicao = vaga.motivo === MOTIVO_SUBSTITUICAO;

  // Item 4: valor efetivo do benefício = o que o consultor digitou; se intocado, o padrão do cliente.
  const valorBeneficio = (nome: string): string => {
    if (beneficiosValores[nome] !== undefined) return beneficiosValores[nome];
    const p = prefixoBeneficio(nome);
    return (p && beneficiosPadraoCliente[p]) || "";
  };

  // ── Etapa 1: busca de clientes (debounce ~300ms) ──────────────────────────
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
        .then(setClienteResults)
        .catch(() => setClienteResults([]))
        .finally(() => setClienteSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [clienteQuery, token]);

  // ── cargos + catálogos (uma vez) ──────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    apiFetch<CatItem[]>("/catalogos/motivos", { token }).then(setMotivos).catch(() => setMotivos([]));
    apiFetch<CatItem[]>("/catalogos/beneficios", { token }).then(setBeneficios).catch(() => setBeneficios([]));
    apiFetch<CatItem[]>("/catalogos/escalas", { token }).then(setEscalas).catch(() => setEscalas([]));
  }, [token]);

  // ── Item 1: cargos com régua do cliente selecionado (com fallback) ─────────
  // Ao trocar de cliente, busca os cargos que têm régua para ele. `temRegua=false` (cliente sem
  // régua cadastrada) cai no catálogo global: nunca lista vazia parecendo quebrada (decisão OST).
  useEffect(() => {
    if (!token || !cliente) {
      setCargosCliente([]);
      setClienteTemRegua(null);
      setBeneficiosPadraoCliente({});
      return;
    }
    setClienteTemRegua(null);
    apiFetch<{ temRegua: boolean; cargos: Cargo[] }>(
      `/catalogos/cargos-por-cliente?codCliente=${encodeURIComponent(cliente.codCliente)}`,
      { token },
    )
      .then((r) => {
        setCargosCliente(r.cargos);
        setClienteTemRegua(r.temRegua);
      })
      .catch(() => {
        setCargosCliente([]);
        setClienteTemRegua(false);
      });
    // Item 4: valores-padrão de VR/AM salvos deste cliente (pré-preenchem o campo de valor).
    apiFetch<Record<string, string>>(
      `/catalogos/beneficios-padrao-cliente?codCliente=${encodeURIComponent(cliente.codCliente)}`,
      { token },
    )
      .then((r) => setBeneficiosPadraoCliente(r ?? {}))
      .catch(() => setBeneficiosPadraoCliente({}));
  }, [token, cliente]);

  // ── Etapa 2: preview da régua ─────────────────────────────────────────────
  useEffect(() => {
    if (!token || !cliente || !cargoId) {
      setRegua([]);
      return;
    }
    setReguaLoading(true);
    setDocsAbertos(false);
    const params = `codCliente=${encodeURIComponent(cliente.codCliente)}&cargoId=${encodeURIComponent(cargoId)}`;
    apiFetch<ReguaItem[]>(`/catalogos/regua?${params}`, { token })
      .then(setRegua)
      .catch(() => setRegua([]))
      .finally(() => setReguaLoading(false));
  }, [token, cliente, cargoId]);

  // ── Etapa 3: lookup por CPF (F11) ─────────────────────────────────────────
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

  function selecionarCliente(c: Cliente) {
    const prev = cliente;
    const aplicar = (atual: string, padraoAnterior?: string | null, padraoNovo?: string | null) =>
      atual === "" || atual === (padraoAnterior ?? "") ? (padraoNovo ?? "") : atual;
    setVaga((v) => ({
      ...v,
      escala: aplicar(v.escala, prev?.escalaPadrao, c.escalaPadrao),
      endereco: aplicar(v.endereco, prev?.enderecoPadrao, c.enderecoPadrao),
    }));
    // Item 1: cargos são por cliente, então trocar o cliente zera o cargo e a régua já carregada.
    if (prev?.codCliente !== c.codCliente) {
      setCargoId("");
      setRegua([]);
    }
    setCliente(c);
  }

  // Admin acrescenta item ao catálogo e já seleciona. Erro é surfaceado (não falha em silêncio).
  async function addCatalogo(
    tipo: "motivos" | "beneficios" | "escalas",
    nome: string,
    aoCriar: (nome: string) => void,
  ) {
    setCatErro(null);
    try {
      const r = await apiFetch<CatItem>(`/catalogos/${tipo}`, { method: "POST", token, body: { nome } });
      const lista = await apiFetch<CatItem[]>(`/catalogos/${tipo}`, { token });
      if (tipo === "motivos") setMotivos(lista);
      else if (tipo === "beneficios") setBeneficios(lista);
      else setEscalas(lista);
      aoCriar(r.nome);
    } catch (e) {
      setCatErro(e instanceof ApiError ? e.message : "Falha ao adicionar ao catálogo.");
    }
  }

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

  // W1: documentos exigidos (obrigatórios + facultativos), ordenados alfabeticamente por grupo.
  const docsExigidos = useMemo(() => {
    const grupo = (e: ExigenciaDocumento) => (e === "OBRIGATORIO" ? 0 : e === "FACULTATIVO" ? 1 : 2);
    return regua
      .filter((r) => r.exigencia === "OBRIGATORIO" || r.exigencia === "FACULTATIVO")
      .sort((a, b) => grupo(a.exigencia) - grupo(b.exigencia) || a.nome.localeCompare(b.nome));
  }, [regua]);
  const nObrig = docsExigidos.filter((r) => r.exigencia === "OBRIGATORIO").length;
  const nFacult = docsExigidos.length - nObrig;

  const canConfirm = Boolean(cliente && cargoId && cand.nome.trim() && cpfValid);

  async function confirmar(aceitePendencias = false) {
    if (!cliente || !cargoId) return;
    setSubmitting(true);
    setSubmitError(null);

    // Item 3/4: benefícios viram texto; VR/AM carregam o valor efetivo (digitado ou padrão do cliente),
    // ex.: "VR (Vale-Refeição): 500,00". Esse valor é o que o backend persiste como padrão do cliente.
    const beneficios = beneficiosSel
      .map((nome) => {
        const val = precisaValorBeneficio(nome) ? valorBeneficio(nome).trim() : "";
        return val ? `${nome}: ${val}` : nome;
      })
      .join(", ");
    const vagaFolha = {
      salario: vaga.salario || undefined,
      beneficios: beneficios || undefined,
      escala: vaga.escala || undefined,
      endereco: vaga.endereco || undefined,
      centroCusto: vaga.centroCusto || undefined,
      departamento: vaga.departamento || undefined,
      gestorBp: vaga.gestorBp || undefined,
      motivo: vaga.motivo || undefined,
      tempoContrato: vaga.tempoContrato || undefined,
      substituidoNome: ehSubstituicao ? vaga.substituidoNome || undefined : undefined,
      substituidoCpf: ehSubstituicao ? vaga.substituidoCpf || undefined : undefined,
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
            dataNascimento: cand.dataNascimento || undefined,
          },
          dataAdmissao: cand.dataAdmissao || undefined,
          tipoContrato: vaga.tipoContrato || undefined,
          vagaFolha: hasVaga ? vagaFolha : undefined,
          aceitePendencias,
        },
      });
      setAceiteCampos(null);
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const data = e.data as { needsAceite?: boolean; camposPendentes?: string[] } | undefined;
        if (data?.needsAceite) {
          setAceiteCampos(data.camposPendentes ?? []);
          return;
        }
      }
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
    setCargosCliente([]);
    setClienteTemRegua(null);
    setRegua([]);
    setVaga(VAGA_EMPTY);
    setBeneficiosSel([]);
    setBeneficiosValores({});
    setBeneficiosPadraoCliente({});
    setCand(CAND_EMPTY);
    setLookup(null);
    setReaproveitado(false);
    setSubmitError(null);
    setResult(null);
    setAceiteCampos(null);
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
      <PageHead eyebrow="Nova admissão" title="Cadastro em etapas" />

      <GlassCard className="panel">
        <Stepper steps={STEPS} current={step} />

        {/* ── ETAPA 1: CLIENTE ─────────────────────────────────────────── */}
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
                    <button key={c.codCliente} onClick={() => selecionarCliente(c)} className={cnRow(selected)}>
                      <div className="min-w-0">
                        <div className="truncate text-[16px] font-bold">
                          {c.nomeOperacao ?? c.razaoSocial}
                        </div>
                        <div className="truncate text-[12.5px] text-dim">
                          {c.nomeOperacao ? `${c.razaoSocial} · ` : ""}
                          Código {c.codCliente}
                          {c.cnpj ? ` · CNPJ ${c.cnpj}` : ""}
                        </div>
                      </div>
                      {selected && <Icon name="check" className="h-5 w-5 flex-none text-accent" />}
                    </button>
                  );
                })}
              </div>
            )}
            {cliente && (
              <GlassCard className="p-4">
                <div className="eyebrow">Cliente selecionado</div>
                <div className="text-[20px] font-extrabold leading-tight">
                  {cliente.nomeOperacao ?? cliente.razaoSocial}
                </div>
                <div className="mt-0.5 text-[12.5px] text-dim">{cliente.razaoSocial}</div>
                <div className="mt-1 grid gap-1 text-[13px] text-dim sm:grid-cols-3">
                  <span>
                    Código <b className="text-text">{cliente.codCliente}</b>
                  </span>
                  <span>CNPJ {cliente.cnpj ?? "não informado"}</span>
                </div>
                <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                  <div>
                    <div className="eyebrow !mb-1">Empresa do grupo</div>
                    <div className="text-[13px] text-dim">{cliente.empresaGrupo ?? "não informado"}</div>
                  </div>
                  <div>
                    <div className="eyebrow !mb-1">Região</div>
                    <div className="text-[13px] text-dim">{formatRegiao(cliente.regiao, cliente.descricaoRegiao)}</div>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {/* ── ETAPA 2: VAGA / CARGO ────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid gap-5">
            <Field label="Cargo *">
              <Select
                value={cargoId}
                onChange={setCargoId}
                placeholder={
                  clienteTemRegua === false
                    ? "Cadastre a régua do cliente primeiro"
                    : "Selecione o cargo…"
                }
                ariaLabel="Cargo"
                disabled={clienteTemRegua !== true}
                options={(clienteTemRegua === true ? cargosCliente : []).map((c) => ({
                  value: c.id,
                  label: c.nome,
                }))}
              />
              {clienteTemRegua === null && cliente && (
                <p className="mt-1.5 text-[11.5px] text-faint">Verificando a régua do cliente…</p>
              )}
              {clienteTemRegua === true && (
                <p className="mt-1.5 text-[11.5px] text-faint">
                  Cargos com régua cadastrada para este cliente ({cargosCliente.length}).
                </p>
              )}
              {clienteTemRegua === false && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--warn-2)] bg-[rgba(249,115,22,0.1)] px-3 py-2.5">
                  <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none text-warn-2" />
                  <p className="text-[12.5px] text-text">
                    <b>Este cliente não tem régua cadastrada.</b> A seleção de cargo fica travada:
                    cadastre a régua do cliente (menu Régua de Documentos) antes de criar a admissão.
                    A régua é o que a I.A usa para auditar os documentos.
                  </p>
                </div>
              )}
            </Field>

            {/* W1: checklist da régua recolhível */}
            {cargoId && (
              <GlassCard className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="eyebrow !mb-1">Checklist da régua</div>
                    <p className="text-[12.5px] text-dim">
                      {reguaLoading
                        ? "Carregando régua…"
                        : docsExigidos.length === 0
                          ? "Sem régua para este cliente + cargo. A admissão pode ser criada mesmo assim (F4)."
                          : `${nObrig} obrigatório(s), ${nFacult} facultativo(s).`}
                    </p>
                  </div>
                  {docsExigidos.length > 0 && (
                    <Button
                      variant="secondary"
                      className="flex-none px-3 py-2 text-[13px]"
                      onClick={() => setDocsAbertos((v) => !v)}
                    >
                      {docsAbertos ? "Recolher" : "Ver documentos"}
                    </Button>
                  )}
                </div>
                {docsAbertos && docsExigidos.length > 0 && (
                  <div className="mt-3 grid gap-1.5">
                    {docsExigidos.map((r) => {
                      const dim = r.exigencia === "FACULTATIVO";
                      return (
                        <div
                          key={r.tipoDocumentoId}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2",
                            dim && "opacity-60",
                          )}
                        >
                          <span className="truncate text-[13.5px]">
                            <span className="font-mono text-dim">{r.codigo}</span> · {r.nome}
                          </span>
                          <Pill tone={r.exigencia === "OBRIGATORIO" ? "wn" : "nt"}>
                            {EXIGENCIA_LABEL[r.exigencia]}
                          </Pill>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            )}

            {/* Folha / vaga */}
            <div>
              <div className="eyebrow">Dados de vaga / folha</div>
              {catErro && (
                <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[13px] text-danger">
                  {catErro}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Salário *">
                  <input
                    className="ds-input"
                    inputMode="decimal"
                    placeholder="1800.00"
                    value={vaga.salario}
                    onChange={(e) => setVaga({ ...vaga, salario: e.target.value })}
                  />
                </Field>
                <Field label="Tipo de contrato *">
                  <Select
                    value={vaga.tipoContrato}
                    onChange={(v) => setVaga({ ...vaga, tipoContrato: v })}
                    placeholder="Selecione…"
                    ariaLabel="Tipo de contrato"
                    options={TIPOS_CONTRATO.map((t) => ({ value: t, label: t }))}
                  />
                </Field>
                <Field label="Tempo de contrato *">
                  <Select
                    value={vaga.tempoContrato}
                    onChange={(v) => setVaga({ ...vaga, tempoContrato: v })}
                    placeholder="Selecione o tempo…"
                    ariaLabel="Tempo de contrato"
                    options={TEMPOS_CONTRATO.map((t) => ({ value: t, label: `${t} dias` }))}
                  />
                </Field>
                <Field label="Escala *" className="sm:col-span-2 lg:col-span-3">
                  <Select
                    value={vaga.escala}
                    onChange={(v) => setVaga({ ...vaga, escala: v })}
                    placeholder="Selecione a escala…"
                    ariaLabel="Escala"
                    options={escalas.map((e) => ({ value: e.nome, label: e.nome }))}
                    onAdd={isAdmin ? (nome) => addCatalogo("escalas", nome, (n) => setVaga((v) => ({ ...v, escala: n }))) : undefined}
                  />
                  {cliente?.escalaPadrao && (
                    <p className="mt-1.5 text-[11.5px] text-faint">
                      Padrão do cliente (pré-selecionado, editável): {cliente.escalaPadrao}
                    </p>
                  )}
                </Field>
                <Field label="Benefícios *" className="sm:col-span-2 lg:col-span-3">
                  <MultiSelect
                    values={beneficiosSel}
                    onChange={setBeneficiosSel}
                    placeholder="Selecione os benefícios…"
                    ariaLabel="Benefícios"
                    options={beneficios.map((b) => ({ value: b.nome, label: b.nome }))}
                    onAdd={isAdmin ? (nome) => addCatalogo("beneficios", nome, (n) => setBeneficiosSel((s) => [...s, n])) : undefined}
                  />
                  {cliente?.beneficiosPadrao && (
                    <p className="mt-1.5 text-[11.5px] text-faint">
                      Padrão do cliente: {cliente.beneficiosPadrao}
                    </p>
                  )}
                  {/* Item 3: VR e AM abrem um campo de valor editável (seleção pelo menu acima). */}
                  {beneficiosSel.filter(precisaValorBeneficio).length > 0 && (
                    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                      {beneficiosSel.filter(precisaValorBeneficio).map((nome) => (
                        <label key={nome} className="min-w-0">
                          <span className="ds-label">Valor de {nome}</span>
                          <input
                            className="ds-input"
                            inputMode="decimal"
                            placeholder="Ex.: 500,00"
                            value={valorBeneficio(nome)}
                            onChange={(e) =>
                              setBeneficiosValores((m) => ({ ...m, [nome]: e.target.value }))
                            }
                          />
                          {prefixoBeneficio(nome) &&
                            beneficiosPadraoCliente[prefixoBeneficio(nome)!] &&
                            beneficiosValores[nome] === undefined && (
                              <span className="mt-1 block text-[11px] text-faint">
                                Padrão salvo deste cliente (editável).
                              </span>
                            )}
                        </label>
                      ))}
                    </div>
                  )}
                </Field>
                <Field label="Motivo de contratação">
                  <Select
                    value={vaga.motivo}
                    onChange={(v) => setVaga({ ...vaga, motivo: v })}
                    placeholder="Selecione o motivo…"
                    ariaLabel="Motivo de contratação"
                    options={motivos.map((m) => ({ value: m.nome, label: m.nome }))}
                    onAdd={isAdmin ? (nome) => addCatalogo("motivos", nome, (n) => setVaga((v) => ({ ...v, motivo: n }))) : undefined}
                  />
                </Field>
                {/* W2: substituição */}
                {ehSubstituicao && (
                  <>
                    <Field label="Nome do substituído *">
                      <input
                        className="ds-input"
                        placeholder="Quem está sendo substituído"
                        value={vaga.substituidoNome}
                        onChange={(e) => setVaga({ ...vaga, substituidoNome: e.target.value })}
                      />
                    </Field>
                    <Field label="CPF do substituído *">
                      <input
                        className="ds-input"
                        placeholder="000.000.000-00"
                        value={vaga.substituidoCpf}
                        onChange={(e) => setVaga({ ...vaga, substituidoCpf: formatCpf(e.target.value) })}
                      />
                      <p className="mt-1 text-[11px] text-faint">Retido 48h (LGPD), expurgado após uso.</p>
                    </Field>
                  </>
                )}
                <Field label="Centro de custo *">
                  <input className="ds-input" value={vaga.centroCusto} onChange={(e) => setVaga({ ...vaga, centroCusto: e.target.value })} />
                </Field>
                <Field label="Departamento">
                  <input className="ds-input" value={vaga.departamento} onChange={(e) => setVaga({ ...vaga, departamento: e.target.value })} />
                </Field>
                <Field label="Gestor / BP *">
                  <input className="ds-input" value={vaga.gestorBp} onChange={(e) => setVaga({ ...vaga, gestorBp: e.target.value })} />
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

        {/* ── ETAPA 3: CANDIDATO ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome completo *" className="sm:col-span-2">
                <input className="ds-input" placeholder="Maria Souza" value={cand.nome} onChange={(e) => setCand({ ...cand, nome: e.target.value })} />
              </Field>
              <Field label="CPF *">
                <input
                  className={cn("ds-input", cpfTouched && !cpfValid && "!border-[var(--danger)]", cpfValid && "!border-[var(--ok)]")}
                  placeholder="000.000.000-00"
                  value={cand.cpf}
                  onChange={(e) => {
                    setCand({ ...cand, cpf: formatCpf(e.target.value) });
                    setReaproveitado(false);
                  }}
                />
                <div className="mt-1.5 h-5">
                  {cpfTouched && (cpfValid ? <Pill tone="ok">CPF válido</Pill> : <Pill tone="dg">CPF inválido</Pill>)}
                </div>
              </Field>
              <Field label="Data de nascimento *">
                <input type="date" className="ds-input" value={cand.dataNascimento} onChange={(e) => setCand({ ...cand, dataNascimento: e.target.value })} />
                <div className="mt-1.5 min-h-5">
                  {idade !== null && (
                    <span className="text-[12px] text-dim">{idade} anos</span>
                  )}
                </div>
              </Field>
              <Field label="Data de admissão *">
                <input type="date" className="ds-input" value={cand.dataAdmissao} onChange={(e) => setCand({ ...cand, dataAdmissao: e.target.value })} />
                <p className="mt-1 text-[11px] text-faint">
                  Obrigatória, porém não bloqueia: se ficar vazia, entra como pendência.
                </p>
              </Field>
              <Field label="Telefone *">
                <input className="ds-input" placeholder="(11) 99999-0000" value={cand.telefone} onChange={(e) => setCand({ ...cand, telefone: e.target.value })} />
              </Field>
              <Field label="E-mail *">
                <input type="email" className="ds-input" placeholder="maria@exemplo.com" value={cand.email} onChange={(e) => setCand({ ...cand, email: e.target.value })} />
              </Field>
            </div>

            {/* W7: aviso de menor de idade */}
            {menorIdade && (
              <div className="flex items-start gap-3 rounded-xl border border-[var(--warn-2)] bg-[rgba(249,115,22,0.1)] px-4 py-3">
                <Icon name="alert" className="mt-0.5 h-5 w-5 flex-none text-warn-2" />
                <p className="text-[13px] text-text">
                  <b>Candidato menor de idade ({idade} anos)</b>: verifique as restrições legais e o tipo de contrato (Jovem Aprendiz).
                </p>
              </div>
            )}

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
                        {lookup.candidato.nome} · {lookup.admissoes} admissão(ões) anterior(es). A nova admissão preserva o histórico (F11).
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
              <p className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger" role="alert">
                {submitError}
              </p>
            )}
          </div>
        )}

        {/* ── NAVEGAÇÃO ─────────────────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
          <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="px-3 py-2.5">
            <span className="inline-flex items-center gap-2">
              <Icon name="left" className="h-4 w-4" /> Anterior
            </span>
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={(step === 0 && !cliente) || (step === 1 && !cargoId)} className="px-4 py-2.5">
              <span className="inline-flex items-center gap-2">
                Próximo <Icon name="right" className="h-4 w-4" />
              </span>
            </Button>
          ) : (
            <Button onClick={() => confirmar(false)} disabled={!canConfirm || submitting} className="px-5 py-2.5">
              {submitting ? "Criando…" : "Confirmar admissão"}
            </Button>
          )}
        </div>
      </GlassCard>

      {/* W6: aceite de criação com pendências */}
      <ConfirmDialog
        open={aceiteCampos !== null}
        title="Criar com pendências obrigatórias?"
        message={`Campos obrigatórios vazios: ${(aceiteCampos ?? []).join(", ")}. A admissão pode ser criada (F4), mas registra que você está ciente das pendências.`}
        confirmLabel="Estou ciente, criar"
        tone="danger"
        busy={submitting}
        onConfirm={() => confirmar(true)}
        onCancel={() => setAceiteCampos(null)}
      />
    </>
  );
}

function cnRow(selected: boolean): string {
  return cn(
    "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
    selected
      ? "border-[var(--accent)] bg-[var(--surface-2)]"
      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
  );
}
