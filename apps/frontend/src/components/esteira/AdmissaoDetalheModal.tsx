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
import { caixaAlta } from "@/lib/nome";
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
interface AdmissaoDetalhe {
  admissaoId: string;
  recebidoEm: string | null;
  dataAdmissao: string | null;
  tipoContrato: string | null;
  farolGlobal: string;
  /** PAUSA: instante da pausa (null = não pausada) e o motivo opcional. */
  pausadaEm?: string | null;
  pausaMotivo?: string | null;
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
  // Observação LIVRE deixada na liberação (Bloco 3). null/vazio = o consultor não escreveu nada.
  // NÃO é o `observacao` de `documentos_admissao` (motivo do veredito da IA por documento), que vive
  // no modal de Auditar, não nesta ficha.
  observacaoLiberacao: string | null;
  matricula: string | null;
  candidato: {
    nome: string;
    cpf: string;
    email: string | null;
    telefone: string | null;
    dataNascimento: string | null;
    /** Nome do banco informado pelo candidato no Pandapé (texto livre). Informação de ficha. */
    banco?: string | null;
  };
  cliente: { codCliente: string; razaoSocial: string; operacao: string | null };
  cargo: string;
  // BLOCO 2: salário/escala/endereço da folha (endereço = o da admissão).
  vagaFolha: {
    salario: string | null;
    escala: string | null;
    endereco: string | null;
    // Trabalho e cadastro (OST dos três bugs do modal): vinham do banco e não eram devolvidos.
    // Opcionais para o modal não quebrar contra um backend anterior a esta correção.
    centroCusto?: string | null;
    departamento?: string | null;
    /** SETOR (OST Onda 2): campo próprio, distinto de Departamento e Centro de custo. */
    setor?: string | null;
    gestorBp?: string | null;
  };
  // BLOCO 3: dados do exame (coletados do agendamento). null = exame ainda não agendado.
  exame: {
    data: string | null;
    horario: string | null;
    nomeClinica: string | null;
    local: string | null;
    fornecedor: string | null;
    valor: string | null;
    previsaoAso: string | null;
    /** Endereços do dia (multi-endereço, OST Onda 2). Vazio no agendamento antigo. */
    enderecos?: { ordem: number; nomeClinica: string | null; local: string | null; horario: string | null }[];
  } | null;
  frentes: FrenteDetalhe[];
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
  // Eventos de PAUSA (OST admissão pausada). A trilha do modal do olho é a MESMA do declínio e do
  // lápis, então pausar/retomar aparecem no histórico com quem e quando, sem tabela nova.
  pausa: "Pausa da admissão",
  motivoPausa: "Motivo da pausa",
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
const FORNECEDOR_ROTULO: Record<string, string> = { MEDICAL: "Medical", LIMER: "Limer" };

function frenteTone(f: FrenteDetalhe): PillTone {
  if (f.concluida) return "ok";
  if (f.status === "DECLINOU" || f.status === "CANCELADO") return "dg";
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
/**
 * Moeda em pt-BR de verdade: separador de MILHAR e vírgula decimal ("R$ 2.000,00").
 *
 * O QUE ISTO CONSERTA. A versão anterior era `toFixed(2).replace(".", ",")`, que produz "R$ 2000,00":
 * o valor certo, sem o ponto de milhar. Num campo estreito, ao lado do lápis (que mostra o número
 * cru, "2000.00"), isso se lê como se o modal estivesse inflando o salário, e foi assim que o
 * problema chegou. O valor NUNCA foi multiplicado por nada: os dois endpoints devolvem a mesma
 * string; o que faltava era a formatação.
 *
 * `Number` continua sendo a porta de entrada, então valor não numérico cai no texto cru em vez de
 * virar "R$ NaN".
 */
function fmtMoeda(v?: string | null): string {
  if (v === null || v === undefined || v === "") return "não informado";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Um campo da ficha. O valor QUEBRA por dentro em vez de ser cortado.
 *
 * O QUE MUDOU E POR QUÊ (OST layout, ponto 3). Era `truncate`, que corta com reticências: E-MAIL do
 * candidato e ESCALA são os dois campos que estouram a largura de uma coluna da grade, e a
 * informação ficava OCULTA, visível só no tooltip. Como a regra é "nada cortado na borda, valor
 * longo quebra por dentro", o `truncate` sai e entra `break-words`. A linha da grade cresce o
 * necessário; o `title` continua, porque ajuda no hover mesmo sem corte.
 */
function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</div>
      <div className="mt-0.5 break-words text-[13.5px] text-text" title={valor}>
        {valor}
      </div>
    </div>
  );
}

/**
 * Modal SOMENTE LEITURA com a ficha da admissão, em BLOCOS (mesmo design do lápis). Não edita nada.
 * BLOCO 1 dados pessoais · 2 trabalho/cadastro · 3 exame · 4 status das frentes. A gestão documental
 * (lista de documentos, veredito da IA) NÃO fica aqui: vive só no modal de Auditar. Trilha de
 * passagem e histórico ficam ao fim (auditoria).
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

  // Formulário de VT (§A.17): gerar o link que o consultor manda ao candidato + buscar o formulário
  // já preenchido na pasta de coleta. O link é o único dado sensível (§A.6): fica só na tela.
  const [vtLink, setVtLink] = useState<{ link: string; expiraEm: string } | null>(null);
  const [vtLinkErro, setVtLinkErro] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [buscandoVt, setBuscandoVt] = useState(false);
  const [buscaVtFlash, setBuscaVtFlash] = useState<string | null>(null);
  const [buscaVtErro, setBuscaVtErro] = useState<string | null>(null);

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

  // Gera o link do VT. 422 = candidato sem CPF ou data de nascimento; 503 = gerador não configurado.
  const gerarLinkVt = useCallback(async () => {
    setGerandoLink(true);
    setVtLinkErro(null);
    setCopiado(false);
    try {
      const r = await apiFetch<{ link: string; expiraEm: string }>(
        `/vt-coleta/admissao/${admissaoId}/gerar-link`,
        { method: "POST", token },
      );
      setVtLink(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setVtLinkErro(
          "Candidato sem CPF ou data de nascimento. Complete a ficha antes de gerar o link do VT.",
        );
      } else if (e instanceof ApiError && e.status === 503) {
        setVtLinkErro("Gerador de link do VT não configurado. Procure a administração.");
      } else {
        setVtLinkErro(e instanceof ApiError ? e.message : "Falha ao gerar o link do VT.");
      }
    } finally {
      setGerandoLink(false);
    }
  }, [admissaoId, token]);

  const copiarLinkVt = useCallback(async () => {
    if (!vtLink) return;
    try {
      await navigator.clipboard.writeText(vtLink.link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard indisponível: o consultor seleciona o campo e copia manualmente */
    }
  }, [vtLink]);

  // Enfileira a busca do formulário de VT na pasta de coleta (responde 202).
  const buscarVt = useCallback(async () => {
    setBuscandoVt(true);
    setBuscaVtErro(null);
    setBuscaVtFlash(null);
    try {
      await apiFetch(`/vt-coleta/admissao/${admissaoId}/buscar`, { method: "POST", token });
      setBuscaVtFlash("Busca enfileirada, o formulário aparece assim que a coleta processar.");
    } catch (e) {
      setBuscaVtErro(e instanceof ApiError ? e.message : "Falha ao buscar o formulário de VT.");
    } finally {
      setBuscandoVt(false);
    }
  }, [admissaoId, token]);

  const temAssinatura =
    !!data &&
    (data.temEnvelope ||
      data.clicksignStatus !== "SEM_ENVELOPE" ||
      !!data.contratoAssinadoDriveUrl);
  const temProntuario = !!data && (!!data.drivePastaUrl || !!data.driveAsoUrl);

  return (
    <>
      {/* LARGURA (OST dos três bugs do modal): era `max-w-2xl` (672px) para uma ficha com quatro
          blocos de grade de 3 colunas mais a trilha de alterações, e o conteúdo morria na borda.
          `max-w-4xl` (896px) é largura que o sistema já usa e dá folga a cada coluna. Continua
          RESPONSIVO: `max-w-*` é teto, não largura fixa, então em tela menor o modal encolhe e a
          grade cai para 2 colunas pelo `sm:grid-cols-3`. */}
      <Modal onClose={onClose} className="max-w-4xl" ariaLabel="Ficha da admissão">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow !mb-1">Ficha da admissão</div>
            <div className="flex min-w-0 items-center gap-2">
              {/* Bloco 1 da OST: nome do candidato em CAIXA ALTA (exibição). O fallback de
                  carregamento/erro NÃO passa pelo helper: não é nome, é estado da tela. */}
              <h3 className="truncate text-[18px] font-extrabold">
                {data ? caixaAlta(data.candidato.nome) : error ? "não informado" : "Carregando…"}
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
            {/* OBSERVAÇÃO DA LIBERAÇÃO (Bloco 3 da OST) — o recado que o consultor deixou no ato da
                liberação para quem tocar a admissão adiante (caso real: "VT possui 6% de desconto").
                Fica ANTES de todos os blocos, de propósito: é informação de contexto que muda a
                leitura do resto da ficha, e escondê-la no fim é o mesmo que não ter.
                Vazia (ou nunca preenchida), NÃO ocupa espaço: o bloco simplesmente não existe.
                `whitespace-pre-wrap` preserva as quebras de linha que o consultor digitou. */}
            {data.observacaoLiberacao?.trim() && (
              <div className="rounded-xl border border-[rgba(201,138,18,0.35)] bg-[rgba(201,138,18,0.1)] px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-warn">
                  Observação da liberação
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-text">
                  {data.observacaoLiberacao}
                </p>
              </div>
            )}

            {/* BLOCO 1 — Dados pessoais */}
            <Bloco titulo="Dados pessoais">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Campo rotulo="Nome" valor={caixaAlta(data.candidato.nome) || "não informado"} />
                <Campo rotulo="CPF" valor={fmtCpf(data.candidato.cpf)} />
                <Campo rotulo="Telefone" valor={data.candidato.telefone || "não informado"} />
                <Campo rotulo="E-mail" valor={data.candidato.email || "não informado"} />
                <Campo
                  rotulo="Data de nascimento"
                  valor={fmtData(data.candidato.dataNascimento)}
                />
                {/* Banco informado pelo candidato no formulário do Pandapé. É TEXTO LIVRE dele
                    ("NUBANK", "BANCO DO BRASIL"), então aparece como veio. Informação a mais: a
                    auditoria do comprovante bancário pela IA continua intacta. */}
                <Campo rotulo="Banco" valor={data.candidato.banco || "não informado"} />
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
                {/* Os três que faltavam no modal. Centro de custo e gestor BP são, inclusive,
                    campos OBRIGATÓRIOS da régua de pendências: ficavam cobrados e invisíveis. */}
                <Campo rotulo="Setor" valor={data.vagaFolha.setor || "não informado"} />
                <Campo
                  rotulo="Centro de custo"
                  valor={data.vagaFolha.centroCusto || "não informado"}
                />
                <Campo rotulo="Gestor BP" valor={data.vagaFolha.gestorBp || "não informado"} />
                <Campo
                  rotulo="Departamento"
                  valor={data.vagaFolha.departamento || "não informado"}
                />
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
                  <Campo
                    rotulo="Horário"
                    valor={
                      // MULTI-ENDEREÇO: com mais de um endereço, a ficha mostra todos os horários do
                      // dia, na ordem. Com um só, lê exatamente como antes.
                      (data.exame.enderecos ?? []).length > 0
                        ? (data.exame.enderecos ?? [])
                            .map((e) => e.horario || "sem horário")
                            .join(" · ")
                        : data.exame.horario || "não informado"
                    }
                  />
                  <Campo rotulo="Clínica" valor={data.exame.nomeClinica || "não informado"} />
                  <Campo
                    rotulo="Local"
                    valor={
                      (data.exame.enderecos ?? []).length > 0
                        ? (data.exame.enderecos ?? [])
                            .map((e) => `${e.nomeClinica ?? "clínica"}: ${e.local ?? ""}`.trim())
                            .join(" | ")
                        : data.exame.local || "não informado"
                    }
                  />
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
                {/* PAUSA: a tag fica AO LADO do farol, não no lugar dele. O farol continua dizendo o
                    ciclo de vida (que segue derivando por baixo da pausa) e a tag diz que o trabalho
                    está parado. O motivo, quando informado, vem junto. */}
                {data.pausadaEm && (
                  <>
                    <Pill tone="wn">Pausada</Pill>
                    {data.pausaMotivo && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[12.5px]">
                        <span className="text-dim">Motivo da pausa:</span>
                        <span className="font-semibold text-text">{data.pausaMotivo}</span>
                      </span>
                    )}
                  </>
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
                      {reenviando ? "Reenviando…" : "Reenviar Por Correção"}
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

            {/* Formulário de VT (§A.17): gerar o link do candidato + buscar o formulário preenchido. */}
            <Bloco titulo="Formulário de VT">
              <p className="mb-3 text-[12.5px] text-dim">
                Gere o link para o candidato preencher o vale-transporte pelo celular e envie a ele,
                ou busque o formulário já preenchido na pasta de coleta.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] font-semibold text-text transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                  onClick={() => void gerarLinkVt()}
                  disabled={gerandoLink}
                  title="Gerar o link do formulário de VT para enviar ao candidato"
                >
                  {gerandoLink ? (
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon name="link" className="h-3.5 w-3.5" />
                  )}
                  {gerandoLink ? "Gerando…" : "Gerar link do VT"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] font-semibold text-text transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                  onClick={() => void buscarVt()}
                  disabled={buscandoVt}
                  title="Buscar o formulário de VT já preenchido na pasta de coleta"
                >
                  {buscandoVt ? (
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon name="refresh" className="h-3.5 w-3.5" />
                  )}
                  {buscandoVt ? "Buscando…" : "Buscar formulário de VT"}
                </button>
              </div>

              {vtLink && (
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-faint">
                    Link do formulário de VT
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={vtLink.link}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-text"
                      aria-label="Link do formulário de VT"
                    />
                    <button
                      type="button"
                      className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] font-semibold text-text transition hover:bg-[var(--surface-2)]"
                      onClick={() => void copiarLinkVt()}
                    >
                      <Icon name={copiado ? "check" : "doc"} className="h-3.5 w-3.5" />
                      {copiado ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <p className="mt-2 text-[12px] text-dim">Expira em {fmtData(vtLink.expiraEm)}</p>
                </div>
              )}
              {vtLinkErro && (
                <p className="mt-2 text-[12.5px] text-danger" role="alert">
                  {vtLinkErro}
                </p>
              )}
              {buscaVtFlash && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-ok">
                  <Icon name="check" className="h-3.5 w-3.5" /> {buscaVtFlash}
                </p>
              )}
              {buscaVtErro && (
                <p className="mt-2 text-[12.5px] text-danger" role="alert">
                  {buscaVtErro}
                </p>
              )}
            </Bloco>

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
                      {/* `break-words` + `min-w-0`: o `flex-wrap` quebra ENTRE os spans, mas um valor
                          longo e sem espaço (a lista de benefícios é o caso real) é um span só e
                          vazava pela borda. Agora ele quebra por dentro e aparece inteiro. */}
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-dim">
                        <span className="min-w-0 break-words text-faint line-through">
                          {a.valorAnterior ?? "não informado"}
                        </span>
                        <Icon name="arr" className="h-3 w-3 flex-none text-faint" />
                        <span className="min-w-0 break-words text-text">
                          {a.valorNovo ?? "não informado"}
                        </span>
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
        title="Confirmar Dupla Correção"
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
