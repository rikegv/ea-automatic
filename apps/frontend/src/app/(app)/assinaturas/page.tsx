"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { ClicksignStatus } from "@ea/shared-types";
import { apiFetch, apiOpenInline, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { clicksignPill, temEnvelopeReenviavel } from "@/lib/clicksign";
import { caixaAlta } from "@/lib/nome";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GoogleDriveLogo } from "@/components/ui/GoogleDriveLogo";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

/** Uma linha da tela. Espelha `LinhaAssinatura` do backend (§A.6: sem CPF, sem id de envelope). */
interface Linha {
  admissaoId: string;
  candidato: string;
  cliente: string | null;
  cargo: string | null;
  tipoContrato: string | null;
  /** Data de admissão (YYYY-MM-DD). Nulável: a admissão pode ainda não ter data (§A.3). */
  dataAdmissao: string | null;
  clicksignStatus: ClicksignStatus;
  temEnvelope: boolean;
  enviadoEm: string | null;
  contratoAssinadoDriveUrl: string | null;
  origem: string;
  /** Só na aba "Prontos para solicitar": quando o kit foi anexado pelo Gerador de Kit. */
  kitAnexadoEm?: string | null;
  /** `null` = apta a disparar. Preenchido = BLOQUEADA, e a linha não é selecionável. */
  bloqueio?: string | null;
  /** Fase detectada pelo backend; define o aviso das ações destrutivas. */
  fase: FaseEnvelope;
  /** Há kit anexado para o olho abrir? Some quando o envelope é ASSINADO (vai ao prontuário). */
  temKit: boolean;
  /** Painel guardado ("X de Y assinaram"), vindo da lista. Alimentado pelo tick, lido do banco. */
  assinantes?: AssinanteStatus[];
  resumo?: { total: number; assinaram: number; pendentes: number };
  /** ISO da última atualização do painel. `null` = ainda não varrido. */
  painelEm?: string | null;
}

type FaseEnvelope = "NAO_ENVIADO" | "ENVIADO" | "ASSINADO" | "ENCERRADO";

/**
 * Aviso por FASE, espelhando `domain/assinante-empresa.avisoDaFase` do backend. O texto muda porque a
 * consequência muda: sem envelope não há quem notificar; em andamento o funcionário é avisado; já
 * assinado, desfaz-se um documento válido.
 */
function avisoDaFase(fase: FaseEnvelope, acao: "cancelar" | "trocar"): string {
  const fim = acao === "trocar" ? " Depois disso, envie o kit novo pelo Gerador de Kit." : "";
  // O texto antigo ("ainda NÃO foi enviado. Ninguém é notificado.") lia como inofensivo e escondia a
  // consequência mais dura da tela: é aqui que o candidato SAI da fila de disparo e o kit é perdido.
  if (fase === "NAO_ENVIADO")
    return acao === "trocar"
      ? "Este candidato ainda não tem envelope na Clicksign, então ninguém é notificado. O kit " +
          "anexado é descartado e ele sai da fila de assinatura." +
          fim
      : "Este candidato ainda não tem envelope na Clicksign, então ninguém é notificado. Mas ele " +
          "SAI da fila de assinatura e o kit anexado é descartado. Para voltar, será preciso " +
          "gerar e enviar o kit de novo pelo Gerador de Kit.";
  if (fase === "ENVIADO")
    return (
      "Esta ação vai cancelar o envelope em andamento na Clicksign e notificar o funcionário." + fim
    );
  if (fase === "ASSINADO")
    return (
      "Esta ação vai cancelar um envelope JÁ ASSINADO e notificar o funcionário. O contrato deixa de " +
      "valer no EA." + fim
    );
  return "Este envelope já está encerrado (cancelado ou expirado). Não há o que cancelar." + fim;
}

/**
 * Botão de ação da linha, no MESMO padrão da coluna Ações da Esteira (`h-8 w-8`, ícone, tooltip):
 * o sistema já resolve ação de fila com botão-ícone, não com botão rotulado. Não é componente novo
 * de design system, é o mesmo desenho, reaproveitado para a linha não ficar desproporcional.
 */
function AcaoIcone({
  icone,
  titulo,
  onClick,
  disabled,
  perigo,
}: {
  icone: IconName;
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition",
        "hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40",
        perigo ? "hover:text-danger" : "hover:text-accent",
      )}
    >
      <Icon name={icone} className="h-[17px] w-[17px]" />
    </button>
  );
}

/**
 * QUEM ASSINOU E QUEM ESTÁ DEVENDO, embaixo da linha do candidato.
 *
 * POR QUE EXISTE. A tela mostrava só o status do ENVELOPE ("Aguardando Assinatura"), que diz que
 * falta alguém e não diz QUEM. Um envelope de admissão tem o funcionário e o representante da
 * empresa, e o caso normal é um já ter assinado e o outro não: sem esta lista não havia como cobrar
 * a pessoa certa.
 *
 * Pendente vem PRIMEIRO (a ordenação vem pronta do backend), porque a tela existe para cobrar quem
 * está devendo, não para celebrar quem já assinou.
 */
function Assinantes({
  dados,
  onAtualizar,
  atualizando,
}: {
  dados: RespAssinantes | undefined;
  onAtualizar: () => void;
  atualizando: boolean;
}) {
  if (!dados) {
    return <span className="text-[12px] text-faint">Consultando os assinantes…</span>;
  }
  if (dados.indisponivel) {
    return <span className="text-[12px] text-faint">{dados.indisponivel}</span>;
  }
  if (dados.assinantes.length === 0) {
    return <span className="text-[12px] text-faint">Sem assinantes registrados no envelope.</span>;
  }

  const { total, assinaram, pendentes } = dados.resumo;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {/* FRESCOR EXPLÍCITO. O painel vem do banco, alimentado pelo ciclo do tick, então pode estar
          alguns minutos atrasado. Dizer há quanto tempo foi atualizado é o que impede alguém de ler
          isto como tempo real; quem precisa do exato agora tem o botão ao lado. */}
      <span className="inline-flex items-center gap-1 text-[11.5px] text-faint">
        <span title={dados.atualizadoEm ? formatarDataHora(dados.atualizadoEm) : undefined}>
          {haQuantoTempo(dados.atualizadoEm)}
        </span>
        <button
          type="button"
          onClick={onAtualizar}
          disabled={atualizando}
          title="Consultar a Clicksign agora, só deste candidato"
          aria-label="Atualizar assinantes deste candidato"
          className="grid h-5 w-5 flex-none place-items-center rounded text-faint transition hover:bg-[var(--surface-2)] hover:text-accent disabled:opacity-40"
        >
          <Icon name="refresh" className={cn("h-3 w-3", atualizando && "animate-spin")} />
        </button>
      </span>
      <span
        className={cn(
          "text-[12px] font-semibold",
          pendentes === 0 ? "text-ok" : "text-warn",
        )}
      >
        {assinaram} de {total} assinaram
        {pendentes > 0 ? `, ${pendentes} pendente${pendentes === 1 ? "" : "s"}` : ""}:
      </span>
      {dados.assinantes.map((a) => (
        <span
          key={`${a.nome}-${a.ordem ?? 0}-${a.assinou}`}
          title={
            a.assinou
              ? `Assinou em ${formatarDataHora(a.assinadoEm)}`
              : "Ainda não assinou, é quem falta cobrar"
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold",
            a.assinou
              ? "border-[rgba(45,138,86,0.35)] bg-[rgba(45,138,86,0.10)] text-ok"
              : "border-[rgba(191,138,26,0.35)] bg-[rgba(191,138,26,0.10)] text-warn",
          )}
        >
          <Icon name={a.assinou ? "check" : "clock"} className="h-3 w-3 flex-none" />
          {caixaAlta(a.nome)}
          {/* §A.24: o status dentro da tag é etiqueta, então vai em title case. */}
          <span className="font-normal opacity-80">
            {/* HORA junto da data (decisão do diretor, incidente de 06/08/2026): saber o dia não
                basta para conferir o que a Clicksign devolveu contra o que a plataforma gravou. O
                dado já vinha completo do backend, só a tela mostrava menos do que sabia. */}
            {a.assinou ? `Assinou ${formatarDataHoraCurta(a.assinadoEm)}` : "Pendente"}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Resultado por candidato do disparo em lote (parcialidade: um falhar não derruba os outros). */
interface ItemLote {
  admissaoId: string;
  candidato: string;
  ok: boolean;
  motivo?: string;
}

/**
 * Uma pessoa do envelope, com o status DELA. Espelha `AssinanteStatus` do backend.
 *
 * §A.6: chega nome, se assinou, quando e a ordem. A Clicksign devolve muito mais (e-mail, CPF, IP e
 * até coordenadas de quem assinou) e o backend corta tudo isso antes de responder.
 */
interface AssinanteStatus {
  nome: string;
  assinou: boolean;
  assinadoEm: string | null;
  ordem: number | null;
}

interface RespAssinantes {
  assinantes: AssinanteStatus[];
  resumo: { total: number; assinaram: number; pendentes: number };
  /** ISO da última atualização do painel. `null` = ainda não varrido pelo tick. */
  atualizadoEm?: string | null;
  /** Preenchido quando não deu para consultar (sem envelope, integração inerte, provedor fora). */
  indisponivel?: string;
}

/** Painel vazio, para linha ainda não varrida. */
const VAZIO = { total: 0, assinaram: 0, pendentes: 0 };

type Aba = "aptos" | "abertos" | "encerrados" | "assinados";

// Ordem definida pelo diretor: a fila de trabalho primeiro, depois o acompanhamento, depois o
// histórico. É a ordem do fluxo real: dispara, acompanha, arquiva.
const ABAS: { chave: Aba; rotulo: string; ajuda: string }[] = [
  {
    chave: "aptos",
    rotulo: "Prontos Para Solicitar",
    ajuda:
      "Kits enviados pelo Gerador de Kit, já anexados e esperando o disparo. Selecione e dispare em lote.",
  },
  {
    chave: "abertos",
    rotulo: "Gestão Das Assinaturas",
    ajuda: "Assinaturas VIVAS, aguardando quem falta assinar. Cancelados e expirados moram na aba própria.",
  },
  {
    chave: "encerrados",
    rotulo: "Cancelados E Expirados",
    ajuda:
      "Envelopes encerrados SEM assinatura: cancelados pelo consultor ou vencidos pelo prazo de 30 dias. " +
      "Saíram da Gestão porque processo encerrado não é trabalho de fila.",
  },
  {
    chave: "assinados",
    rotulo: "Assinados",
    ajuda: "Contratos assinados e já arquivados no Drive. Histórico consultável.",
  },
];

/** Prazo do envelope em dias, o mesmo que o backend manda no `deadline_at`. Só para exibição. */
const PRAZO_DIAS = 30;

/** Data curta em pt-BR. Sem data, devolve o marcador da §A.11 (nunca o glifo de travessão). */
function formatarData(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Data de admissão, que é um `date` puro (YYYY-MM-DD) e NÃO um instante.
 *
 * Formata por PARTES de propósito, e não com `new Date()`: a string sem fuso é lida como meia-noite
 * UTC, e no fuso do Brasil isso volta um dia atrás na tela. É o mesmo cuidado que a Esteira já toma
 * em `fmtDataAdmissao`. O `formatarData` acima continua sendo o certo para os campos que SÃO
 * instantes (envio do envelope, anexo do kit).
 */
function formatarDataAdmissao(d: string | null | undefined): string {
  if (!d) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : formatarData(d);
}

/**
 * Data e hora COMPACTAS ("06/08/2026 14:57"), para o selo de quem assinou. Sem o "às" do tooltip: o
 * selo fica dentro de uma pill ao lado do nome, e cada caractere ali disputa espaço com o próximo.
 */
function formatarDataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Há quanto tempo o painel foi atualizado, em texto curto.
 *
 * Existe para a tela NÃO se passar por tempo real. O painel vem do banco, alimentado pelo ciclo do
 * tick, e omitir isso faria o operador cobrar alguém por uma assinatura que já entrou há um minuto.
 */
function haQuantoTempo(iso: string | null | undefined): string {
  if (!iso) return "ainda não atualizado";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "atualizado agora";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "atualizado agora";
  if (min === 1) return "atualizado há 1 minuto";
  if (min < 60) return `atualizado há ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h === 1) return "atualizado há 1 hora";
  if (h < 24) return `atualizado há ${h} horas`;
  const d = Math.floor(h / 24);
  return d === 1 ? "atualizado ontem" : `atualizado há ${d} dias`;
}

/** Data e hora em pt-BR, para o tooltip de quem já assinou (o minuto ajuda a conferir a cobrança). */
function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Quantos dias faltam para o envelope vencer. Negativo = já venceu. */
function diasRestantes(iso: string | null): number | null {
  if (!iso) return null;
  const enviado = new Date(iso).getTime();
  if (Number.isNaN(enviado)) return null;
  const vence = enviado + PRAZO_DIAS * 24 * 60 * 60 * 1000;
  return Math.ceil((vence - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * ASS. CLICK (INT-4 / menu `assinaturas`).
 *
 * FLUXO: cadastrado > gera kit > libera kit > "Enviar para assinatura" no Gerador de Kit > a admissão
 * cai aqui em "Prontos para solicitar" JÁ COM O KIT ANEXADO > o consultor seleciona e dispara o LOTE
 * (é o disparo real, cria o envelope e manda e-mail) > acompanha em "Gestão das assinaturas".
 *
 * NÃO existe upload nesta tela. O modal que pedia o PDF-mãe foi eliminado: o kit já vem anexado, e
 * pedir de novo era pedir ao consultor um arquivo que o sistema já tinha. A única exceção é o reenvio
 * por correção, que por natureza exige o PDF corrigido.
 *
 * §A.6: a tela nunca mostra CPF, id de envelope nem URL da Clicksign. O único link externo é a PASTA
 * do Drive com o contrato assinado.
 */
export default function AssinaturasPage() {
  const { token } = useAuth();
  const [aba, setAba] = useState<Aba>("aptos");
  const [itens, setItens] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Seleção do lote (só na aba "Prontos"). Guarda ids; linha bloqueada nunca entra.
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [confirmandoLote, setConfirmandoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<ItemLote[] | null>(null);

  // Reenvio por correção: é o único fluxo que ainda sobe arquivo (o PDF-mãe corrigido).
  const [alvoReenvio, setAlvoReenvio] = useState<Linha | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [aceite, setAceite] = useState(false);
  const [termo, setTermo] = useState<string | null>(null);
  const [alvoCancelar, setAlvoCancelar] = useState<Linha | null>(null);
  const [alvoTroca, setAlvoTroca] = useState<Linha | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // QUEM JÁ ASSINOU E QUEM ESTÁ DEVENDO, por linha. `undefined` = ainda buscando.
  const [assinantes, setAssinantes] = useState<Record<string, RespAssinantes | undefined>>({});
  /** Id da linha sendo consultada ao vivo pelo botão de atualizar. */
  const [atualizando, setAtualizando] = useState<string | null>(null);

  const carregar = useCallback(
    async (qual: Aba) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      setAssinantes({});
      try {
        const r = await apiFetch<{ itens: Linha[] }>(`/clicksign/envelopes?aba=${qual}`, { token });
        setItens(r.itens ?? []);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Falha ao carregar a fila de assinaturas.");
        setItens([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    setSelecao(new Set());
    void carregar(aba);
  }, [aba, carregar]);

  /**
   * Busca os assinantes das linhas QUE TÊM ENVELOPE, depois que a lista chegou.
   *
   * O PAINEL VEM DA LISTA, não da Clicksign. Antes esta tela consultava o provedor linha por linha
   * (2 requisições cada, 220 numa aba de 110), e isso gerava centenas de 429 antes do limitador e
   * 60 segundos de espera depois dele. O painel agora é guardado pelo tick e chega junto da lista,
   * então a tabela abre completa e instantânea, sem tocar a rede externa.
   *
   * Este efeito só SEMEIA o mapa local com o que o backend mandou. A consulta ao vivo continua
   * existindo, mas sob demanda, no botão de atualizar de cada linha.
   */
  useEffect(() => {
    if (itens.length === 0) return;
    setAssinantes(
      Object.fromEntries(
        itens.map((i) => [
          i.admissaoId,
          { assinantes: i.assinantes ?? [], resumo: i.resumo ?? VAZIO, atualizadoEm: i.painelEm ?? null },
        ]),
      ),
    );
  }, [itens]);

  /**
   * ATUALIZAR UMA LINHA AO VIVO. Para quem precisa do exato agora e não pode esperar o próximo ciclo
   * do tick. Custa 2 requisições, de UMA pessoa, e o resultado é guardado no banco pelo backend, para
   * o ciclo seguinte não repetir o trabalho.
   */
  const atualizarLinha = useCallback(
    async (l: Linha) => {
      if (!token) return;
      setAtualizando(l.admissaoId);
      try {
        const r = await apiFetch<RespAssinantes>(`/clicksign/${l.admissaoId}/assinantes`, { token });
        setAssinantes((atual) => ({ ...atual, [l.admissaoId]: r }));
      } catch {
        setError("Não foi possível consultar os assinantes na Clicksign agora.");
      } finally {
        setAtualizando(null);
      }
    },
    [token],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) =>
      [i.candidato, i.cliente, i.cargo, i.tipoContrato]
        .filter(Boolean)
        .some((c) => String(c).toLowerCase().includes(q)),
    );
  }, [itens, busca]);

  /**
   * Ordenação clicável pelo NOME, reusando a peça que as demais tabelas já usam (`useOrdenacao` +
   * `ColunaOrdenavel`). Client-side, que é honesto aqui: a tela carrega o conjunto inteiro da aba
   * (teto de 500 no backend, sem paginação), diferente do Gerenciador, que é paginado no servidor e
   * por isso ficou de fora da peça.
   *
   * Sem clique, a lista sai na ordem que o backend mandou (mais recente primeiro), intacta.
   */
  const colunasOrdenaveis = useMemo<ColOrd<Linha>[]>(
    () => [
      { chave: "candidato", tipo: "texto", valor: (l) => l.candidato },
      { chave: "cliente", tipo: "texto", valor: (l) => l.cliente },
      { chave: "cargo", tipo: "texto", valor: (l) => l.cargo },
      { chave: "contrato", tipo: "texto", valor: (l) => l.tipoContrato },
      { chave: "dataAdmissao", tipo: "data", valor: (l) => l.dataAdmissao },
      /**
       * SITUAÇÃO ordena por coisas diferentes conforme a aba, porque a coluna mostra coisas
       * diferentes: na fila é o bloqueio (apta na frente, bloqueada depois, que é a ordem de quem
       * trabalha a fila); nas demais é QUANTOS FALTAM assinar, que é a pergunta que a tela responde.
       */
      {
        chave: "situacao",
        tipo: "numero",
        valor: (l) => (aba === "aptos" ? (l.bloqueio ? 1 : 0) : (l.resumo?.pendentes ?? 0)),
      },
      // Prazo é derivado do envio, então ordenar por um é ordenar pelo outro. Usa a data de envio,
      // que é o dado real; o "X dia(s)" da tela é só a apresentação dela.
      { chave: "prazo", tipo: "data", valor: (l) => l.enviadoEm },
    ],
    [aba],
  );
  const ord = useOrdenacao(colunasOrdenaveis, filtradas);
  const visiveis = ord.itens;

  const naFila = aba === "aptos";
  const selecionaveis = useMemo(() => visiveis.filter((l) => !l.bloqueio), [visiveis]);
  const bloqueadas = useMemo(() => visiveis.filter((l) => l.bloqueio).length, [visiveis]);
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((l) => selecao.has(l.admissaoId));

  function alternar(id: string) {
    setSelecao((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function alternarTodas() {
    setSelecao(todasMarcadas ? new Set() : new Set(selecionaveis.map((l) => l.admissaoId)));
  }

  /** DISPARO EM LOTE: é aqui que o envelope nasce e o e-mail sai. Ação humana, nunca automática. */
  const dispararLote = useCallback(async () => {
    if (!token || selecao.size === 0) return;
    setBusy("lote");
    setError(null);
    try {
      const r = await apiFetch<{ total: number; disparados: number; itens: ItemLote[] }>(
        "/clicksign/disparar-lote",
        { method: "POST", token, body: { admissaoIds: [...selecao] } },
      );
      setConfirmandoLote(false);
      setResultadoLote(r.itens ?? []);
      setSelecao(new Set());
      await carregar(aba);
    } catch (e) {
      setConfirmandoLote(false);
      setError(e instanceof ApiError ? e.message : "Falha ao disparar o lote.");
    } finally {
      setBusy(null);
    }
  }, [token, selecao, aba, carregar]);

  const fecharReenvio = useCallback(() => {
    setAlvoReenvio(null);
    setArquivo(null);
    setAceite(false);
    setTermo(null);
    setError(null);
  }, []);

  /** Reenvio por correção: cancela o envelope atual e dispara outro a partir do PDF-mãe corrigido. */
  const reenviar = useCallback(async () => {
    if (!alvoReenvio || !arquivo || !token) return;
    setBusy(alvoReenvio.admissaoId);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", arquivo);
      if (aceite) fd.append("aceiteDuplaCorrecao", "true");
      await apiUpload(`/clicksign/${alvoReenvio.admissaoId}/reenviar-correcao`, fd, token);
      fecharReenvio();
      await carregar(aba);
    } catch (e) {
      // 409 needsConfirmation: o backend exige o aceite explícito da dupla correção (§A.5).
      if (e instanceof ApiError && e.status === 409) {
        const corpo = e.data as { reason?: string; message?: string } | undefined;
        if (corpo?.reason === "duplaCorrecao") {
          setTermo(corpo.message ?? e.message);
          return;
        }
      }
      setError(e instanceof ApiError ? e.message : "Falha ao reenviar por correção.");
    } finally {
      setBusy(null);
    }
  }, [alvoReenvio, arquivo, aceite, token, aba, carregar, fecharReenvio]);

  /** DISPARO INDIVIDUAL: dispara UM candidato, sem checkbox e sem lote. Mesma régua do lote. */
  const dispararUm = useCallback(
    async (l: Linha) => {
      if (!token) return;
      setBusy(l.admissaoId);
      setError(null);
      setFlash(null);
      try {
        await apiFetch(`/clicksign/${l.admissaoId}/disparar`, { method: "POST", token });
        setFlash(`Assinatura disparada para ${caixaAlta(l.candidato)}.`);
        await carregar(aba);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Falha ao disparar a assinatura.");
      } finally {
        setBusy(null);
      }
    },
    [token, aba, carregar],
  );

  /** Abre o KIT ANEXADO em nova aba. Some quando assinado: aí o documento vive no prontuário. */
  const verKit = useCallback(
    async (l: Linha) => {
      if (!token) return;
      setError(null);
      try {
        await apiOpenInline(`/clicksign/${l.admissaoId}/kit`, token);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Falha ao abrir o kit anexado.");
      }
    },
    [token],
  );

  /** TROCA O KIT: cancela nas duas frentes e desanexa. O kit novo entra pelo Gerador de Kit. */
  const trocarKit = useCallback(async () => {
    if (!alvoTroca || !token) return;
    setBusy(alvoTroca.admissaoId);
    setError(null);
    setFlash(null);
    try {
      const r = await apiFetch<{ clicksign: string }>(
        `/clicksign/${alvoTroca.admissaoId}/trocar-kit`,
        { method: "POST", token },
      );
      setFlash(
        `Kit removido de ${caixaAlta(alvoTroca.candidato)}` +
          (r.clicksign === "cancelado"
            ? ", envelope cancelado na Clicksign."
            : r.clicksign === "best-effort"
              ? ". A Clicksign não aceitou o cancelamento programático; o EA está cancelado."
              : ".") +
          " Envie o kit novo pelo Gerador de Kit.",
      );
      setAlvoTroca(null);
      await carregar(aba);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao trocar o kit.");
      setAlvoTroca(null);
    } finally {
      setBusy(null);
    }
  }, [alvoTroca, token, aba, carregar]);

  /** Cancela o envelope. Não regenera kit: quem quer novo envelope usa o reenvio por correção. */
  const cancelar = useCallback(async () => {
    if (!alvoCancelar || !token) return;
    setBusy(alvoCancelar.admissaoId);
    setError(null);
    try {
      const r = await apiFetch<{ clicksign: string }>(
        `/clicksign/${alvoCancelar.admissaoId}/cancelar`,
        { token, method: "POST" },
      );
      setFlash(
        r.clicksign === "sem-envelope"
          ? // Sem envelope o resultado NÃO é "documento cancelado", é o candidato fora da fila com
            // o kit descartado. Dizer "cancelado" aqui repetiria o engano do aviso antigo.
            `${caixaAlta(alvoCancelar.candidato)} saiu da fila de assinatura e o kit foi ` +
              "descartado. Para voltar, envie o kit de novo pelo Gerador de Kit."
          : `Documento de ${caixaAlta(alvoCancelar.candidato)} cancelado no EA` +
            (r.clicksign === "cancelado"
              ? " e na Clicksign."
              : ". A Clicksign não aceitou o cancelamento programático nesta conta; o estado que vale é o do EA."),
      );
      setAlvoCancelar(null);
      await carregar(aba);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao cancelar o envelope.");
      setAlvoCancelar(null);
    } finally {
      setBusy(null);
    }
  }, [alvoCancelar, token, aba, carregar]);

  const ajuda = ABAS.find((a) => a.chave === aba)?.ajuda ?? "";
  // 8 em cada composição depois da entrada da Data adm.: na fila entra a caixa de seleção e sai o
  // Prazo; nas demais abas é o contrário. O número alimenta o `colSpan` das linhas de vazio.
  const colunas = naFila ? 8 : 8;

  return (
    <>
      <PageHead
        eyebrow="Assinatura de contrato"
        title="Ass. Click"
        subtitle="Fila de disparo em lote e acompanhamento dos envelopes na Clicksign."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={`rounded-full border px-3 py-1 transition ${
              aba === a.chave
                ? "border-accent bg-[var(--surface-2)] text-accent"
                : "border-[var(--border)] text-dim hover:text-text"
            }`}
          >
            {a.rotulo}
            {aba === a.chave ? ` (${itens.length})` : ""}
          </button>
        ))}

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por candidato, cliente ou cargo"
          aria-label="Buscar por candidato, cliente ou cargo"
          className="ds-input h-auto w-auto min-w-[20rem] rounded-full py-1.5"
        />

        <Button
          variant="secondary"
          onClick={() => void carregar(aba)}
          className="ml-auto px-3 py-1.5"
          title="Recarregar a fila"
        >
          <Icon name="refresh" className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <p className="mb-4 text-[12.5px] text-dim">{ajuda}</p>

      {/* Barra de ação do lote: só na fila, e só quando há algo selecionado. */}
      {naFila && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setConfirmandoLote(true)}
            disabled={selecao.size === 0 || busy !== null}
            className="px-4 py-2.5"
          >
            <Icon name="check" className="h-4 w-4" />
            {busy === "lote"
              ? "Disparando…"
              : `Disparar assinatura (${selecao.size} selecionado${selecao.size === 1 ? "" : "s"})`}
          </Button>
          {bloqueadas > 0 && (
            <span className="text-[12.5px] text-warn">
              {bloqueadas} com pendência, não selecionável até resolver.
            </span>
          )}
        </div>
      )}

      {flash && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-ok">
          {flash}
        </p>
      )}

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* A largura mínima subiu junto com a coluna nova: sem isso a tabela espremeria as
              colunas de texto em vez de rolar na horizontal (§A.20). */}
          <table className="ds-table min-w-[1240px]">
            <thead>
              <tr>
                {naFila && (
                  <th className="w-[4%]">
                    <input
                      type="checkbox"
                      checked={todasMarcadas}
                      onChange={alternarTodas}
                      disabled={selecionaveis.length === 0}
                      aria-label="Selecionar todas as admissões aptas"
                    />
                  </th>
                )}
                {/* Larguras REBALANCEADAS com a entrada da Data adm.: as duas composições continuam
                    fechando 100%, sem espremer coluna nenhuma (§A.20). */}
                <ColunaOrdenavel
                  as="th"
                  ord={ord}
                  chave="candidato"
                  className={naFila ? "w-[18%]" : "w-[19%]"}
                >
                  Candidato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className={naFila ? "w-[12%]" : "w-[14%]"}>
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cargo" className={naFila ? "w-[11%]" : "w-[12%]"}>
                  Cargo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="contrato" className={naFila ? "w-[9%]" : "w-[10%]"}>
                  Contrato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="dataAdmissao" className="w-[9%]">
                  Data adm.
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="situacao" className={naFila ? "w-[21%]" : "w-[11%]"}>
                  {naFila ? "Situação" : "Assinatura"}
                </ColunaOrdenavel>
                {!naFila && (
                  <ColunaOrdenavel as="th" ord={ord} chave="prazo" className="w-[9%]">
                    Prazo
                  </ColunaOrdenavel>
                )}
                <th className="w-[16%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colunas} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={colunas} className="py-8 text-center text-faint">
                    {naFila
                      ? "Nenhum kit aguardando disparo. Envie pelo Gerador de Kit, botão Enviar para assinatura."
                      : aba === "assinados"
                        ? "Nenhum contrato assinado pela Clicksign ainda."
                        : "Nenhum envelope em aberto."}
                  </td>
                </tr>
              ) : (
                visiveis.map((l) => {
                  const pill = clicksignPill(l.clicksignStatus);
                  const dias = diasRestantes(l.enviadoEm);
                  const rodando = busy === l.admissaoId;
                  const marcada = selecao.has(l.admissaoId);
                  return (
                    <Fragment key={l.admissaoId}>
                    <tr className={cn(l.bloqueio && "opacity-80", l.temEnvelope && "border-b-0")}>
                      {naFila && (
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={marcada}
                            disabled={Boolean(l.bloqueio)}
                            onChange={() => alternar(l.admissaoId)}
                            aria-label={`Selecionar ${l.candidato}`}
                          />
                        </td>
                      )}
                      <td className="font-semibold">{caixaAlta(l.candidato)}</td>
                      <td className="text-dim">{l.cliente ?? "não informado"}</td>
                      <td className="text-dim">{l.cargo ?? "não informado"}</td>
                      <td className="text-dim">{l.tipoContrato ?? "não informado"}</td>
                      <td className="text-dim tabular-nums">
                        {formatarDataAdmissao(l.dataAdmissao)}
                      </td>

                      {naFila ? (
                        <td className="text-[12.5px]">
                          {l.bloqueio ? (
                            <span className="flex items-start gap-1.5 text-danger">
                              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 flex-none" />
                              <span>{l.bloqueio}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-ok">
                              <Icon name="check" className="h-3.5 w-3.5 flex-none" />
                              Apta, kit anexado em {formatarData(l.kitAnexadoEm)}
                            </span>
                          )}
                        </td>
                      ) : (
                        <>
                          <td className="text-center">
                            <Pill tone={pill.tone}>{pill.label}</Pill>
                          </td>
                          <td className="text-center text-[12.5px] text-dim">
                            {l.clicksignStatus === "AGUARDANDO_ASSINATURA" && dias !== null ? (
                              <span className={dias <= 5 ? "font-semibold text-danger" : undefined}>
                                {dias > 0 ? `${dias} dia(s)` : "vencido"}
                              </span>
                            ) : l.clicksignStatus === "ASSINADO" ? (
                              formatarData(l.enviadoEm)
                            ) : (
                              "não informado"
                            )}
                          </td>
                        </>
                      )}

                      <td>
                        {/* Coluna AÇÕES no padrão da Esteira: botões-ícone de 32px, tooltip no
                            `title`. Cabem os quatro do pior caso sem apertar a linha. */}
                        <div className="flex items-center justify-center gap-0.5">
                          {/* OLHO: abre o kit anexado. Some quando ASSINADO, porque a partir daí o
                              documento vive no prontuário do Drive. */}
                          {l.temKit && (
                            <AcaoIcone
                              icone="eye"
                              titulo="Visualizar o kit anexado"
                              onClick={() => void verKit(l)}
                            />
                          )}

                          {/* Envio individual: dispara UM, sem marcar checkbox. */}
                          {naFila && !l.bloqueio && (
                            <AcaoIcone
                              icone="arr"
                              titulo={rodando ? "Enviando" : "Disparar a assinatura só deste candidato"}
                              disabled={rodando || busy !== null}
                              onClick={() => void dispararUm(l)}
                            />
                          )}

                          {(l.temKit || l.temEnvelope) && l.fase !== "ENCERRADO" && (
                            <AcaoIcone
                              icone="layers"
                              titulo="Trocar kit: cancela o atual e desanexa"
                              disabled={rodando}
                              onClick={() => setAlvoTroca(l)}
                            />
                          )}

                          {(temEnvelopeReenviavel(l.clicksignStatus) ||
                            l.clicksignStatus === "EXPIRADO") && (
                            <AcaoIcone
                              icone="refresh"
                              titulo="Reenviar por correção com o PDF corrigido"
                              disabled={rodando}
                              onClick={() => setAlvoReenvio(l)}
                            />
                          )}

                          {/* CANCELAR vale inclusive no JÁ ASSINADO: o funcionário precisa ser
                              notificado de que o documento foi cancelado (regra do diretor). */}
                          {(l.fase === "ENVIADO" ||
                            l.fase === "ASSINADO" ||
                            l.fase === "NAO_ENVIADO") && (
                            <AcaoIcone
                              icone="x"
                              titulo="Cancelar o documento no EA e na Clicksign"
                              disabled={rodando}
                              perigo
                              onClick={() => setAlvoCancelar(l)}
                            />
                          )}

                          {l.contratoAssinadoDriveUrl && (
                            <a
                              href={l.contratoAssinadoDriveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)]"
                              title="Abrir contrato assinado no Google Drive"
                              aria-label="Abrir contrato assinado no Google Drive"
                            >
                              <GoogleDriveLogo className="h-[17px] w-[17px]" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* QUEM ASSINOU E QUEM ESTÁ DEVENDO. Sub-linha, e não uma coluna nova, porque a
                        lista tem tamanho variável (dois assinantes no caso comum, mais quando o
                        cliente exige testemunha) e espremer isso numa célula quebraria a máscara
                        única de tabela (§A.12/§A.20). Só aparece em quem TEM envelope: sem envelope
                        não existe assinante nenhum a listar. */}
                    {l.temEnvelope && (
                      <tr>
                        <td colSpan={colunas} className="pt-0 pb-3 pl-4 align-top">
                          <Assinantes
                            dados={assinantes[l.admissaoId]}
                            atualizando={atualizando === l.admissaoId}
                            onAtualizar={() => void atualizarLinha(l)}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Confirmação do lote: o disparo manda e-mail, então pede confirmação explícita. */}
      <ConfirmDialog
        open={confirmandoLote}
        title={`Disparar ${selecao.size} assinatura${selecao.size === 1 ? "" : "s"}?`}
        message={
          "O envelope é criado na Clicksign e o convite de assinatura vai por e-mail para cada " +
          "candidato. A empresa só é notificada depois que o funcionário assinar."
        }
        confirmLabel="Disparar agora"
        cancelLabel="Voltar"
        busy={busy === "lote"}
        onConfirm={() => void dispararLote()}
        onCancel={() => setConfirmandoLote(false)}
      />

      {/* Resultado por candidato: parcialidade explícita, no padrão da liberação em massa. */}
      {resultadoLote && (
        <Modal
          onClose={() => setResultadoLote(null)}
          className="max-w-lg"
          ariaLabel="Resultado Do Disparo"
        >
          <h3>Resultado do disparo</h3>
          <p className="psub mt-1">
            {resultadoLote.filter((i) => i.ok).length} de {resultadoLote.length} enfileirado(s).
          </p>
          <div className="mt-4 max-h-80 space-y-1.5 overflow-auto">
            {resultadoLote.map((i) => (
              <div
                key={i.admissaoId}
                className="flex items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]"
              >
                <Icon
                  name={i.ok ? "check" : "alert"}
                  className={cn("mt-0.5 h-3.5 w-3.5 flex-none", i.ok ? "text-ok" : "text-danger")}
                />
                <div className="min-w-0">
                  <b>{caixaAlta(i.candidato)}</b>
                  {!i.ok && <div className="text-dim">{i.motivo}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setResultadoLote(null)} className="px-4 py-2.5">
              Fechar
            </Button>
          </div>
        </Modal>
      )}

      {/* Reenvio por correção: único fluxo que ainda sobe arquivo, porque exige o PDF corrigido. */}
      {alvoReenvio && (
        <Modal onClose={fecharReenvio} className="max-w-lg" ariaLabel="Reenviar Por Correção">
          <h3>Reenviar por correção</h3>
          <p className="psub mt-1">
            {caixaAlta(alvoReenvio.candidato)}
            {alvoReenvio.cliente ? `, ${alvoReenvio.cliente}` : ""}
          </p>
          <p className="mt-3 text-[12.5px] text-dim">
            O envelope atual é cancelado e um novo é disparado a partir do PDF-mãe corrigido.
          </p>

          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="ds-input mt-4 w-full py-2"
            aria-label="PDF-mãe corrigido"
          />

          {termo && (
            <label className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.08)] p-3 text-[12.5px]">
              <input
                type="checkbox"
                checked={aceite}
                onChange={(e) => setAceite(e.target.checked)}
                className="mt-0.5"
              />
              <span>{termo}</span>
            </label>
          )}

          {error && (
            <p className="mt-3 text-[12.5px] text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={fecharReenvio} className="px-4 py-2.5">
              Cancelar
            </Button>
            <Button
              onClick={() => void reenviar()}
              disabled={!arquivo || Boolean(busy) || (Boolean(termo) && !aceite)}
              className="px-4 py-2.5"
            >
              {busy ? "Enviando…" : "Reenviar"}
            </Button>
          </div>
        </Modal>
      )}

      {/* O AVISO MUDA CONFORME A FASE detectada pelo backend: o consultor não precisa saber em que
          estado o envelope está para entender a consequência. */}
      <ConfirmDialog
        open={Boolean(alvoCancelar)}
        tone="danger"
        title="Cancelar O Documento?"
        message={alvoCancelar ? avisoDaFase(alvoCancelar.fase, "cancelar") : ""}
        confirmLabel="Cancelar documento"
        cancelLabel="Voltar"
        busy={Boolean(busy)}
        onConfirm={() => void cancelar()}
        onCancel={() => setAlvoCancelar(null)}
      />

      <ConfirmDialog
        open={Boolean(alvoTroca)}
        tone="danger"
        title="Trocar O Kit?"
        message={alvoTroca ? avisoDaFase(alvoTroca.fase, "trocar") : ""}
        confirmLabel="Trocar kit"
        cancelLabel="Voltar"
        busy={Boolean(busy)}
        onConfirm={() => void trocarKit()}
        onCancel={() => setAlvoTroca(null)}
      />
    </>
  );
}
