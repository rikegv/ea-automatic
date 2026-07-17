"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Modal } from "@/components/ui/Modal";
import { precisaValorBeneficio } from "@/lib/beneficios";

// Tipo de contrato: MESMA lista fixa do wizard (não é texto livre). A régua unificada pede o "tipo".
const TIPOS_CONTRATO = [
  "Temporário",
  "Terceirizado",
  "Estágio",
  "Interno",
  "Fopag",
  "Jovem Aprendiz",
];

interface CatItem {
  id: string;
  nome: string;
}

interface PreAdmissao {
  admissaoId: string;
  candidatoNome: string;
  candidatoCpf: string;
  telefone: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  origem: string;
  criadoEm: string;
  idVacancy: string | null;
  possivelDuplicata: boolean;
}
interface Cliente {
  codCliente: string;
  razaoSocial: string;
  // Nome operacional (fantasia): o time reconhece o cliente por ele, não pela razão social.
  nomeOperacao: string | null;
  // Escala sugerida do cliente (o valor pré-preenche; as opções vêm do catálogo, independentes).
  escalaPadrao: string | null;
}
interface Cargo {
  id: string;
  nome: string;
}
interface Recusada {
  admissaoId: string;
  candidatoNome: string;
  candidatoCpf: string;
  telefone: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  origem: string;
  criadoEm: string;
  recusadoEm: string | null;
  recusadoPor: string | null;
}

type Aba = "aguardando" | "recusadas";

const ROTULO_SEXO: Record<string, string> = {
  MASCULINO: "Masculino",
  FEMININO: "Feminino",
};

function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const iso = d.slice(0, 10);
  const [a, m, dia] = iso.split("-");
  return a && m && dia ? `${dia}/${m}/${a}` : "não informado";
}
function fmtCpf(cpf: string): string {
  return cpf.length === 11
    ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    : cpf;
}
/**
 * Rótulo do cliente no seletor: "código · nome operacional" (o time reconhece por ele). Sem nome
 * operacional, cai para "código · razão social". A razão social NÃO entra quando há nome operacional
 * (é longa e polui).
 */
function rotuloCliente(c: Cliente): string {
  return `${c.codCliente} · ${c.nomeOperacao ?? c.razaoSocial}`;
}
// Salário em pt-BR ("2.500,00") → string numérica que o Postgres aceita ("2500.00"). Mesma convenção
// do valor de benefício (o backend guarda o salário cru como numeric, sem transform próprio).
function salarioParaNumero(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  return t.replace(/\./g, "").replace(",", ".");
}

// Tempo parado desde a CHEGADA (criadoEm) até agora. Duas leituras do MESMO total: dias (piso, dias
// completos decorridos) e horas (piso). `nowMs` vem do estado, atualizado no load/liberar.
function paradoMs(criadoEm: string, nowMs: number): number {
  return Math.max(0, nowMs - new Date(criadoEm).getTime());
}
function paradoDias(criadoEm: string, nowMs: number): string {
  const d = Math.floor(paradoMs(criadoEm, nowMs) / 86_400_000);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}
// Total ACUMULADO desde a chegada em hh:mm (não reinicia às 24h: 36h30 → "36:30"). Minutos por piso.
function paradoHoras(criadoEm: string, nowMs: number): string {
  const totalMin = Math.floor(paradoMs(criadoEm, nowMs) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function LiberacaoPage() {
  const { token, isAdmin } = useAuth();
  const [rows, setRows] = useState<PreAdmissao[]>([]);
  const [recusadas, setRecusadas] = useState<Recusada[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  // Toggle Aguardando (padrão) × Admissões Recusadas.
  const [aba, setAba] = useState<Aba>("aguardando");
  // Modal de detalhe de uma recusada (histórico quem/quando + reativar).
  const [recusadaAlvo, setRecusadaAlvo] = useState<Recusada | null>(null);
  const [acaoRecusa, setAcaoRecusa] = useState(false);
  // "Agora" fixado no carregamento — as colunas de tempo parado calculam a partir daqui.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Catálogos reusados (mesmos endpoints do wizard/lápis): benefícios e escalas.
  const [beneficiosCat, setBeneficiosCat] = useState<CatItem[]>([]);
  const [escalasCat, setEscalasCat] = useState<CatItem[]>([]);
  // Modal de liberação: a pré-admissão alvo (null = fechado) + os campos do formulário.
  const [alvo, setAlvo] = useState<PreAdmissao | null>(null);
  const [codCliente, setCodCliente] = useState("");
  const [cargoId, setCargoId] = useState("");
  // Campos obrigatórios (régua unificada §A.19), todos opcionais na liberação — só cliente+cargo travam.
  const [salario, setSalario] = useState("");
  const [tipoContrato, setTipoContrato] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [escala, setEscala] = useState("");
  const [centroCusto, setCentroCusto] = useState("");
  const [gestorBp, setGestorBp] = useState("");
  // Pacote de benefícios (REUSA a régua de valor de lib/beneficios): nomes selecionados + valor por nome.
  const [beneficiosSel, setBeneficiosSel] = useState<string[]>([]);
  const [beneficiosValores, setBeneficiosValores] = useState<Record<string, string>>({});
  const [liberando, setLiberando] = useState(false);
  const [modalErro, setModalErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [pre, rec, cli, car, ben, esc] = await Promise.all([
        apiFetch<PreAdmissao[]>("/admissoes/aguardando-liberacao", { token }),
        apiFetch<Recusada[]>("/admissoes/recusadas", { token }),
        apiFetch<Cliente[]>("/admin/clientes", { token }),
        apiFetch<Cargo[]>("/admin/cargos", { token }),
        apiFetch<CatItem[]>("/catalogos/beneficios", { token }),
        apiFetch<CatItem[]>("/catalogos/escalas", { token }),
      ]);
      setRows(pre);
      setRecusadas(rec);
      setClientes(cli);
      setCargos(car);
      setBeneficiosCat(ben);
      setEscalasCat(esc);
      setNowMs(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar a fila de liberação");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Benefícios e escala DEPENDEM de cliente+cargo: ao escolher o par, pré-preenche o pacote pela
  // memória (mesma rota do wizard). Escala sugere o padrão do cliente (opções são independentes).
  useEffect(() => {
    if (!token || !alvo || !codCliente || !cargoId) return;
    let vivo = true;
    apiFetch<{ beneficios: { nome: string; valor: number | null }[] }>(
      `/admissoes/padrao-cliente-cargo?codCliente=${encodeURIComponent(codCliente)}&cargoId=${encodeURIComponent(cargoId)}`,
      { token },
    )
      .then((r) => {
        if (!vivo) return;
        const pacote = r.beneficios ?? [];
        if (pacote.length === 0) return;
        setBeneficiosSel(pacote.map((b) => b.nome));
        setBeneficiosValores(
          Object.fromEntries(
            pacote
              .filter((b) => b.valor !== null)
              .map((b) => [b.nome, b.valor!.toFixed(2).replace(".", ",")]),
          ),
        );
      })
      .catch(() => {
        /* memória é sugestão; falha não bloqueia a liberação */
      });
    const cli = clientes.find((c) => c.codCliente === codCliente);
    if (cli?.escalaPadrao) setEscala((e) => e || cli.escalaPadrao!);
    return () => {
      vivo = false;
    };
  }, [token, alvo, codCliente, cargoId, clientes]);

  function abrirModal(r: PreAdmissao) {
    setAlvo(r);
    setCodCliente("");
    setCargoId("");
    setSalario("");
    setTipoContrato("");
    setDataAdmissao("");
    setEscala("");
    setCentroCusto("");
    setGestorBp("");
    setBeneficiosSel([]);
    setBeneficiosValores({});
    setModalErro(null);
  }
  function fecharModal() {
    if (liberando) return;
    setAlvo(null);
  }

  // Pacote no formato do backend (mesma montagem do wizard): nome→beneficioId; valor só nos que exigem.
  function montarPacote(): { beneficioId: string; valor?: string }[] {
    return beneficiosSel.flatMap((nome) => {
      const b = beneficiosCat.find((x) => x.nome === nome);
      if (!b) return [];
      const bruto = precisaValorBeneficio(nome) ? (beneficiosValores[nome] ?? "").trim() : "";
      return [{ beneficioId: b.id, valor: bruto || undefined }];
    });
  }

  async function liberar() {
    if (!alvo || !codCliente || !cargoId) return;
    setLiberando(true);
    setModalErro(null);
    setError(null);
    setOkMsg(null);
    try {
      const pacoteBeneficios = montarPacote();
      const r = await apiFetch<{ temRegua: boolean }>(
        `/admissoes/${encodeURIComponent(alvo.admissaoId)}/liberar`,
        {
          method: "PATCH",
          token,
          body: {
            codCliente,
            cargoId,
            tipoContrato: tipoContrato || undefined,
            dataAdmissao: dataAdmissao || undefined,
            vagaFolha: {
              salario: salarioParaNumero(salario),
              escala: escala || undefined,
              centroCusto: centroCusto || undefined,
              gestorBp: gestorBp || undefined,
            },
            pacoteBeneficios: pacoteBeneficios.length ? pacoteBeneficios : undefined,
          },
        },
      );
      setOkMsg(
        r.temRegua
          ? `${alvo.candidatoNome} liberado. A admissão entrou na esteira com a régua documental do par.`
          : `${alvo.candidatoNome} liberado e na esteira. Atenção: este par cliente e cargo não tem régua documental cadastrada, então a admissão nasceu sem checklist de documentos.`,
      );
      setAlvo(null);
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiError && typeof e.data === "object" && e.data
          ? ((e.data as { message?: string }).message ?? e.message)
          : e instanceof Error
            ? e.message
            : "Erro ao liberar";
      setModalErro(msg);
    } finally {
      setLiberando(false);
    }
  }

  // Recusa (Parte 2, só Master/Super Admin): a partir do modal de liberação. Farol → recusada, sai da fila.
  async function recusar() {
    if (!alvo) return;
    setAcaoRecusa(true);
    setModalErro(null);
    setError(null);
    setOkMsg(null);
    try {
      await apiFetch(`/admissoes/${encodeURIComponent(alvo.admissaoId)}/recusar`, {
        method: "PATCH",
        token,
      });
      setOkMsg(`${alvo.candidatoNome} recusado. Movido para "Admissões Recusadas".`);
      setAlvo(null);
      await load();
    } catch (e) {
      setModalErro(e instanceof Error ? e.message : "Erro ao recusar");
    } finally {
      setAcaoRecusa(false);
    }
  }

  // Reativa uma recusada (só Master/Super Admin): volta para a fila de aguardando.
  async function reativarRecusada() {
    if (!recusadaAlvo) return;
    setAcaoRecusa(true);
    setError(null);
    setOkMsg(null);
    try {
      await apiFetch(
        `/admissoes/${encodeURIComponent(recusadaAlvo.admissaoId)}/reativar-recusada`,
        {
          method: "PATCH",
          token,
        },
      );
      setOkMsg(`${recusadaAlvo.candidatoNome} reativado. Voltou para "Aguardando".`);
      setRecusadaAlvo(null);
      setAba("aguardando");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reativar");
    } finally {
      setAcaoRecusa(false);
    }
  }

  const podeLiberar = Boolean(codCliente && cargoId);

  // Campos da régua unificada §A.19 ainda vazios (hint visual; a fonte autoritativa é o backend, que
  // recalcula o sinalizador ao liberar). Cliente/Cargo não entram: são a trava, já garantidos aqui.
  const pendentesNoModal = [
    !salario && "Salário",
    !tipoContrato && "Tipo de contrato",
    !dataAdmissao && "Data de admissão",
    beneficiosSel.length === 0 && "Pacote de benefícios",
    !escala && "Escala",
    !centroCusto && "Centro de custo",
    !gestorBp && "Gestor / BP",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHead
        eyebrow="Operação"
        title="Liberação Admissional"
        subtitle="Pré-admissões que chegaram pelo Pandapé e aguardam cliente e cargo. Atribua os dois para a admissão entrar na esteira."
      />

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
      {okMsg && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
          {okMsg}
        </p>
      )}

      {/* Toggle Aguardando (padrão) × Admissões Recusadas. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(["aguardando", "recusadas"] as Aba[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={cn(
              "rounded-full border px-3 py-1 transition",
              aba === a
                ? "border-accent bg-[var(--surface-2)] text-accent"
                : "border-[var(--border)] text-dim hover:text-text",
            )}
          >
            {a === "aguardando"
              ? `Aguardando (${rows.length})`
              : `Admissões Recusadas (${recusadas.length})`}
          </button>
        ))}
      </div>

      {aba === "aguardando" ? (
        <GlassCard className="overflow-hidden p-2">
          <div className="ea-scroll overflow-x-auto">
            <table className="ds-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th className="w-[150px]">CPF</th>
                  <th className="w-[130px]">Telefone</th>
                  <th className="w-[120px]">Nascimento</th>
                  <th className="w-[100px]">Sexo</th>
                  <th className="w-[110px]">Chegada</th>
                  <th className="w-[100px]">Parado (dias)</th>
                  <th className="w-[110px]">Parado (horas)</th>
                  <th className="w-[120px]">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-faint">
                      Carregando…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-faint">
                      Nenhuma pré-admissão aguardando liberação.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.admissaoId}>
                      <td className="font-semibold">
                        <span className="inline-flex items-center gap-2">
                          {r.candidatoNome}
                          {r.possivelDuplicata && (
                            <span
                              className="inline-flex items-center rounded-full border border-[rgba(234,88,12,0.35)] bg-[rgba(234,88,12,0.12)] px-2 py-0.5 text-[11px] font-semibold text-warn-2"
                              title="Já existe admissão viva deste CPF sem vaga comparável. Confirme se não é duplicata antes de liberar."
                            >
                              Possível duplicata
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap font-mono text-[12.5px]">
                        {fmtCpf(r.candidatoCpf)}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {r.telefone ?? "não informado"}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {fmtData(r.dataNascimento)}
                      </td>
                      <td className="text-[12.5px]">
                        {r.sexo ? (ROTULO_SEXO[r.sexo] ?? r.sexo) : "não informado"}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">{fmtData(r.criadoEm)}</td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {paradoDias(r.criadoEm, nowMs)}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {paradoHoras(r.criadoEm, nowMs)}
                      </td>
                      <td>
                        <Button onClick={() => abrirModal(r)} className="w-full py-2">
                          Liberar
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden p-2">
          <div className="ea-scroll overflow-x-auto">
            <table className="ds-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th className="w-[150px]">CPF</th>
                  <th className="w-[130px]">Telefone</th>
                  <th className="w-[180px]">Recusado por</th>
                  <th className="w-[120px]">Recusado em</th>
                  <th className="w-[120px]">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-faint">
                      Carregando…
                    </td>
                  </tr>
                ) : recusadas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-faint">
                      Nenhuma admissão recusada.
                    </td>
                  </tr>
                ) : (
                  recusadas.map((r) => (
                    <tr key={r.admissaoId}>
                      <td className="font-semibold">{r.candidatoNome}</td>
                      <td className="whitespace-nowrap font-mono text-[12.5px]">
                        {fmtCpf(r.candidatoCpf)}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {r.telefone ?? "não informado"}
                      </td>
                      <td className="text-[12.5px]">{r.recusadoPor ?? "não informado"}</td>
                      <td className="whitespace-nowrap text-[12.5px]">{fmtData(r.recusadoEm)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => setRecusadaAlvo(r)}
                          className="w-full py-2"
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {alvo && (
        <Modal onClose={fecharModal} ariaLabel="Liberar admissão" className="max-w-[560px] p-6">
          <div className="mb-5">
            <div className="eyebrow !mb-1">Liberação Admissional</div>
            <h2 className="font-display text-xl font-bold">{alvo.candidatoNome}</h2>
            <p className="mt-0.5 font-mono text-[13px] text-dim">{fmtCpf(alvo.candidatoCpf)}</p>
          </div>

          {/* Cliente + cargo: o que ESTA OST entrega e a única trava de liberação. A próxima OST
              (pendências obrigatórias) adiciona campos ABAIXO deste bloco, sem refazer o modal. */}
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="ds-label">Cliente</span>
              <Select
                value={codCliente}
                onChange={setCodCliente}
                placeholder="Selecione o cliente…"
                ariaLabel="Cliente"
                searchable
                menuFit
                options={clientes.map((c) => ({ value: c.codCliente, label: rotuloCliente(c) }))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="ds-label">Cargo</span>
              <Select
                value={cargoId}
                onChange={setCargoId}
                placeholder="Selecione o cargo…"
                ariaLabel="Cargo"
                searchable
                menuFit
                options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </label>
            {/* Demais campos obrigatórios (régua unificada §A.19), abaixo de cliente/cargo. Opcionais:
                o que ficar vazio vira pendência na esteira; SÓ cliente+cargo travam a liberação. */}
            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-1.5">
                <span className="ds-label">Salário</span>
                <input
                  className="ds-input"
                  inputMode="decimal"
                  placeholder="Ex.: 2.500,00"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Data de admissão</span>
                <input
                  type="date"
                  className="ds-input"
                  value={dataAdmissao}
                  onChange={(e) => setDataAdmissao(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Tipo de contrato</span>
                <Select
                  value={tipoContrato}
                  onChange={setTipoContrato}
                  placeholder="Selecione…"
                  ariaLabel="Tipo de contrato"
                  options={TIPOS_CONTRATO.map((t) => ({ value: t, label: t }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Escala</span>
                <Select
                  value={escala}
                  onChange={setEscala}
                  placeholder="Selecione…"
                  ariaLabel="Escala"
                  searchable
                  menuFit
                  options={escalasCat.map((e) => ({ value: e.nome, label: e.nome }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Centro de custo</span>
                <input
                  className="ds-input"
                  value={centroCusto}
                  onChange={(e) => setCentroCusto(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Gestor / BP</span>
                <input
                  className="ds-input"
                  value={gestorBp}
                  onChange={(e) => setGestorBp(e.target.value)}
                />
              </label>
            </div>

            {/* Pacote de benefícios: REUSA a régua de valor (precisaValorBeneficio). Menu, nunca texto
                livre; valores pré-preenchidos pela memória cliente+cargo, editáveis. */}
            <label className="grid gap-1.5">
              <span className="ds-label">Benefícios</span>
              <MultiSelect
                values={beneficiosSel}
                onChange={setBeneficiosSel}
                placeholder="Selecione os benefícios…"
                ariaLabel="Benefícios"
                options={beneficiosCat.map((b) => ({ value: b.nome, label: b.nome }))}
              />
            </label>
            {beneficiosSel.filter(precisaValorBeneficio).length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {beneficiosSel.filter(precisaValorBeneficio).map((nome) => (
                  <label key={nome} className="grid gap-1.5">
                    <span className="ds-label">Valor de {nome}</span>
                    <input
                      className="ds-input"
                      inputMode="decimal"
                      placeholder="Ex.: 500,00"
                      value={beneficiosValores[nome] ?? ""}
                      onChange={(e) =>
                        setBeneficiosValores((v) => ({ ...v, [nome]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            {/* Sinalização do que ainda falta (mesmos campos da régua unificada). Só cliente+cargo
                travam; o resto é pendência que segue para a esteira. */}
            {podeLiberar && pendentesNoModal.length > 0 && (
              <p className="rounded-xl border border-[var(--border)] bg-[rgba(201,138,18,0.1)] px-3 py-2 text-[12.5px] text-warn">
                Ainda pendente (não bloqueia, segue como pendência na esteira):{" "}
                {pendentesNoModal.join(", ")}.
              </p>
            )}
          </div>

          {modalErro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {modalErro}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {/* Recusar: visível a todos, ATIVO só para Master/Super Admin (o backend também barra por
                @Roles). Consultor comum vê desabilitado. */}
            <Button
              variant="secondary"
              onClick={() => void recusar()}
              disabled={!isAdmin || liberando || acaoRecusa}
              title={isAdmin ? undefined : "Só Master ou Super Admin pode recusar."}
              className="!border-[rgba(214,69,69,0.4)] !text-danger"
            >
              {acaoRecusa ? "Recusando…" : "Recusar"}
            </Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={fecharModal} disabled={liberando || acaoRecusa}>
                Cancelar
              </Button>
              <Button
                onClick={() => void liberar()}
                disabled={!podeLiberar || liberando || acaoRecusa}
              >
                {liberando ? "Liberando…" : "Liberar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de detalhe da recusada: histórico (quem/quando) + reativar (só Master/Super Admin). */}
      {recusadaAlvo && (
        <Modal
          onClose={() => !acaoRecusa && setRecusadaAlvo(null)}
          ariaLabel="Admissão recusada"
          className="max-w-[460px] p-6"
        >
          <div className="mb-5">
            <div className="eyebrow !mb-1">Admissão recusada</div>
            <h2 className="font-display text-xl font-bold">{recusadaAlvo.candidatoNome}</h2>
            <p className="mt-0.5 font-mono text-[13px] text-dim">
              {fmtCpf(recusadaAlvo.candidatoCpf)}
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <span className="text-dim">Recusado por</span>
              <span className="font-semibold">{recusadaAlvo.recusadoPor ?? "não informado"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-dim">Recusado em</span>
              <span className="font-semibold">{fmtData(recusadaAlvo.recusadoEm)}</span>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRecusadaAlvo(null)} disabled={acaoRecusa}>
              Fechar
            </Button>
            <Button
              onClick={() => void reativarRecusada()}
              disabled={!isAdmin || acaoRecusa}
              title={isAdmin ? undefined : "Só Master ou Super Admin pode reativar."}
            >
              {acaoRecusa ? "Reativando…" : "Reativar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
