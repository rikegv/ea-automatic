"use client";

/**
 * GESTÃO DE SOLICITAÇÕES (Central De Solicitações, camada /admin). SUPER_ADMIN atende e acompanha o
 * que o time abriu: filtra por tipo e status (múltiplos, §A.28), busca por solicitante/menu/descrição,
 * ordena por qualquer coluna (§A.29) e, no modal, lê o print, conversa e aplica a ação de gestão.
 *
 * A autorização real é do backend (@Roles) e do guard de rota; o guard de conteúdo aqui só evita o
 * flash de tela para quem não tem o menu.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  SOLICITACAO_TIPO,
  SOLICITACAO_TIPO_LABEL,
  SOLICITACAO_STATUS,
  SOLICITACAO_STATUS_LABEL,
  SOLICITACAO_STATUS_TERMINAIS,
  type SolicitacaoTipo,
  type SolicitacaoStatus,
  type SolicitacaoResumoApi,
  type SolicitacaoDetalheApi,
  type SolicitacaoAcaoGestao,
} from "@ea/shared-types";
import { apiOpenInline, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  listarSolicitacoesGestao,
  obterSolicitacaoGestao,
  aplicarAcaoGestao,
  type SolicitacaoLinhaGestao,
} from "@/lib/central-solicitacoes";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";
import { BlocoCarregando } from "@/components/ui/Spinner";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

function tomDoStatus(status: SolicitacaoStatus): PillTone {
  switch (status) {
    case "NOVO":
      return "nt";
    case "EM_DUVIDA":
      return "wn";
    case "APROVADO":
      return "in";
    case "REPROVADO":
      return "dg";
    case "EM_ANDAMENTO":
      return "or";
    case "CONCLUIDO":
      return "ok";
  }
}
function tomDoTipo(tipo: SolicitacaoTipo): PillTone {
  return tipo === "BUG" ? "dg" : "in";
}

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Tempo parado legível: "Resolvida" no terminal, "Hoje" no dia da abertura, senão "N dias". */
function tempoParado(s: Pick<SolicitacaoResumoApi, "status" | "diasParado">): string {
  if (SOLICITACAO_STATUS_TERMINAIS.includes(s.status)) return "Resolvida";
  if (s.diasParado <= 0) return "Hoje";
  return `${s.diasParado} ${s.diasParado === 1 ? "dia" : "dias"}`;
}

function caminhoInline(url: string): string {
  return url.startsWith("/api/") ? url.slice(4) : url;
}

/**
 * COLUNAS da máscara única (§A.12/§A.20): proporcionais, com a Descrição levando o maior peso (é o
 * texto mais longo, truncado na célula e inteiro no modal). A coluna de status recebe folga para o
 * pill mais longo ("Em Andamento").
 */
const COLS =
  "minmax(0,0.9fr) minmax(0,1.4fr) minmax(0,2fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,0.8fr) minmax(0,1.1fr)";

export default function GestaoSolicitacoesPage() {
  const { token, temMenu, isSuperAdmin } = useAuth();
  const podeVer = isSuperAdmin || temMenu("solicitacoes-gestao");

  const [linhas, setLinhas] = useState<SolicitacaoLinhaGestao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [tipos, setTipos] = useState<SolicitacaoTipo[]>([]);
  const [status, setStatus] = useState<SolicitacaoStatus[]>([]);
  const [busca, setBusca] = useState("");

  const [detalheId, setDetalheId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token || !podeVer) return;
    setCarregando(true);
    try {
      const lista = await listarSolicitacoesGestao({ tipos, status, busca }, token);
      setLinhas(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar as solicitações.");
    } finally {
      setCarregando(false);
    }
  }, [token, podeVer, tipos, status, busca]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const colunasOrd = useMemo<ColOrd<SolicitacaoLinhaGestao>[]>(
    () => [
      { chave: "tipo", tipo: "texto", valor: (l) => SOLICITACAO_TIPO_LABEL[l.tipo] },
      { chave: "menu", tipo: "texto", valor: (l) => `${l.menuRotulo} ${l.submenu}` },
      { chave: "descricao", tipo: "texto", valor: (l) => l.descricao },
      { chave: "solicitante", tipo: "texto", valor: (l) => l.solicitanteNome },
      { chave: "data", tipo: "data", valor: (l) => l.criadoEm },
      { chave: "parado", tipo: "numero", valor: (l) => l.diasParado },
      { chave: "status", tipo: "texto", valor: (l) => SOLICITACAO_STATUS_LABEL[l.status] },
    ],
    [],
  );
  const ord = useOrdenacao(colunasOrd, linhas);

  if (!podeVer) {
    return (
      <>
        <PageHead eyebrow="Administração" title="Acesso Restrito" />
        <GlassCard className="panel">
          <p className="text-dim">
            Você não tem o menu de gestão de solicitações liberado.{" "}
            <Link href="/" className="text-accent underline">
              Voltar ao início
            </Link>
            .
          </p>
        </GlassCard>
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        eyebrow="Administração"
        title="Gestão De Solicitações"
        subtitle="Atenda e acompanhe as solicitações de funcionalidade e os bugs abertos pelo time."
      />

      {/* FILTROS (§A.28 múltiplos, §A.35 design system) + busca. Governam a consulta. */}
      <GlassCard className="mb-3 grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_1.6fr]">
        <div>
          <span className="mb-1 block text-xs font-medium text-faint">Tipo</span>
          <MultiSelect
            values={tipos}
            onChange={(v) => setTipos(v as SolicitacaoTipo[])}
            options={SOLICITACAO_TIPO.map((t) => ({ value: t, label: SOLICITACAO_TIPO_LABEL[t] }))}
            placeholder="Todos os tipos"
            ariaLabel="Filtrar por tipo"
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-faint">Status</span>
          <MultiSelect
            values={status}
            onChange={(v) => setStatus(v as SolicitacaoStatus[])}
            options={SOLICITACAO_STATUS.map((s) => ({
              value: s,
              label: SOLICITACAO_STATUS_LABEL[s],
            }))}
            placeholder="Todos os status"
            ariaLabel="Filtrar por status"
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-faint">Busca</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Solicitante, tela ou descrição"
            className="ds-input w-full"
            aria-label="Buscar solicitações"
          />
        </div>
      </GlassCard>

      {erro && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <GlassCard className="list flex min-h-0 flex-1 flex-col">
        <div className="ea-scroll min-h-0 flex-1 overflow-auto">
          <div className="min-w-[1000px]">
            <div className="list-head" style={{ gridTemplateColumns: COLS, gap: "10px" }}>
              <ColunaOrdenavel ord={ord} chave="tipo">
                Tipo
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="menu">
                Tela E Seção
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="descricao">
                Descrição
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="solicitante">
                Solicitante
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="data">
                Data Da Solicitação
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="parado">
                Tempo Parado
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="status">
                Status
              </ColunaOrdenavel>
            </div>

            {carregando ? (
              <div className="px-4 py-10">
                <BlocoCarregando titulo="Carregando as solicitações" />
              </div>
            ) : ord.itens.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-faint">
                Nenhuma solicitação com esses filtros.
              </div>
            ) : (
              ord.itens.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setDetalheId(l.id)}
                  className="row w-full text-left"
                  style={{ gridTemplateColumns: COLS, gap: "10px" }}
                >
                  <div className="flex min-w-0 items-center justify-center">
                    <Pill tone={tomDoTipo(l.tipo)}>{SOLICITACAO_TIPO_LABEL[l.tipo]}</Pill>
                  </div>
                  <div
                    className="meta !text-[12px] leading-tight break-words text-center"
                    title={`${l.menuRotulo} : ${l.submenu}`}
                  >
                    {l.menuRotulo}
                    <span className="text-faint"> : {l.submenu}</span>
                  </div>
                  <div className="meta !text-[12px] leading-tight text-left">
                    <span className="line-clamp-2">{l.descricao ?? ""}</span>
                  </div>
                  <div
                    className="meta !text-[12px] leading-tight break-words text-center"
                    title={l.solicitanteNome}
                  >
                    {l.solicitanteNome}
                  </div>
                  <div className="meta !text-[12px] text-center tabular-nums">
                    {fmtDataHora(l.criadoEm)}
                  </div>
                  <div className="meta !text-[12px] text-center tabular-nums">{tempoParado(l)}</div>
                  <div className="flex min-w-0 items-center justify-center">
                    <StatusPill
                      tone={tomDoStatus(l.status)}
                      label={SOLICITACAO_STATUS_LABEL[l.status]}
                      className="!whitespace-normal text-center leading-tight"
                    />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </GlassCard>

      {detalheId && (
        <GestaoDetalheModal
          id={detalheId}
          onFechar={() => setDetalheId(null)}
          onMudou={() => void carregar()}
        />
      )}
    </div>
  );
}

// NOTA: a célula de Descrição lê `l.descricao`, que o resumo pode não trazer; o tipo do resumo não a
// garante. A tela trata ausência como vazio e o texto inteiro aparece no modal, pelo detalhe.

// ── MODAL DE GESTÃO (leitura + conversa + ações) ──────────────────────────────

function GestaoDetalheModal({
  id,
  onFechar,
  onMudou,
}: {
  id: string;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const { token } = useAuth();
  const [detalhe, setDetalhe] = useState<SolicitacaoDetalheApi | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [corpo, setCorpo] = useState("");
  const [aplicando, setAplicando] = useState<SolicitacaoAcaoGestao | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      const d = await obterSolicitacaoGestao(id, token);
      setDetalhe(d);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar a solicitação.");
    } finally {
      setCarregando(false);
    }
  }, [id, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function verPrint() {
    const url = detalhe?.imagemUrl;
    if (!url) return;
    if (/^https?:\/\//.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const janela = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    if (janela) janela.opener = null;
    try {
      await apiOpenInline(caminhoInline(url), token, janela);
    } catch (e) {
      if (janela && !janela.closed) janela.close();
      setErro(e instanceof ApiError ? e.message : "Falha ao abrir o print.");
    }
  }

  async function aplicar(acao: SolicitacaoAcaoGestao) {
    const texto = corpo.trim();
    // "Enviar Dúvida" carrega a pergunta: sem texto, não faz sentido disparar.
    if (acao === "ENVIAR_DUVIDA" && !texto) return;
    setAplicando(acao);
    setErro(null);
    try {
      const d = await aplicarAcaoGestao(id, acao, texto || undefined, token);
      setDetalhe(d);
      setCorpo("");
      onMudou();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao aplicar a ação.");
    } finally {
      setAplicando(null);
    }
  }

  const ocupado = aplicando !== null;

  return (
    <Modal onClose={onFechar} ariaLabel="Gestão da solicitação" className="max-w-2xl">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="eyebrow !mb-1">Gestão De Solicitações</div>
        {detalhe ? (
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={tomDoTipo(detalhe.tipo)}>{SOLICITACAO_TIPO_LABEL[detalhe.tipo]}</Pill>
            <StatusPill
              tone={tomDoStatus(detalhe.status)}
              label={SOLICITACAO_STATUS_LABEL[detalhe.status]}
            />
            <h2 className="text-base font-semibold text-text">
              {detalhe.menuRotulo}
              <span className="text-faint"> : {detalhe.submenu}</span>
            </h2>
          </div>
        ) : (
          <h2 className="text-base font-semibold text-text">Solicitação</h2>
        )}
      </div>

      <div className="space-y-5 px-5 py-5">
        {carregando ? (
          <BlocoCarregando titulo="Carregando a solicitação" />
        ) : !detalhe ? (
          <p className="text-sm text-danger">{erro ?? "Solicitação não encontrada."}</p>
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-faint">
                <span>
                  Solicitante: <span className="text-dim">{detalhe.solicitanteNome}</span>
                </span>
                <span className="tabular-nums">Aberta em {fmtDataHora(detalhe.criadoEm)}</span>
              </div>
              <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-text">
                {detalhe.descricao}
              </p>
            </div>

            {detalhe.imagemUrl && (
              <div>
                <Button variant="secondary" onClick={() => void verPrint()}>
                  <Icon name="eye" className="h-4 w-4" />
                  Ver Print
                </Button>
              </div>
            )}

            {/* CONVERSA */}
            <div>
              <span className="mb-2 block text-xs font-medium text-faint">Conversa</span>
              {detalhe.mensagens.length === 0 ? (
                <p className="text-[13px] text-dim">
                  Ainda não há mensagens. Use o campo abaixo para enviar uma dúvida ao solicitante.
                </p>
              ) : (
                <div className="space-y-3">
                  {detalhe.mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={
                        "rounded-xl border p-3 " +
                        (m.autorEhGestao
                          ? "border-[var(--accent)]/40 bg-[var(--surface-2)]"
                          : "border-[var(--border)] bg-[var(--surface)]")
                      }
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-text">{m.autorNome}</span>
                        {m.autorEhGestao && <Pill tone="in">Gestão</Pill>}
                        <span className="ml-auto text-[11px] text-faint tabular-nums">
                          {fmtDataHora(m.criadoEm)}
                        </span>
                      </div>
                      <p className="whitespace-pre-line text-[13px] leading-relaxed text-dim">
                        {m.corpo}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MENSAGEM + AÇÕES: o texto vira a pergunta da dúvida ou a nota de aprovação/reprovação. */}
            <div>
              <span className="mb-1 block text-xs font-medium text-faint">
                Mensagem para o solicitante
              </span>
              <textarea
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={3}
                className="ds-input w-full resize-y"
                placeholder="Escreva a dúvida, ou uma nota ao aprovar ou reprovar"
                aria-label="Mensagem para o solicitante"
              />
            </div>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void aplicar("APROVAR")}
                disabled={ocupado}
                className="!bg-[rgba(45,138,86,0.18)] !text-ok"
              >
                {aplicando === "APROVAR" ? "Aprovando…" : "Aprovar"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void aplicar("REPROVAR")}
                disabled={ocupado}
                className="!text-danger"
              >
                {aplicando === "REPROVAR" ? "Reprovando…" : "Reprovar"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void aplicar("ENVIAR_DUVIDA")}
                disabled={ocupado || !corpo.trim()}
              >
                {aplicando === "ENVIAR_DUVIDA" ? "Enviando…" : "Enviar dúvida"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void aplicar("EM_ANDAMENTO")}
                disabled={ocupado}
              >
                {aplicando === "EM_ANDAMENTO" ? "Movendo…" : "Em andamento"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void aplicar("CONCLUIR")}
                disabled={ocupado}
              >
                {aplicando === "CONCLUIR" ? "Concluindo…" : "Concluir"}
              </Button>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <Button variant="secondary" onClick={onFechar} disabled={ocupado}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
