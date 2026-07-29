"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

/** Uma linha da tela. Espelha `LinhaAssinatura` do backend (§A.6: sem CPF, sem id de envelope). */
interface Linha {
  admissaoId: string;
  candidato: string;
  cliente: string | null;
  cargo: string | null;
  tipoContrato: string | null;
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
}

type FaseEnvelope = "NAO_ENVIADO" | "ENVIADO" | "ASSINADO" | "ENCERRADO";

/**
 * Aviso por FASE, espelhando `domain/assinante-empresa.avisoDaFase` do backend. O texto muda porque a
 * consequência muda: sem envelope não há quem notificar; em andamento o funcionário é avisado; já
 * assinado, desfaz-se um documento válido.
 */
function avisoDaFase(fase: FaseEnvelope, acao: "cancelar" | "trocar"): string {
  const fim = acao === "trocar" ? " Depois disso, envie o kit novo pelo Gerador de Kit." : "";
  if (fase === "NAO_ENVIADO")
    return (
      "Esta ação vai cancelar o envelope atual, que ainda NÃO foi enviado. Ninguém é notificado." + fim
    );
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

/** Resultado por candidato do disparo em lote (parcialidade: um falhar não derruba os outros). */
interface ItemLote {
  admissaoId: string;
  candidato: string;
  ok: boolean;
  motivo?: string;
}

type Aba = "aptos" | "abertos" | "assinados";

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
    ajuda: "Envelopes que ainda pedem trabalho: aguardando assinatura, cancelados ou expirados.",
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

  const carregar = useCallback(
    async (qual: Aba) => {
      if (!token) return;
      setLoading(true);
      setError(null);
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

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) =>
      [i.candidato, i.cliente, i.cargo, i.tipoContrato]
        .filter(Boolean)
        .some((c) => String(c).toLowerCase().includes(q)),
    );
  }, [itens, busca]);

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
        `Documento de ${caixaAlta(alvoCancelar.candidato)} cancelado no EA` +
          (r.clicksign === "cancelado"
            ? " e na Clicksign."
            : r.clicksign === "best-effort"
              ? ". A Clicksign não aceitou o cancelamento programático nesta conta; o estado que vale é o do EA."
              : " (não havia envelope na Clicksign)."),
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
  const colunas = naFila ? 7 : 7;

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
          <table className="ds-table min-w-[1120px]">
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
                <th className={naFila ? "w-[19%]" : "w-[21%]"}>Candidato</th>
                <th className={naFila ? "w-[13%]" : "w-[15%]"}>Cliente</th>
                <th className={naFila ? "w-[12%]" : "w-[13%]"}>Cargo</th>
                <th className={naFila ? "w-[10%]" : "w-[11%]"}>Contrato</th>
                <th className={naFila ? "w-[24%]" : "w-[12%]"}>
                  {naFila ? "Situação" : "Assinatura"}
                </th>
                {!naFila && <th className="w-[10%]">Prazo</th>}
                <th className="w-[18%]">Ações</th>
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
                    <tr key={l.admissaoId} className={cn(l.bloqueio && "opacity-80")}>
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
