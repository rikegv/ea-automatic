"use client";

/**
 * CENTRAL DE SOLICITAÇÕES (usuário). A porta por onde qualquer pessoa do time pede uma funcionalidade
 * nova ou registra um bug, com print obrigatório, e acompanha a conversa com a gestão.
 *
 * O print é OBRIGATÓRIO (decisão do diretor): sem imagem, o Salvar fica travado. A descrição tem piso
 * de 50 caracteres (SOLICITACAO_DESCRICAO_MIN), com contador vivo. O fluxo de abrir é um modal só,
 * aberto pelos dois cards do topo, que apenas pré-selecionam o tipo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SOLICITACAO_MENUS_CATALOGO,
  SOLICITACAO_DESCRICAO_MIN,
  SOLICITACAO_TIPO_LABEL,
  SOLICITACAO_STATUS_LABEL,
  SOLICITACAO_STATUS_TERMINAIS,
  type SolicitacaoTipo,
  type SolicitacaoStatus,
  type SolicitacaoResumoApi,
  type SolicitacaoDetalheApi,
} from "@ea/shared-types";
import { apiOpenInline, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  criarSolicitacao,
  listarMinhasSolicitacoes,
  obterMinhaSolicitacao,
  responderSolicitacao,
} from "@/lib/central-solicitacoes";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";
import { BlocoCarregando } from "@/components/ui/Spinner";

/** Tom da pill de cada status: distinto por estado, para o olho ler a fila sem decorar cor. */
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

/** Tom da tag de tipo: funcionalidade é azul (informativo), bug é vermelho (ocorrência). */
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

/** Caminho inline para o `apiOpenInline` (prefixo /api é adicionado por ele). */
function caminhoInline(url: string): string {
  return url.startsWith("/api/") ? url.slice(4) : url;
}

export default function CentralSolicitacoesPage() {
  const { token } = useAuth();
  const [minhas, setMinhas] = useState<SolicitacaoResumoApi[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Fluxo de abrir: um modal só, com o tipo pré-selecionado pelos cards.
  const [fluxoAberto, setFluxoAberto] = useState(false);
  const [tipo, setTipo] = useState<SolicitacaoTipo>("FUNCIONALIDADE");

  // Detalhe de uma solicitação (leitura + conversa).
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      const lista = await listarMinhasSolicitacoes(token);
      setMinhas(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar suas solicitações.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirFluxo(t: SolicitacaoTipo) {
    setTipo(t);
    setFluxoAberto(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        eyebrow="Central De Solicitações"
        title="Solicitações E Melhorias"
        subtitle="Peça uma funcionalidade nova ou registre um bug, com um print da tela, e acompanhe a resposta da gestão."
      />

      {/* OS DOIS CARDS PREMIUM: abrem o MESMO fluxo, só mudando o tipo. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <GlassCard
          as="button"
          onClick={() => abrirFluxo("FUNCIONALIDADE")}
          className="qcard block w-full text-left"
        >
          <div className="q-ico">
            <Icon name="bulb" />
          </div>
          <span className="arr">
            <Icon name="arr" width={18} height={18} />
          </span>
          <h3>Solicitar Nova Funcionalidade</h3>
          <p>Descreva a melhoria que ajudaria o seu dia a dia e anexe um print da tela.</p>
        </GlassCard>

        <GlassCard
          as="button"
          onClick={() => abrirFluxo("BUG")}
          className="qcard block w-full text-left"
        >
          <div className="q-ico">
            <Icon name="alert" />
          </div>
          <span className="arr">
            <Icon name="arr" width={18} height={18} />
          </span>
          <h3>Registrar Um Bug</h3>
          <p>Conte o que deu errado e em qual tela, com um print que mostre o problema.</p>
        </GlassCard>
      </div>

      {erro && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}
      {okMsg && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(45,138,86,0.1)] px-3 py-2 text-sm text-ok">
          {okMsg}
        </p>
      )}

      {/* MINHAS SOLICITAÇÕES: lista de cards (a máscara de tabela é da gestão; aqui cabe o cartão). */}
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[17px] font-bold text-text">Minhas Solicitações</h2>
        <span className="text-sm text-faint">
          {minhas.length} {minhas.length === 1 ? "solicitação" : "solicitações"}
        </span>
      </div>

      {carregando ? (
        <BlocoCarregando titulo="Carregando suas solicitações" />
      ) : minhas.length === 0 ? (
        <GlassCard className="panel">
          <p className="text-dim">
            Você ainda não abriu nenhuma solicitação. Use um dos cards acima para começar.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {minhas.map((s) => (
            <GlassCard
              key={s.id}
              as="button"
              onClick={() => setDetalheId(s.id)}
              className="panel block w-full text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={tomDoTipo(s.tipo)}>{SOLICITACAO_TIPO_LABEL[s.tipo]}</Pill>
                  <StatusPill tone={tomDoStatus(s.status)} label={SOLICITACAO_STATUS_LABEL[s.status]} />
                </div>
                <Icon name="arr" className="h-4 w-4 flex-none text-faint" />
              </div>
              <div className="mt-3 text-[14px] font-semibold text-text">
                {s.menuRotulo}
                <span className="text-faint"> : {s.submenu}</span>
              </div>
              <p className="mt-2 text-[12px] text-dim tabular-nums">
                Aberta em {fmtDataHora(s.criadoEm)}
              </p>
            </GlassCard>
          ))}
        </div>
      )}

      {fluxoAberto && (
        <FluxoSolicitacaoModal
          tipoInicial={tipo}
          onFechar={() => setFluxoAberto(false)}
          onCriada={() => {
            setFluxoAberto(false);
            setOkMsg("Solicitação enviada. A gestão vai responder por aqui mesmo.");
            void carregar();
          }}
        />
      )}

      {detalheId && (
        <DetalheSolicitacaoModal
          id={detalheId}
          onFechar={() => setDetalheId(null)}
          onRespondida={() => void carregar()}
        />
      )}
    </div>
  );
}

// ── MODAL DE ABERTURA (preenchimento) ─────────────────────────────────────────

function FluxoSolicitacaoModal({
  tipoInicial,
  onFechar,
  onCriada,
}: {
  tipoInicial: SolicitacaoTipo;
  onFechar: () => void;
  onCriada: () => void;
}) {
  const { token } = useAuth();
  const [tipo, setTipo] = useState<SolicitacaoTipo>(tipoInicial);
  const [menuCodigo, setMenuCodigo] = useState("");
  const [submenu, setSubmenu] = useState("");
  const [descricao, setDescricao] = useState("");
  const [imagem, setImagem] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Preview da imagem: object URL revogado quando troca ou ao desmontar.
  useEffect(() => {
    if (!imagem) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imagem);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imagem]);

  const submenus = useMemo(
    () => SOLICITACAO_MENUS_CATALOGO.find((m) => m.codigo === menuCodigo)?.submenus ?? [],
    [menuCodigo],
  );

  const descricaoLimpa = descricao.trim();
  const curto = descricaoLimpa.length < SOLICITACAO_DESCRICAO_MIN;
  const podeSalvar = Boolean(menuCodigo && submenu && !curto && imagem);

  async function salvar() {
    if (!podeSalvar || !imagem) return;
    setSalvando(true);
    setErro(null);
    try {
      await criarSolicitacao(
        { tipo, menuCodigo, submenu, descricao: descricaoLimpa, imagem },
        token,
      );
      onCriada();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao enviar a solicitação.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onFechar} ariaLabel="Nova solicitação" className="max-w-2xl">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="eyebrow !mb-1">Central De Solicitações</div>
        <h2 className="text-base font-semibold text-text">
          {tipo === "BUG" ? "Registrar Um Bug" : "Solicitar Nova Funcionalidade"}
        </h2>
      </div>

      <div className="space-y-4 px-5 py-5">
        {/* Tipo: o card já escolheu, mas dá para trocar sem fechar o modal. */}
        <div>
          <span className="mb-1 block text-xs font-medium text-faint">Tipo da solicitação</span>
          <Select
            value={tipo}
            onChange={(v) => setTipo(v as SolicitacaoTipo)}
            options={[
              { value: "FUNCIONALIDADE", label: SOLICITACAO_TIPO_LABEL.FUNCIONALIDADE },
              { value: "BUG", label: SOLICITACAO_TIPO_LABEL.BUG },
            ]}
            ariaLabel="Tipo da solicitação"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-medium text-faint">Tela</span>
            <Select
              value={menuCodigo}
              onChange={(v) => {
                setMenuCodigo(v);
                setSubmenu(""); // troca de tela zera a seção escolhida
              }}
              options={SOLICITACAO_MENUS_CATALOGO.map((m) => ({
                value: m.codigo,
                label: m.rotulo,
              }))}
              placeholder="Selecionar tela…"
              ariaLabel="Tela do sistema"
              searchable
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-faint">Seção</span>
            <Select
              value={submenu}
              onChange={setSubmenu}
              options={submenus.map((s) => ({ value: s, label: s }))}
              placeholder={menuCodigo ? "Selecionar seção…" : "Escolha a tela primeiro"}
              ariaLabel="Seção da tela"
              disabled={!menuCodigo}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-faint">Descrição</span>
            <span className={"text-[11px] " + (curto ? "text-warn" : "text-faint")}>
              {descricaoLimpa.length}/{SOLICITACAO_DESCRICAO_MIN}
              {curto ? " caracteres, faltam detalhes" : ""}
            </span>
          </div>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={5}
            className="ds-input w-full resize-y"
            placeholder={
              tipo === "BUG"
                ? "O que você esperava, o que aconteceu e em que passo. Quanto mais detalhe, mais rápido a gestão resolve."
                : "O que você gostaria de poder fazer e por quê. Quanto mais detalhe, melhor a análise."
            }
            aria-label="Descrição da solicitação"
          />
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-faint">Print da tela</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-secondary inline-flex cursor-pointer items-center gap-2 px-4 py-3 text-sm">
              <Icon name="download" className="h-4 w-4 rotate-180" />
              {imagem ? "Trocar imagem" : "Anexar imagem"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setImagem(e.target.files?.[0] ?? null)}
                aria-label="Anexar print da tela"
              />
            </label>
            {imagem && <span className="min-w-0 truncate text-[12px] text-dim">{imagem.name}</span>}
          </div>
          {previewUrl && (
            // Preview local de um object URL (não é um asset remoto): next/image não se aplica aqui.
            <img
              src={previewUrl}
              alt="Pré-visualização do print"
              className="mt-3 max-h-48 rounded-xl border border-[var(--border)] object-contain"
            />
          )}
          <p className="mt-2 text-[11.5px] text-faint">
            O print é obrigatório: ele mostra à gestão exatamente onde está o que você descreveu.
          </p>
        </div>

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando || !podeSalvar}>
            {salvando ? "Enviando…" : "Salvar Solicitação"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── MODAL DE DETALHE (leitura + conversa) ─────────────────────────────────────

function DetalheSolicitacaoModal({
  id,
  onFechar,
  onRespondida,
}: {
  id: string;
  onFechar: () => void;
  onRespondida: () => void;
}) {
  const { token } = useAuth();
  const [detalhe, setDetalhe] = useState<SolicitacaoDetalheApi | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      const d = await obterMinhaSolicitacao(id, token);
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
    // Mesma gestão do visor do Drive: abre a aba no clique (antes do await) para não ser bloqueada.
    const janela = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    if (janela) janela.opener = null;
    try {
      await apiOpenInline(caminhoInline(url), token, janela);
    } catch (e) {
      if (janela && !janela.closed) janela.close();
      setErro(e instanceof ApiError ? e.message : "Falha ao abrir o print.");
    }
  }

  async function enviar() {
    const corpo = resposta.trim();
    if (!corpo) return;
    setEnviando(true);
    setErro(null);
    try {
      const d = await responderSolicitacao(id, corpo, token);
      setDetalhe(d);
      setResposta("");
      onRespondida();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao enviar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  const terminal = detalhe ? SOLICITACAO_STATUS_TERMINAIS.includes(detalhe.status) : false;

  return (
    <Modal onClose={onFechar} ariaLabel="Detalhe da solicitação" className="max-w-2xl">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="eyebrow !mb-1">Central De Solicitações</div>
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
              <span className="mb-1 block text-xs font-medium text-faint">Descrição</span>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-text">
                {detalhe.descricao}
              </p>
              <p className="mt-2 text-[11.5px] text-faint tabular-nums">
                Aberta em {fmtDataHora(detalhe.criadoEm)}
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
                  Ainda não há mensagens. Use o campo abaixo para falar com a gestão.
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

            {erro && <p className="text-sm text-danger">{erro}</p>}

            {/* Caixa de resposta: some quando a solicitação está encerrada (nada a responder). */}
            {!terminal && (
              <div>
                <span className="mb-1 block text-xs font-medium text-faint">Responder</span>
                <textarea
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  rows={3}
                  className="ds-input w-full resize-y"
                  placeholder="Escreva uma mensagem para a gestão"
                  aria-label="Responder à gestão"
                />
                <div className="mt-2 flex justify-end">
                  <Button onClick={() => void enviar()} disabled={enviando || !resposta.trim()}>
                    {enviando ? "Enviando…" : "Enviar"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <Button variant="secondary" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
