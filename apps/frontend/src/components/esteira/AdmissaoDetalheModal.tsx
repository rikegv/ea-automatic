"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClicksignStatus, Origem } from "@ea/shared-types";
import {
  ROTULO_ITEM_EPI,
  TAMANHOS_BOTA,
  TAMANHOS_CALCA,
  TAMANHOS_CAMISETA,
  type ItemEpi,
} from "@ea/shared-types";
import { Select } from "@/components/ui/Select";
import { apiFetch, apiOpenInline, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { OrigemBadge } from "@/components/ui/OrigemBadge";
import { GoogleDriveLogo } from "@/components/ui/GoogleDriveLogo";
import { Button } from "@/components/ui/Button";
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
  /** TROCA DE CLIENTE: carimbo não nulo = houve troca e ainda não foi revisada. */
  trocaClienteEm?: string | null;
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
    /** MOTIVO DA CONTRATAÇÃO (item 5): par do tipo de contrato, importante nas temporárias. */
    motivo?: string | null;
  };
  /**
   * UNIFORME (OST Onda 3, item 1). Fica em DADOS PESSOAIS, não na folha: tamanho é da pessoa.
   * `possui: null` = ninguém respondeu ainda, que é a pendência obrigatória cobrada na liberação.
   */
  uniforme?: {
    possui: boolean | null;
    camiseta: string | null;
    calca: string | null;
    bota: string | null;
  };
  /** EPI (OST Onda 3, item 1): alimenta o AVISO da ficha. Não é pendência obrigatória. */
  epi?: { possui: boolean | null; itens: string[]; outros: string | null };
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

/** Itens do EPI em texto legível, com o "Outros" já dizendo QUAL é (é o que o aviso precisa). */
function listaEpi(epi: { itens: string[]; outros: string | null }): string {
  const nomes = epi.itens.map((i) =>
    i === "OUTROS"
      ? `${ROTULO_ITEM_EPI.OUTROS} (${epi.outros ?? "não informado"})`
      : (ROTULO_ITEM_EPI[i as ItemEpi] ?? i),
  );
  return nomes.length > 0 ? nomes.join(", ") : "não informado";
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
  // Troca de cliente/cargo (OST da correção do cliente errado): os dois eventos da troca e o da
  // revisão entram no MESMO histórico, sem tabela nova.
  trocaCliente: "Troca de cliente",
  trocaCargo: "Troca de cargo",
  trocaClienteRevisada: "Revisão da troca de cliente",
  // Correção de CPF (item 9): o de/para entra no MESMO histórico, com quem corrigiu e quando.
  correcaoCpf: "Correção de CPF",
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
  asoEstado,
  asoMotivo,
  asoTipoDocumentoId,
  onClose,
}: {
  admissaoId: string;
  // Veredito do ASO pela I.A (aba Exame), read-only; ausente (undefined) fora da aba Exame.
  asoAnexado?: boolean;
  asoValidado?: boolean;
  /** Estado do ASO como documento e o MOTIVO do veredito da I.A (INCONFORME = reprovado). */
  asoEstado?: string | null;
  asoMotivo?: string | null;
  /** Tipo ASO, para abrir o arquivo pelas mesmas rotas dos documentos da régua. */
  asoTipoDocumentoId?: string | null;
  onClose: () => void;
}) {
  // `isAdmin` (MASTER ou SUPER_ADMIN) governa a VISIBILIDADE das correções. A autoridade continua
  // sendo o `@Roles` das rotas: esconder o botão é conveniência, não segurança.
  const { token, isAdmin } = useAuth();
  const [data, setData] = useState<AdmissaoDetalhe | null>(null);
  const [error, setError] = useState<string | null>(null);

  // VER O ASO anexado (mesma visualização dos documentos da régua, servida da staging).
  const [abrindoAso, setAbrindoAso] = useState(false);
  const [asoErro, setAsoErro] = useState<string | null>(null);

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

  // Revisão da TROCA DE CLIENTE (OST da correção do cliente errado). O `confirmando` existe porque a
  // ação FICA REGISTRADA com o nome de quem clicou, e a tela avisa isso ANTES de confirmar.
  const [revisando, setRevisando] = useState(false);
  const [confirmandoRevisao, setConfirmandoRevisao] = useState(false);

  /**
   * CORREÇÕES DE MASTER (OST Onda 3, item 1, parte 3). Os MOTORES já existem e estão provados: esta
   * é só a interface das rotas `PATCH /admissoes/:id/trocar-cliente` (item 8) e
   * `PATCH /admissoes/:id/corrigir-cpf` (item 9). Toda trava (fase, régua do par, dígito do CPF,
   * colisão) continua no backend, que é a autoridade: a tela só mostra o que ele responde.
   */
  /**
   * EDIÇÃO DO UNIFORME (melhoria EAC, item 11b). O tamanho chega depois da liberação (o candidato
   * mede depois), e até aqui não havia por onde corrigir: a admissão ficava com o dado errado.
   *
   * A ESCRITA É DAQUI, do modal em que a pessoa já está trabalhando (decisão do diretor). O backend
   * regrava o sinalizador na mesma transação, então a coluna de pendências e o KPI continuam
   * concordando; a tela só recarrega a ficha depois de salvar.
   */
  const [uniformeAberto, setUniformeAberto] = useState(false);
  const [uniPossui, setUniPossui] = useState<"sim" | "nao">("sim");
  const [uniCamiseta, setUniCamiseta] = useState("");
  const [uniCalca, setUniCalca] = useState("");
  const [uniBota, setUniBota] = useState("");
  const [uniErro, setUniErro] = useState<string | null>(null);
  const [salvandoUniforme, setSalvandoUniforme] = useState(false);

  const [trocaAberta, setTrocaAberta] = useState(false);
  const [trocaCodCliente, setTrocaCodCliente] = useState("");
  const [trocaCargoId, setTrocaCargoId] = useState("");
  const [trocaErro, setTrocaErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [cpfAberto, setCpfAberto] = useState(false);
  const [cpfNovo, setCpfNovo] = useState("");
  const [cpfErro, setCpfErro] = useState<string | null>(null);
  const [cpfDuplicado, setCpfDuplicado] = useState<string | null>(null);
  const [corrigindoCpf, setCorrigindoCpf] = useState(false);
  const [clientes, setClientes] = useState<{ codCliente: string; razaoSocial: string; nomeOperacao: string | null }[]>([]);
  const [cargos, setCargos] = useState<{ id: string; nome: string }[]>([]);

  // Catálogos só quando a troca é aberta: quem só olha a ficha não paga duas listas grandes.
  useEffect(() => {
    if (!trocaAberta || !token || clientes.length > 0) return;
    let vivo = true;
    Promise.all([
      apiFetch<{ codCliente: string; razaoSocial: string; nomeOperacao: string | null }[]>(
        "/admin/clientes",
        { token },
      ),
      apiFetch<{ id: string; nome: string }[]>("/admin/cargos", { token }),
    ])
      .then(([cli, car]) => {
        if (!vivo) return;
        setClientes(cli);
        setCargos(car);
      })
      .catch(() => setTrocaErro("Não foi possível carregar clientes e cargos. Tente de novo."));
    return () => {
      vivo = false;
    };
  }, [trocaAberta, token, clientes.length]);

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

  /**
   * VER O ASO ANEXADO, pelas MESMAS rotas dos documentos da régua. O arquivo é servido da staging,
   * com o caminho resolvido no servidor a partir de (admissão, tipo, índice), nunca pelo cliente
   * (§A.6). O ASO é arquivo único, então abre direto. Sem arquivo (TTL de 48h vencido ou régua
   * fechada e staging expurgada) mostra o aviso: é estado normal do fluxo, não erro.
   */
  const verAso = useCallback(async () => {
    if (!asoTipoDocumentoId) return;
    setAbrindoAso(true);
    setAsoErro(null);
    try {
      const resp = await apiFetch<{
        disponivel: boolean;
        mensagem?: string;
        arquivos: { indice: number }[];
      }>(`/esteira/auditoria/${admissaoId}/documento/${asoTipoDocumentoId}/arquivos`, { token });
      if (!resp.disponivel || resp.arquivos.length === 0) {
        setAsoErro(resp.mensagem ?? "ASO não está mais disponível para visualização.");
        return;
      }
      await apiOpenInline(
        `/esteira/auditoria/${admissaoId}/documento/${asoTipoDocumentoId}/arquivo/${resp.arquivos[0].indice}`,
        token,
      );
    } catch (e) {
      setAsoErro(e instanceof ApiError ? e.message : "Falha ao abrir o ASO.");
    } finally {
      setAbrindoAso(false);
    }
  }, [admissaoId, asoTipoDocumentoId, token]);

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

  /** Mensagem REAL do backend (ele explica a trava), com fallback só quando não vier nada. */
  function mensagemDoErro(e: unknown, padrao: string): string {
    if (e instanceof ApiError && typeof e.data === "object" && e.data) {
      return (e.data as { message?: string }).message ?? e.message;
    }
    return e instanceof Error ? e.message : padrao;
  }

  /** Abre o editor já com o que está gravado, para a pessoa corrigir e não redigitar. */
  function abrirUniforme() {
    setUniPossui(data?.uniforme?.possui === false ? "nao" : "sim");
    setUniCamiseta(data?.uniforme?.camiseta ?? "");
    setUniCalca(data?.uniforme?.calca ?? "");
    setUniBota(data?.uniforme?.bota ?? "");
    setUniErro(null);
    setUniformeAberto(true);
  }

  async function salvarUniforme() {
    setSalvandoUniforme(true);
    setUniErro(null);
    try {
      await apiFetch(`/admissoes/${admissaoId}/uniforme`, {
        method: "PATCH",
        token,
        body: {
          uniforme: {
            possui: uniPossui === "sim",
            // Campo vazio vai AUSENTE, e não como string vazia: o DTO valida contra o catálogo, e
            // "" não é tamanho. Quem não escolheu segue sem tamanho gravado.
            camiseta: uniPossui === "sim" && uniCamiseta ? uniCamiseta : undefined,
            calca: uniPossui === "sim" && uniCalca ? uniCalca : undefined,
            bota: uniPossui === "sim" && uniBota ? uniBota : undefined,
          },
        },
      });
      setUniformeAberto(false);
      carregar(); // recarrega a ficha: o tamanho novo aparece na hora.
    } catch (e) {
      setUniErro(e instanceof ApiError ? e.message : "Falha ao salvar o uniforme.");
    } finally {
      setSalvandoUniforme(false);
    }
  }

  async function trocarClienteCargo() {
    if (!trocaCodCliente || !trocaCargoId) return;
    setTrocando(true);
    setTrocaErro(null);
    try {
      await apiFetch(`/admissoes/${admissaoId}/trocar-cliente`, {
        method: "PATCH",
        token,
        body: { codCliente: trocaCodCliente, cargoId: trocaCargoId },
      });
      setTrocaAberta(false);
      setTrocaCodCliente("");
      setTrocaCargoId("");
      carregar(); // recarrega a ficha: o par novo e o aviso vermelho aparecem na hora.
    } catch (e) {
      setTrocaErro(mensagemDoErro(e, "Não foi possível trocar o cliente e o cargo."));
    } finally {
      setTrocando(false);
    }
  }

  /**
   * Corrige o CPF. A COLISÃO não é bloqueio automático: o backend devolve 409 com o NOME de quem já
   * tem aquele CPF, a tela mostra o nome, e o Master decide reenviando com `confirmarDuplicado`.
   */
  async function corrigirCpf(confirmarDuplicado = false) {
    if (!cpfNovo.trim()) return;
    setCorrigindoCpf(true);
    setCpfErro(null);
    try {
      await apiFetch(`/admissoes/${admissaoId}/corrigir-cpf`, {
        method: "PATCH",
        token,
        body: { cpf: cpfNovo, confirmarDuplicado: confirmarDuplicado || undefined },
      });
      setCpfAberto(false);
      setCpfNovo("");
      setCpfDuplicado(null);
      carregar();
    } catch (e) {
      const corpo =
        e instanceof ApiError && typeof e.data === "object" && e.data
          ? (e.data as { codigo?: string; nomeDuplicado?: string; message?: string })
          : null;
      if (corpo?.codigo === "CPF_DUPLICADO") {
        setCpfDuplicado(corpo.nomeDuplicado ?? "não informado");
        setCpfErro(corpo.message ?? null);
      } else {
        setCpfErro(mensagemDoErro(e, "Não foi possível corrigir o CPF."));
      }
    } finally {
      setCorrigindoCpf(false);
    }
  }

  async function marcarRevisado() {
    setRevisando(true);
    try {
      await apiFetch(`/admissoes/${admissaoId}/troca-cliente/revisado`, { method: "PATCH", token });
      setConfirmandoRevisao(false);
      carregar();
    } catch {
      setConfirmandoRevisao(false);
    } finally {
      setRevisando(false);
    }
  }

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

            {/* AVISO DE TROCA DE CLIENTE (OST da correção do cliente errado). VERMELHO e antes de
                tudo, porque muda a leitura da ficha inteira: o sistema reaponta sozinho o que é
                estrutural (pasta do Drive, assinante, obrigatoriedade, régua), mas NÃO sabe julgar se
                os documentos já coletados servem para o cliente e o cargo novos. Isso é do consultor,
                e o aviso fica até ele clicar em Revisado. */}
            {data.trocaClienteEm && (
              <div className="rounded-xl border border-[rgba(214,69,69,0.45)] bg-[rgba(214,69,69,0.1)] px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-danger">
                  Troca De Cliente Ou Cargo
                </div>
                <p className="mt-1 text-[13.5px] text-text">
                  Esta admissão teve o cliente e o cargo trocados em {fmtDataHora(data.trocaClienteEm)}.
                  Revise os DOCUMENTOS já coletados e o prontuário: a régua documental do novo par pode
                  exigir outros documentos, e o que foi coletado antes pode não servir.
                </p>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="secondary"
                    className="!py-1.5 !text-[12.5px]"
                    disabled={revisando}
                    onClick={() => setConfirmandoRevisao(true)}
                  >
                    {revisando ? "Registrando…" : "Revisado"}
                  </Button>
                </div>
              </div>
            )}

            {/* AVISO DE EPI (OST Onda 3, item 1). Persiste na ficha enquanto a admissão tiver EPI:
                o sistema sabe QUE tem e QUAIS são, mas quem valida se o EPI certo foi entregue é o
                consultor. Amarelo, não vermelho: é trabalho a fazer, não erro a corrigir. */}
            {data.epi?.possui === true && (
              <div className="rounded-xl border border-[rgba(201,138,18,0.45)] bg-[rgba(201,138,18,0.1)] px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-warn">EPI A Validar</div>
                <p className="mt-1 text-[13.5px] text-text">
                  Esta admissão tem EPI:{" "}
                  <span className="font-semibold">{listaEpi(data.epi)}</span>. Valide a entrega do
                  equipamento com o cliente antes de concluir.
                </p>
              </div>
            )}

            {/* CORREÇÕES DE MASTER (OST Onda 3, item 1, parte 3). Só MASTER/SUPER_ADMIN VÊ, e o
                `@Roles` das duas rotas é quem de fato barra o consultor comum. São as interfaces dos
                motores dos itens 8 e 9, que já existiam e só não tinham botão. */}
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2">
                <span className="text-[11px] uppercase tracking-wide text-faint">Correções</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="!py-1.5 !text-[12.5px]"
                    onClick={() => {
                      setTrocaErro(null);
                      setTrocaAberta(true);
                    }}
                  >
                    Trocar cliente e cargo
                  </Button>
                  <Button
                    variant="secondary"
                    className="!py-1.5 !text-[12.5px]"
                    onClick={() => {
                      setCpfErro(null);
                      setCpfDuplicado(null);
                      setCpfNovo("");
                      setCpfAberto(true);
                    }}
                  >
                    Corrigir CPF
                  </Button>
                </div>
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
                {/* UNIFORME (OST Onda 3, item 1). Fica aqui, e não no bloco da folha, porque tamanho
                    é da PESSOA. "não respondido" é estado distinto de "não possui": o primeiro é
                    pendência obrigatória, o segundo é resposta completa. */}
                <Campo
                  rotulo="Uniforme"
                  valor={
                    data.uniforme?.possui === true
                      ? "Sim"
                      : data.uniforme?.possui === false
                        ? "Não"
                        : "não respondido"
                  }
                />
                {data.uniforme?.possui === true && (
                  <>
                    <Campo rotulo="Camiseta" valor={data.uniforme.camiseta || "não informado"} />
                    <Campo rotulo="Calça" valor={data.uniforme.calca || "não informado"} />
                    <Campo rotulo="Bota" valor={data.uniforme.bota || "não informado"} />
                  </>
                )}
              </div>

              {/* EDIÇÃO DO UNIFORME (item 11b). O tamanho costuma chegar DEPOIS da liberação, e até
                  aqui não havia por onde corrigir. Fica fechado por padrão: a ficha continua sendo de
                  leitura, e a edição é um passo deliberado. */}
              {!uniformeAberto ? (
                <button
                  type="button"
                  onClick={abrirUniforme}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12.5px] font-semibold text-dim transition hover:border-[var(--accent)] hover:text-text"
                >
                  <Icon name="pen" className="h-3.5 w-3.5" />
                  Editar uniforme
                </button>
              ) : (
                <div className="mt-3 rounded-xl border border-[var(--accent)] bg-[var(--surface-2)] p-3">
                  {uniErro && (
                    <p className="mb-2 text-[12.5px] text-danger" role="alert">
                      {uniErro}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="flex flex-col gap-1 text-[12px] text-dim">
                      Possui uniforme
                      <Select
                        value={uniPossui}
                        onChange={(v) => setUniPossui(v === "nao" ? "nao" : "sim")}
                        ariaLabel="Possui uniforme"
                        options={[
                          { value: "sim", label: "Sim" },
                          { value: "nao", label: "Não" },
                        ]}
                      />
                    </label>
                    {/* Os tamanhos só existem para quem POSSUI: responder "não" limpa os três no
                        backend, pelo mesmo normalizador da liberação. */}
                    <label className="flex flex-col gap-1 text-[12px] text-dim">
                      Camiseta
                      <Select
                        value={uniCamiseta}
                        onChange={setUniCamiseta}
                        disabled={uniPossui !== "sim"}
                        ariaLabel="Tamanho da camiseta"
                        placeholder="Tamanho"
                        options={TAMANHOS_CAMISETA.map((t) => ({ value: t, label: t }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-dim">
                      Calça
                      <Select
                        value={uniCalca}
                        onChange={setUniCalca}
                        disabled={uniPossui !== "sim"}
                        ariaLabel="Tamanho da calça"
                        placeholder="Tamanho"
                        options={TAMANHOS_CALCA.map((t) => ({ value: t, label: t }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-dim">
                      Bota
                      <Select
                        value={uniBota}
                        onChange={setUniBota}
                        disabled={uniPossui !== "sim"}
                        ariaLabel="Tamanho da bota"
                        placeholder="Tamanho"
                        options={TAMANHOS_BOTA.map((t) => ({ value: t, label: t }))}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUniformeAberto(false)}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-dim transition hover:text-text"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={salvarUniforme}
                      disabled={salvandoUniforme}
                      className="rounded-lg border border-[var(--accent)] px-3 py-1.5 text-[12.5px] font-semibold text-accent transition hover:bg-[var(--surface)] disabled:opacity-40"
                    >
                      {salvandoUniforme ? "Salvando…" : "Salvar uniforme"}
                    </button>
                  </div>
                </div>
              )}
            </Bloco>

            {/* BLOCO 2 — Trabalho e cadastro */}
            <Bloco titulo="Trabalho e cadastro">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {/* CÓDIGO JUNTO DO NOME ("0060 - AVL"). SÓ informação visual: não é editável, não
                    entra em régua e não é pendência. Existe porque há clientes com a MESMA razão
                    social e CNPJs diferentes (o caso da IFF), e sem o código não dá para saber qual
                    dos dois é o desta admissão. */}
                <Campo
                  rotulo="Cliente"
                  valor={`${data.cliente.codCliente} - ${data.cliente.operacao || data.cliente.razaoSocial}`}
                />
                <Campo rotulo="Cargo" valor={data.cargo} />
                <Campo rotulo="Salário" valor={fmtMoeda(data.vagaFolha.salario)} />
                <Campo rotulo="Tipo de contrato" valor={data.tipoContrato || "não informado"} />
                {/* MOTIVO DA CONTRATAÇÃO (item 5): ao lado do tipo de contrato, o par que a diretoria
                    precisa ver nas temporárias. */}
                <Campo
                  rotulo="Motivo da contratação"
                  valor={data.vagaFolha.motivo || "não informado"}
                />
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
              {/* Veredito do ASO pela I.A (aba Exame), read-only: a I.A decide apto/inapto na leitura.
                  A PÍLULA FOI SEPARADA EM DUAS. Antes, "aguardando validação da I.A" cobria dois
                  estados opostos: o ASO que ainda não tinha veredito e o que a I.A REPROVOU. Quem
                  lia a ficha de um ASO recusado achava que era só esperar, e nunca via a razão da
                  recusa, que a I.A escreve e o sistema descartava. Agora são estados distintos e o
                  motivo real aparece embaixo. */}
              {asoAnexado !== undefined && (
                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-dim">ASO (I.A):</span>
                    {asoEstado === "INCONFORME" ? (
                      <Pill tone="dg">ASO Reprovado Pela I.A</Pill>
                    ) : asoValidado ? (
                      <Pill tone="ok">ASO Validado Pela I.A</Pill>
                    ) : asoAnexado ? (
                      <Pill tone="wn">ASO Anexado, Aguardando Validação Da I.A</Pill>
                    ) : (
                      <Pill tone="nt">ASO Não Anexado</Pill>
                    )}
                    {/* VER O ASO: mesma visualização dos documentos da régua, servida da staging. */}
                    {asoAnexado && asoTipoDocumentoId && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                        disabled={abrindoAso}
                        title="Abrir o ASO anexado para conferir"
                        onClick={() => void verAso()}
                      >
                        <Icon name="eye" className="h-4 w-4" />
                        {abrindoAso ? "Abrindo…" : "Ver ASO"}
                      </button>
                    )}
                  </div>
                  {/* O MOTIVO REAL da I.A, que era descartado no backend e nunca chegava aqui. */}
                  {asoMotivo?.trim() && (
                    <p
                      className={cn(
                        "mt-2 text-[12.5px]",
                        asoEstado === "INCONFORME"
                          ? "text-danger"
                          : asoValidado
                            ? "text-ok"
                            : "text-warn",
                      )}
                    >
                      {asoMotivo}
                    </p>
                  )}
                  {asoErro && (
                    <p className="mt-2 text-[12.5px] text-danger" role="alert">
                      {asoErro}
                    </p>
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
      {/* A revisão da troca FICA REGISTRADA com o nome de quem clicou, então a tela diz isso ANTES
        de confirmar. O aviso sai da ficha; o que aconteceu permanece no histórico. */}
      <ConfirmDialog
        open={confirmandoRevisao}
        title="Confirmar Revisão Da Troca"
        message="Confirma que revisou os documentos e o prontuário para o cliente e o cargo novos? O aviso sai da ficha, e esta confirmação fica registrada no histórico com o seu nome e a data."
        confirmLabel="Sim, revisei"
        busy={revisando}
        onConfirm={() => void marcarRevisado()}
        onCancel={() => setConfirmandoRevisao(false)}
      />

      {/* TROCA DE CLIENTE E CARGO (item 8). Os DOIS juntos, porque régua e memória resolvem pelo par:
          trocar só o cliente deixaria a admissão sem checklist. O backend recusa par sem régua e
          admissão com as três frentes concluídas; a mensagem dele é mostrada como veio. */}
      {trocaAberta && (
        <Modal
          onClose={() => !trocando && setTrocaAberta(false)}
          ariaLabel="Trocar cliente e cargo"
          className="max-w-[520px] p-6"
        >
          <div className="mb-5">
            <div className="eyebrow !mb-1">Correção De Master</div>
            <h2 className="font-display text-xl font-bold">Trocar Cliente E Cargo</h2>
            <p className="mt-1 text-[13px] text-dim">
              Atual: {data?.cliente.codCliente} · {data?.cliente.razaoSocial} · {data?.cargo}. A régua
              documental e a memória resolvem pelo par cliente e cargo, então os dois trocam juntos.
              Depois da troca, revise os documentos já coletados.
            </p>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="ds-label">Cliente novo</span>
              <Select
                value={trocaCodCliente}
                onChange={setTrocaCodCliente}
                placeholder="Selecione o cliente…"
                ariaLabel="Cliente novo"
                searchable
                menuFit
                options={clientes.map((c) => ({
                  value: c.codCliente,
                  label: `${c.codCliente} · ${c.nomeOperacao ?? c.razaoSocial}`,
                }))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="ds-label">Cargo novo</span>
              <Select
                value={trocaCargoId}
                onChange={setTrocaCargoId}
                placeholder="Selecione o cargo…"
                ariaLabel="Cargo novo"
                searchable
                menuFit
                options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </label>
          </div>
          {trocaErro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {trocaErro}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setTrocaAberta(false)}
              disabled={trocando}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void trocarClienteCargo()}
              disabled={!trocaCodCliente || !trocaCargoId || trocando}
            >
              {trocando ? "Trocando…" : "Trocar"}
            </Button>
          </div>
        </Modal>
      )}

      {/* CORRIGIR CPF (item 9). É só acertar o campo para bater com o documento: não reprocessa
          auditoria, não renomeia arquivo, não reagrupa nada. O dígito é validado no backend, e a
          colisão volta com o NOME de quem já tem o CPF, para o Master decidir. */}
      {cpfAberto && (
        <Modal
          onClose={() => !corrigindoCpf && setCpfAberto(false)}
          ariaLabel="Corrigir CPF"
          className="max-w-[480px] p-6"
        >
          <div className="mb-5">
            <div className="eyebrow !mb-1">Correção De Master</div>
            <h2 className="font-display text-xl font-bold">Corrigir CPF</h2>
            <p className="mt-1 text-[13px] text-dim">
              {caixaAlta(data?.candidato.nome ?? "")}, CPF atual {fmtCpf(data?.candidato.cpf ?? "")}.
              Confira o CPF no documento do candidato. A correção fica registrada no histórico com o
              seu nome.
            </p>
          </div>
          <label className="grid gap-1.5">
            <span className="ds-label">CPF correto</span>
            <input
              className="ds-input font-mono"
              inputMode="numeric"
              maxLength={14}
              placeholder="000.000.000-00"
              value={cpfNovo}
              onChange={(e) => {
                setCpfNovo(e.target.value);
                // Digitou de novo: a confirmação de duplicidade anterior não vale mais.
                setCpfDuplicado(null);
                setCpfErro(null);
              }}
            />
          </label>
          {cpfErro && (
            <p
              className={`mt-4 rounded-xl border border-[var(--border)] px-3 py-2 text-sm ${
                cpfDuplicado ? "bg-[rgba(201,138,18,0.12)] text-warn" : "bg-[rgba(214,69,69,0.1)] text-danger"
              }`}
              role="alert"
            >
              {cpfErro}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCpfAberto(false)} disabled={corrigindoCpf}>
              Cancelar
            </Button>
            <Button
              onClick={() => void corrigirCpf(cpfDuplicado !== null)}
              disabled={!cpfNovo.trim() || corrigindoCpf}
            >
              {corrigindoCpf
                ? "Corrigindo…"
                : cpfDuplicado
                  ? "É a mesma pessoa, corrigir"
                  : "Corrigir"}
            </Button>
          </div>
        </Modal>
      )}

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
