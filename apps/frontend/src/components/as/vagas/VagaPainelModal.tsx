"use client";

/**
 * ─ O PAINEL DA VAGA: A VAGA INTEIRA EM UM LUGAR SÓ (etapa 4 da tela unificada de vagas) ────────
 *
 * ┌─ O QUE ELE RESOLVE ─────────────────────────────────────────────────────────────────────────┐
 * │ Ver uma vaga custava três cliques em três lugares: o olho abria a ficha, o funil abria a      │
 * │ lista de candidatos, e "em que pé está o processo" não existia em lugar nenhum. Agora é uma   │
 * │ caixa só: os DADOS da vaga, a TRILHA (em que pé ela está) e QUEM está nela.                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ A ABA "VER CANDIDATOS" PAGINA NO SERVIDOR (07/10/2026) ──────────────────────────────────────
 *
 * ┌─ O QUE MUDOU, e por quê ────────────────────────────────────────────────────────────────────┐
 * │ A aba baixava TODAS as candidaturas de uma vez (`painelDaVaga`, até 2.509 medidas) e janelava │
 * │ o DESENHO no cliente (JANELA_*, setTimeout). Milhares de linhas no mesmo frame congelavam a   │
 * │ aba, e o navegador segurava a vaga inteira só para desenhar oitenta. Agora o servidor devolve │
 * │ SÓ A PÁGINA pedida (`buscarCandidaturasDaVaga`): recorte (busca, situação, etapa) e abas são  │
 * │ FILTRO server-side, as contagens vêm do `resumo` (a ocupação da vaga inteira, não da página), │
 * │ e a seleção em massa opera sobre o CONJUNTO INTEIRO do filtro, nunca sobre as linhas à vista. │
 * │                                                                                               │
 * │ `painelVaga` (o tipo/rota antigo) NÃO FOI TOCADO: ele segue servindo o modal de visualização  │
 * │ simples e a `abrirAcao` da Central de Candidatos (§A.26, outros leitores dependem dele).      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A LISTA SÓ CARREGA QUANDO A ABA É ABERTA, e a preguiça aqui tem permissão como razão: a lista
 * vem de uma rota do menu `as-candidatos`, então um consultor que só tem a Central de Vagas recebe
 * 403. Por isso a leitura mora num SUB-COMPONENTE (`ListaDeCandidaturasDaVaga`) montado só nas abas
 * "candidatos"/"alocados": os hooks de paginação e seleção, que buscam na montagem, só existem
 * quando a aba está aberta. Quem nunca abre a aba nunca dispara a requisição e nunca vê erro.
 *
 * §A.6, E A MINIMIZAÇÃO NÃO AFROUXA: o painel NÃO devolve CPF. A lista mostra nome, etapa, situação
 * e datas do processo; a busca é por NOME e viaja no CORPO do POST. A FICHA (que MOSTRA o CPF) só
 * abre por clique deliberado, uma pessoa por vez.
 *
 * §A.11 (sem travessão, célula vazia é "não informado"), §A.12 (máscara única de tabela), §A.20
 * (nada esmagado, a tabela rola dentro do próprio contêiner), §A.24 (title case em título, aba e
 * tag; botão é ação), §A.29 (ordenação clicável pelas colunas que o servidor sabe ordenar).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CANDIDATURA_SITUACOES,
  CANDIDATURA_SITUACAO_LABEL,
  candidaturaViva,
  finalizaPosicao,
  type AsCandidaturaDaVagaOrdenarPor,
  type AsCandidaturaItem,
  type AsEtapaFunil,
  type AsOcupacaoVaga,
  type CandidaturaSituacao,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { MultiSelect, type MultiOption } from "@/components/ui/MultiSelect";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import type { Ordenacao } from "@/lib/ordenacao";
import {
  buscarCandidaturasDaVaga,
  dataBr,
  dataHoraBr,
  mensagemDoErro,
  type AlvoPorFiltroDaVaga,
  type RecorteDaVaga,
} from "@/lib/as-candidatos";
import type { BuscadorDePagina } from "@/lib/usePaginacaoServidor";
import { usePaginacaoServidor } from "@/lib/usePaginacaoServidor";
import { useSelecaoServidor } from "@/lib/useSelecaoServidor";
import { tomDaSituacao, tomDoStatusVaga } from "@/lib/as-candidatos-visual";
import { etapasOrdenadas, rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { podeMoverStatusDaVaga, rotuloDoStatusVaga, useStatusVaga } from "@/lib/as-status-vaga";
import { trilhaDaVaga } from "@/lib/as-vaga-trilha";
import { fraseDoFechamentoForcado } from "@/lib/as-vaga-fechamento";
import { fraseDaReducaoDeMeta } from "@/lib/as-vaga-meta";
import {
  podeDecidir,
  podeFinalizarPosicao,
  podeMoverNoFunil,
  rotuloCurtoDoLado,
  rotuloDoLado,
  vagaRecebeCandidato,
} from "@/lib/as-vaga-acoes";
import { AlocarCandidatoModal } from "@/components/as/candidatos/AlocarCandidatoModal";
import { NovoCandidatoModal } from "@/components/as/candidatos/NovoCandidatoModal";
import { MoverCandidaturaModal } from "@/components/as/candidatos/MoverCandidaturaModal";
import { FichaCandidatoModal } from "@/components/as/candidatos/FichaCandidatoModal";
import { FinalizarPosicaoModal } from "@/components/as/vagas/FinalizarPosicaoModal";
import { MoverStatusVagaModal } from "@/components/as/vagas/MoverStatusVagaModal";
import { AcoesEmMassaDaVaga } from "@/components/as/vagas/AcoesEmMassaDaVaga";
import { ShortlistsDaVaga } from "@/components/as/vagas/ShortlistsDaVaga";
import { AdicionarCandidatosEmLoteModal } from "@/components/as/vagas/AdicionarCandidatosEmLoteModal";
import { CandidatosDisponiveisDaVaga } from "@/components/as/vagas/CandidatosDisponiveisDaVaga";
import {
  criteriosAtivos,
  recorteAtivo,
  ETAPA_FORA_DO_FUNIL,
  RECORTE_VAZIO,
  type RecorteDoPainel,
} from "@/lib/as-painel-recorte";
import { cn } from "@/lib/cn";

type Aba = "vaga" | "candidatos" | "alocados" | "disponiveis";

/** Tamanho da página server-side da aba Ver Candidatos. */
const PAGINA_TAMANHO = 100;

/**
 * A QUARTA ABA É "CANDIDATOS DISPONÍVEIS": ela olha para FORA da vaga (quem ainda pode entrar),
 * enquanto as três primeiras olham para DENTRO. §A.24: aba é rótulo, então title case.
 */
const ABAS: { id: Aba; rotulo: string; icone: IconName }[] = [
  { id: "vaga", rotulo: "A Vaga", icone: "doc" },
  { id: "candidatos", rotulo: "Ver Candidatos", icone: "users" },
  { id: "alocados", rotulo: "Ver Candidatos Alocados", icone: "check" },
  { id: "disponiveis", rotulo: "Candidatos Disponíveis", icone: "plus" },
];

const ABA_BASE =
  "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition";
const ABA_ATIVA =
  "border-transparent [background:var(--btn-grad)] text-white shadow-[0_10px_22px_-8px_rgba(34,176,219,0.65)]";
const ABA_INATIVA =
  "border-[var(--border)] bg-[var(--surface-2)] text-dim shadow-[var(--glass-shadow)] hover:border-[var(--border-strong)] hover:text-text";

const ACAO_BASE =
  "border-[var(--border)] bg-transparent text-dim hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-text";
const ACAO_PERIGO =
  "border-[var(--border)] bg-transparent text-dim hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-danger";

/**
 * UMA AÇÃO DA VAGA OFERECIDA NA BARRA. Quem decide quais existem é a Central de Vagas, não este
 * componente: o painel recebe a lista pronta e só decide ONDE ela aparece.
 */
export type AcaoDaVaga = {
  id: string;
  rotulo: string;
  icone: IconName;
  descricao: string;
  perigo?: boolean;
  onClick: () => void;
};

/** As contagens das abas, derivadas do `resumo` (a vaga INTEIRA), nunca das linhas carregadas. */
function contagensDasAbas(resumo: AsOcupacaoVaga | null): {
  candidatos: number | null;
  alocados: number | null;
} {
  if (!resumo) return { candidatos: null, alocados: null };
  // A lista completa = quem está em seleção + todos os desfechos. "alocados" = quem ENTREGOU
  // posição (`finalizadas`), a mesma régua que recorta a aba no servidor.
  const desfechos = Object.values(resumo.porDesfecho).reduce((a, b) => a + b, 0);
  return { candidatos: resumo.emSelecao + desfechos, alocados: resumo.finalizadas };
}

export function VagaPainelModal({
  vaga,
  token,
  onClose,
  onMudou,
  abaInicial = "vaga",
  acoes = [],
  acaoAberta = false,
  children,
}: {
  vaga: VagaListItem;
  token: string | null;
  onClose: () => void;
  abaInicial?: Aba;
  /**
   * AVISA A CENTRAL DE VAGAS DE QUE A VAGA MUDOU: o cilindro de posições, a trilha e os cards lem
   * `ocupacao`, que é DERIVADA das candidaturas. Entregar uma posição aqui dentro sem avisar lá fora
   * deixaria o cabeçalho deste painel discordando da tabela atrás dele.
   */
  onMudou: () => void;
  acoes?: AcaoDaVaga[];
  /**
   * "TEM UM MODAL DA CENTRAL DE VAGAS ABERTO POR CIMA DE MIM" (para a tecla Escape fechar só a caixa
   * de cima, §A.41). Os modais do próprio painel ele conhece por estado; os de fora chegam por aqui.
   */
  acaoAberta?: boolean;
  children: ReactNode;
}) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const { status: catalogoStatus } = useStatusVaga(token);
  const { etapas: catalogoEtapas } = useEtapas();

  const [moverStatusAberto, setMoverStatusAberto] = useState(false);
  /** A aba de disponíveis abre os próprios modais; avisa aqui para o Escape não fechar o painel. */
  const [disponiveisComModal, setDisponiveisComModal] = useState(false);
  /** A lista de candidaturas (sub-componente) abre os próprios modais; mesmo motivo do de cima. */
  const [listaComModal, setListaComModal] = useState(false);

  /**
   * AS CONTAGENS DAS ABAS VÊM DO `resumo`, e o sub-componente as entrega por aqui ao carregar a
   * lista. Antes da primeira carga elas são `null` (a aba não mostra número inventado), exatamente
   * como o comportamento anterior, em que a contagem só nascia depois de a lista chegar.
   */
  const [resumoContagem, setResumoContagem] = useState<AsOcupacaoVaga | null>(null);

  const trilha = trilhaDaVaga(vaga);

  useEffect(() => {
    setAba(abaInicial);
  }, [abaInicial]);

  const temModalPorCima =
    acaoAberta || moverStatusAberto || disponiveisComModal || listaComModal;

  /**
   * "HAVIA UM POPOVER DE SELETOR ABERTO QUANDO O ESCAPE DESCEU?" Os `MultiSelect` do recorte fecham
   * o próprio menu no Escape, e o listener deles mora no `document`, igual ao do `ui/Modal`. A
   * resposta é colhida na CAPTURA, antes de o popover sumir (ver o histórico desta guarda).
   */
  const popoverAbertoNoEscape = useRef(false);
  useEffect(() => {
    function aoDescer(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      popoverAbertoNoEscape.current = Boolean(document.querySelector('[role="listbox"]'));
    }
    document.addEventListener("keydown", aoDescer, true);
    return () => document.removeEventListener("keydown", aoDescer, true);
  }, []);

  const titulo = vaga.nomeDivulgacao ?? "Vaga Sem Nome";
  const recebeCandidato = vagaRecebeCandidato(vaga.status, catalogoStatus);
  const precisaDaLista = aba === "candidatos" || aba === "alocados";
  const contagens = contagensDasAbas(resumoContagem);

  return (
    <Modal
      onClose={() => {
        if (temModalPorCima) return;
        if (popoverAbertoNoEscape.current) return;
        onClose();
      }}
      className="max-w-[1280px] p-0"
      ariaLabel="Painel da vaga"
    >
      <div className="flex max-h-[88vh] flex-col">
        {/* ── TOPO FIXO: quem é a vaga e em que pé ela está ───────────────── */}
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-text">{titulo}</h2>
            <StatusPill
              tone={tomDoStatusVaga(vaga.status, catalogoStatus)}
              label={rotuloDoStatusVaga(vaga.status, catalogoStatus)}
            />
            {podeMoverStatusDaVaga(vaga.status, catalogoStatus) && (
              <button
                type="button"
                onClick={() => setMoverStatusAberto(true)}
                title="Mover esta vaga para outro status do catálogo. Não encerra a vaga: fechar e cancelar continuam sendo as únicas portas para isso."
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-2.5 py-[3px] text-[11.5px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
              >
                <Icon name="arr" className="h-[11px] w-[11px]" />
                Mover status
              </button>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-dim">
            Código {vaga.codigo ?? "não informado"}. Aberta em {dataBr(vaga.dataAbertura)} por{" "}
            {vaga.abertoPorNome ?? "não informado"}.
          </p>

          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <LadoTrilha
              titulo="Processo Seletivo"
              rotulo={trilha.processo.rotulo}
              tom={trilha.processo.tom}
              frase={trilha.processo.frase}
            />
            <LadoTrilha
              titulo="Desfecho"
              rotulo={trilha.desfecho.rotulo}
              tom={trilha.desfecho.tom}
              frase={trilha.desfecho.frase}
            />
          </div>

          {vaga.fechamentoForcado && (
            <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
              <span>
                <span className="font-semibold text-text">Fechamento Forçado. </span>
                {fraseDoFechamentoForcado(
                  vaga.fechamentoForcado,
                  dataHoraBr(vaga.fechamentoForcado.quandoIso),
                )}
              </span>
            </p>
          )}

          {vaga.metaReducoes.length > 0 && (
            <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
              <span>
                <span className="font-semibold text-text">Meta Reduzida. </span>
                {vaga.metaReducoes.map((r, i) => (
                  <span key={`${r.quandoIso}-${i}`} className={i === 0 ? undefined : "mt-1 block"}>
                    {fraseDaReducaoDeMeta(r, dataHoraBr(r.quandoIso))}
                  </span>
                ))}
              </span>
            </p>
          )}

          {/* ── AS ABAS E AS AÇÕES, NA MESMA BARRA ─────────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {ABAS.map((a) => {
              // A CONTAGEM DA ABA É A DA VAGA INTEIRA (do `resumo`), e não a da página nem a do
              // recorte: ela responde "quanta gente esta vaga tem".
              const conta =
                a.id === "candidatos"
                  ? contagens.candidatos
                  : a.id === "alocados"
                    ? contagens.alocados
                    : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={cn(ABA_BASE, aba === a.id ? ABA_ATIVA : ABA_INATIVA)}
                  onClick={() => setAba(a.id)}
                  aria-pressed={aba === a.id}
                >
                  <Icon name={a.icone} className="h-3.5 w-3.5 flex-none" />
                  {a.rotulo}
                  {conta !== null && (
                    <span
                      className={cn("tabular-nums", aba === a.id ? "text-white/85" : "text-faint")}
                    >
                      {conta}
                    </span>
                  )}
                </button>
              );
            })}

            {acoes.length > 0 && (
              <span
                aria-hidden="true"
                className="mx-1 h-9 w-px flex-none self-center bg-[var(--border)]"
              />
            )}

            {acoes.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.descricao}
                aria-label={a.descricao}
                onClick={a.onClick}
                className={cn(ABA_BASE, a.perigo ? ACAO_PERIGO : ACAO_BASE)}
              >
                <Icon name={a.icone} className="h-3.5 w-3.5 flex-none" />
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* ── MIOLO ROLANTE ───────────────────────────────────────────────── */}
        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {aba === "vaga" && (
            <>
              {children}
              <ShortlistsDaVaga vagaId={vaga.id} token={token} />
            </>
          )}

          {aba === "disponiveis" && (
            <CandidatosDisponiveisDaVaga
              vaga={vaga}
              token={token}
              recebeCandidato={recebeCandidato}
              onMudou={onMudou}
              onModalAberto={setDisponiveisComModal}
            />
          )}

          {/* A LISTA PAGINADA É UM SUB-COMPONENTE, montado só nas abas que precisam dela e com
              `key={aba}` para nascer limpo a cada troca entre "candidatos" e "alocados": cada aba
              tem o SEU recorte e a SUA seleção, e remontar é o jeito mais honesto de garantir que
              nada de uma vaze para a outra. §A.6: quem só tem a Central de Vagas nunca monta isto,
              então nunca dispara a rota do menu `as-candidatos` nem toma 403. */}
          {precisaDaLista && (
            <ListaDeCandidaturasDaVaga
              key={aba}
              vaga={vaga}
              aba={aba}
              token={token}
              recebeCandidato={recebeCandidato}
              catalogoEtapas={catalogoEtapas}
              onMudou={onMudou}
              onResumo={setResumoContagem}
              onModalAberto={setListaComModal}
            />
          )}
        </div>

        {/* ── RODAPÉ ──────────────────────────────────────────────────────── */}
        <div className="flex flex-none items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      {moverStatusAberto && (
        <MoverStatusVagaModal
          vaga={vaga}
          catalogo={catalogoStatus}
          token={token}
          onClose={() => setMoverStatusAberto(false)}
          onMovido={() => {
            setMoverStatusAberto(false);
            onMudou();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

/**
 * ─ A LISTA PAGINADA DE CANDIDATURAS DA VAGA (abas "candidatos" e "alocados") ───────────────────
 *
 * Ele é quem monta os hooks de paginação e seleção, e por isso vive fora do painel: assim eles só
 * existem (e só buscam) quando a aba está aberta, que é o que preserva a preguiça e a permissão.
 */
function ListaDeCandidaturasDaVaga({
  vaga,
  aba,
  token,
  recebeCandidato,
  catalogoEtapas,
  onMudou,
  onResumo,
  onModalAberto,
}: {
  vaga: VagaListItem;
  aba: "candidatos" | "alocados";
  token: string | null;
  recebeCandidato: boolean;
  catalogoEtapas: AsEtapaFunil[];
  onMudou: () => void;
  onResumo: (resumo: AsOcupacaoVaga | null) => void;
  onModalAberto: (aberto: boolean) => void;
}) {
  /**
   * O FETCHER MAPEIA A PÁGINA DO BACKEND PARA O CONTRATO DO HOOK: `resumo` vira `kpis` (cacheado, só
   * vem no offset 0). O `vaga.id` é a única dependência; o token é injetado pelo hook.
   */
  const buscarPagina = useCallback<
    BuscadorDePagina<AsCandidaturaItem, RecorteDaVaga, AsOcupacaoVaga>
  >(
    (params, tk) =>
      buscarCandidaturasDaVaga(
        vaga.id,
        {
          ...params.filtro,
          ordenarPor: params.ordenarPor as AsCandidaturaDaVagaOrdenarPor | undefined,
          direcao: params.direcao,
          offset: params.offset,
          limite: params.limite,
        },
        tk,
      ).then((p) => ({ itens: p.itens, total: p.total, truncado: p.truncado, kpis: p.resumo })),
    [vaga.id],
  );

  const pag = usePaginacaoServidor<AsCandidaturaItem, RecorteDaVaga, AsOcupacaoVaga>({
    buscarPagina,
    filtroInicial: { aba, busca: "", filtroSituacao: [], filtroEtapa: [] },
    limitePadrao: PAGINA_TAMANHO,
  });

  // O ALVO DAS AÇÕES POR FILTRO: o recorte corrente mais o `vagaId` (a vaga de origem). O hook de
  // seleção o repassa inteiro para as rotas por-filtro quando o modo "todos do filtro" está ligado.
  const alvo: AlvoPorFiltroDaVaga = { vagaId: vaga.id, ...pag.filtro };
  const selecao = useSelecaoServidor<AlvoPorFiltroDaVaga>({ filtro: alvo, total: pag.total });

  // O RESUMO SOBE PARA O PAINEL desenhar as contagens das abas. `kpis` só troca quando o filtro
  // muda; como o resumo é da vaga INTEIRA, o número das abas não oscila com a busca.
  useEffect(() => {
    onResumo(pag.kpis);
  }, [pag.kpis, onResumo]);

  // ── OS MODAIS DESTA LISTA ───────────────────────────────────────────────
  const [alocarAberto, setAlocarAberto] = useState(false);
  const [cadastrarAberto, setCadastrarAberto] = useState(false);
  const [adicionarLoteAberto, setAdicionarLoteAberto] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [moverAlvo, setMoverAlvo] = useState<AsCandidaturaItem | null>(null);
  const [finalizarAlvo, setFinalizarAlvo] = useState<AsCandidaturaItem | null>(null);

  const algumModal =
    alocarAberto ||
    cadastrarAberto ||
    adicionarLoteAberto ||
    fichaId !== null ||
    moverAlvo !== null ||
    finalizarAlvo !== null;
  useEffect(() => {
    onModalAberto(algumModal);
  }, [algumModal, onModalAberto]);

  /**
   * DEPOIS DE QUALQUER AÇÃO QUE ESCREVE: fecha o que estava aberto, limpa a seleção, RELÊ a página
   * (voltando ao começo, como o render em janela já fazia) e avisa a Central de Vagas. `setFiltro`
   * com objeto vazio cria uma referência nova, o que refaz a busca e traz o `resumo` atualizado.
   */
  // FUNÇÃO SIMPLES, recriada a cada render de propósito: ela é passada a modais (não a listas
  // memoizadas), então estabilidade de referência não importa, e assim ela sempre enxerga o `pag` e
  // o `selecao` correntes. `pag.setFiltro({})` cria uma referência nova de filtro, o que refaz a
  // busca (voltando à página 1) e traz o `resumo` atualizado.
  function aposAcao() {
    setAlocarAberto(false);
    setCadastrarAberto(false);
    setAdicionarLoteAberto(false);
    setMoverAlvo(null);
    setFinalizarAlvo(null);
    selecao.limpar();
    pag.setFiltro({});
    onMudou();
  }

  /**
   * ─ DEPOIS DE UMA AÇÃO DO "MOVER CANDIDATURA", SEM FECHAR O MODAL (§A.41) ────────────────────────
   *
   * O fluxo aprovar -> enviar acontece no MESMO modal, que re-aponta para a linha fresca sozinho.
   * Então, ao contrário do `aposAcao`, esta variante NÃO zera `moverAlvo`: ela só relê o fundo (lista
   * e contagem da vaga) para refletir a mudança por trás do modal. Quem fecha o modal é o "Fechar".
   */
  function aposAcaoMover() {
    selecao.limpar();
    pag.setFiltro({});
    onMudou();
  }

  // O RECORTE, VINDO DA BARRA, VIRA FILTRO SERVER-SIDE. Mudar o recorte limpa a seleção: o conjunto
  // mudou, e manter marcas de um recorte anterior seria seleção invisível (a régua do diretor).
  function mudarRecorte(r: RecorteDoPainel) {
    pag.setFiltro({ busca: r.busca, filtroSituacao: r.situacoes, filtroEtapa: r.etapas });
    selecao.limpar();
  }

  // Navegar de página limpa a seleção manual, pela mesma razão: as linhas marcadas saem da vista.
  // O "todos do filtro" continua valendo, porque ele é sobre o conjunto, não sobre a página.
  function irPara(n: number) {
    pag.irParaPagina(n);
    selecao.limpar();
  }

  /** A ordenação server-side, embrulhada no formato que o `ColunaOrdenavel` já conhece (§A.29). */
  const ord: Ordenacao<AsCandidaturaItem> = {
    itens: pag.itens,
    ordem: pag.ordenarPor ? { chave: pag.ordenarPor, dir: pag.direcao ?? "asc" } : null,
    alternar: (chave: string) => {
      pag.setOrdenacao(chave);
      selecao.limpar();
    },
  };

  // As situações ofertadas pelo filtro, recortadas pela régua da aba (alocados só mostra quem
  // entregou posição). Nenhuma lista nova nasce: é o vocabulário compartilhado filtrado.
  const situacoesDoFiltro =
    aba === "alocados" ? CANDIDATURA_SITUACOES.filter(finalizaPosicao) : CANDIDATURA_SITUACOES;
  const incluirForaDoFunil =
    aba === "alocados"
      ? CANDIDATURA_SITUACOES.filter(finalizaPosicao).some((x) => !candidaturaViva(x))
      : true;
  // Etapas ativas do catálogo (as opções vêm do endpoint, §A.37, nunca das linhas carregadas).
  const etapasDoFiltro = etapasOrdenadas(catalogoEtapas).filter((e) => e.ativa);

  const recorteView: RecorteDoPainel = {
    busca: pag.filtro.busca ?? "",
    situacoes: pag.filtro.filtroSituacao ?? [],
    etapas: pag.filtro.filtroEtapa ?? [],
  };

  // Os objetos marcados vêm da página corrente (a seleção manual é limpa ao navegar, então todo id
  // marcado está à vista). O modo "todos do filtro" NÃO usa estes objetos: ele manda o filtro.
  const selecionadasObjs = pag.itens.filter((c) => selecao.selecionados.has(c.id));

  const totalPaginas = pag.totalPaginas;
  const apoioLista =
    aba === "candidatos"
      ? "Quem está nesta vaga. A busca e os filtros recortam no servidor, e a seleção vale para o conjunto inteiro do recorte."
      : "Quem preencheu uma posição desta vaga, contado pela situação da candidatura.";

  return (
    <>
      {pag.erro && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
          role="alert"
        >
          {mensagemDoErro(new Error(pag.erro), "Falha ao carregar os candidatos desta vaga.")}
        </p>
      )}

      {/* OS BOTÕES DE TRAZER GENTE, só na aba da lista completa e só se a vaga recebe candidato. */}
      {aba === "candidatos" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-dim">
            {recebeCandidato
              ? "Traga alguém para esta vaga procurando na base ou cadastrando na hora."
              : `Esta vaga não recebe candidato novo. A lista abaixo continua consultável.`}
          </p>
          {recebeCandidato && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="px-3.5 py-2" onClick={() => setCadastrarAberto(true)}>
                <Icon name="plus" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                Cadastrar candidato
              </Button>
              <Button className="px-3.5 py-2" onClick={() => setAlocarAberto(true)}>
                <Icon name="users" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                Adicionar à vaga
              </Button>
              <Button
                variant="secondary"
                className="px-3.5 py-2"
                title="Traz várias pessoas para o funil de uma vez. Não consome posição da meta."
                onClick={() => setAdicionarLoteAberto(true)}
              >
                <Icon name="layers" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                Adicionar vários ao funil
              </Button>
            </div>
          )}
        </div>
      )}

      {/* A BARRA DAS AÇÕES EM MASSA. Sempre montada (guarda o RESULTADO do último lote, que precisa
          sobreviver à limpeza da seleção que vem logo depois de aplicar). */}
      <AcoesEmMassaDaVaga
        vaga={vaga}
        aba={aba}
        selecionadas={selecionadasObjs}
        todosDoFiltro={selecao.todosDoFiltro}
        quantidade={selecao.quantidadeSelecionada}
        filtro={alvo}
        token={token}
        onLimpar={() => selecao.limpar()}
        onFeito={aposAcao}
      />

      {/* A BARRA DO RECORTE: buscar, filtrar, e só então agir. */}
      <BarraDoRecorte
        recorte={recorteView}
        onMudar={mudarRecorte}
        situacoes={situacoesDoFiltro}
        etapas={etapasDoFiltro}
        incluirForaDoFunil={incluirForaDoFunil}
        quantosNoRecorte={pag.total}
      />

      {pag.carregando && (
        <p className="mb-3 text-[13px] text-faint" aria-live="polite">
          Carregando quem está nesta vaga.
        </p>
      )}

      <TabelaCandidaturas
        ord={ord}
        itens={pag.itens}
        mostrarPosicao={aba === "alocados"}
        apoio={apoioLista}
        vazio={
          recorteAtivo(recorteView)
            ? "Nenhuma candidatura desta vaga passa pelo recorte atual. Ajuste a busca e os filtros acima, ou limpe o recorte."
            : aba === "candidatos"
              ? "Ninguém foi vinculado a esta vaga ainda."
              : "Ninguém foi marcado como alocado nesta vaga ainda."
        }
        carregando={pag.carregando}
        catalogoEtapas={catalogoEtapas}
        selecionados={selecao.selecionados}
        todosDoFiltro={selecao.todosDoFiltro}
        onAlternar={(id) => selecao.alternar(id)}
        onToggleTodos={() =>
          selecao.todosDoFiltro ? selecao.limpar() : selecao.selecionarTodosDoFiltro()
        }
        onFicha={(c) => setFichaId(c.candidatoId)}
        onMover={(c) => setMoverAlvo(c)}
        onFinalizar={(c) => setFinalizarAlvo(c)}
      />

      {/* A PAGINAÇÃO: página X de Y, com o total do recorte. Só aparece quando há mais de uma. */}
      {totalPaginas > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-dim">
            Página <span className="font-semibold tabular-nums text-text">{pag.pagina}</span> de{" "}
            {totalPaginas}, {pag.total} {pag.total === 1 ? "candidatura" : "candidaturas"} no recorte.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-[12.5px]"
              disabled={pag.pagina <= 1 || pag.carregando}
              onClick={() => irPara(pag.pagina - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-[12.5px]"
              disabled={pag.pagina >= totalPaginas || pag.carregando}
              onClick={() => irPara(pag.pagina + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* ─ OS MODAIS DAS AÇÕES, SOBREPOSTOS AO PAINEL ──────────────────────── */}
      {alocarAberto && (
        <AlocarCandidatoModal
          vagasAbertas={[vaga]}
          vagaSugerida={vaga.id}
          token={token}
          onClose={() => setAlocarAberto(false)}
          onAlocado={aposAcao}
        />
      )}

      {cadastrarAberto && (
        <NovoCandidatoModal
          vagasAbertas={[vaga]}
          vagaSugerida={vaga.id}
          token={token}
          onClose={() => setCadastrarAberto(false)}
          onSalvo={aposAcao}
        />
      )}

      {adicionarLoteAberto && (
        <AdicionarCandidatosEmLoteModal
          vaga={vaga}
          token={token}
          onClose={() => setAdicionarLoteAberto(false)}
          onFeito={aposAcao}
        />
      )}

      {moverAlvo && (
        <MoverCandidaturaModal
          candidatura={moverAlvo}
          token={token}
          onClose={() => setMoverAlvo(null)}
          onFeito={aposAcaoMover}
        />
      )}

      {finalizarAlvo && (
        <FinalizarPosicaoModal
          candidatura={finalizarAlvo}
          vaga={vaga}
          token={token}
          onClose={() => setFinalizarAlvo(null)}
          onFeito={aposAcao}
        />
      )}

      {fichaId && (
        <FichaCandidatoModal
          candidatoId={fichaId}
          token={token}
          onClose={() => setFichaId(null)}
          onMudou={aposAcao}
          vagaPorId={new Map([[vaga.id, vaga]])}
        />
      )}
    </>
  );
}

/**
 * ─ A BARRA DO RECORTE: BUSCAR, FILTRAR, E SÓ ENTÃO AGIR ────────────────────────────────────────
 *
 * O recorte agora VIAJA AO SERVIDOR (busca por nome, situação e etapa), então a barra só coleta a
 * escolha e a entrega: quem filtra é a consulta, não o navegador. Os dois filtros são o `MultiSelect`
 * do design system (§A.28/§A.35), a busca é o `input type="search"` da casa.
 *
 * §A.6: A BUSCA É POR NOME, e o `title` diz isso. O CPF não entra aqui, nem na tela nem na URL.
 */
function BarraDoRecorte({
  recorte,
  onMudar,
  situacoes,
  etapas,
  incluirForaDoFunil,
  quantosNoRecorte,
}: {
  recorte: RecorteDoPainel;
  onMudar: (r: RecorteDoPainel) => void;
  situacoes: readonly CandidaturaSituacao[];
  etapas: AsEtapaFunil[];
  incluirForaDoFunil: boolean;
  quantosNoRecorte: number;
}) {
  const ativo = recorteAtivo(recorte);
  const quantos = criteriosAtivos(recorte);

  const opcoesSituacao: MultiOption[] = situacoes.map((sit) => ({
    value: sit,
    label: CANDIDATURA_SITUACAO_LABEL[sit],
  }));
  const opcoesEtapa: MultiOption[] = [
    ...etapas.map((e) => ({ value: e.codigo, label: e.rotulo })),
    ...(incluirForaDoFunil ? [{ value: ETAPA_FORA_DO_FUNIL, label: "Fora Do Funil" }] : []),
  ];

  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Buscar Por Nome</span>
          <input
            type="search"
            className="ds-input"
            placeholder="Digite parte do nome"
            aria-label="Buscar candidato por nome nesta vaga"
            title="A busca procura pelo nome do candidato. O CPF não é usado aqui e não viaja em nenhum endereço."
            value={recorte.busca}
            onChange={(e) => onMudar({ ...recorte, busca: e.target.value })}
          />
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Situação</span>
          <MultiSelect
            values={recorte.situacoes}
            onChange={(v) => onMudar({ ...recorte, situacoes: v })}
            options={opcoesSituacao}
            placeholder="Todas as situações"
            ariaLabel="Filtrar por situação da candidatura"
          />
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Etapa</span>
          <MultiSelect
            values={recorte.etapas}
            onChange={(v) => onMudar({ ...recorte, etapas: v })}
            options={opcoesEtapa}
            placeholder="Todas as etapas"
            ariaLabel="Filtrar por etapa do funil"
          />
        </label>
      </div>

      {ativo && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
          <p className="text-[12px] text-dim">
            <span className="font-semibold text-text">{quantosNoRecorte}</span>{" "}
            {quantosNoRecorte === 1 ? "candidatura" : "candidaturas"} no recorte, com{" "}
            {quantos === 1 ? "1 critério" : `${quantos} critérios`}. A seleção e as ações em massa
            valem para o recorte inteiro.
          </p>
          <Button
            variant="secondary"
            className="flex-none px-3 py-1.5 text-[12.5px]"
            onClick={() => onMudar(RECORTE_VAZIO)}
          >
            Limpar o recorte
          </Button>
        </div>
      )}
    </div>
  );
}

/** Um eixo da trilha: o que ele responde, a etiqueta do estado e a frase que explica o estado. */
function LadoTrilha({
  titulo,
  rotulo,
  tom,
  frase,
}: {
  titulo: string;
  rotulo: string;
  tom: Parameters<typeof StatusPill>[0]["tone"];
  frase: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] uppercase tracking-wide text-faint">{titulo}</span>
        <StatusPill tone={tom} label={rotulo} />
      </div>
      <p className="text-[12.5px] leading-snug text-dim">{frase}</p>
    </div>
  );
}

/**
 * A TABELA DE CANDIDATURAS, a página corrente e nada mais no DOM (sem render em janela: o servidor
 * já entregou só a página). A ordenação é SERVER-SIDE, pelo `ord` que o pai montou.
 *
 * ┌─ SÓ TRÊS COLUNAS ORDENAM, e isso é o contrato do backend, não esquecimento ─────────────────┐
 * │ A rota da aba sabe ordenar por candidato, etapa, situação e último contato. As colunas de    │
 * │ Posição, Entrou Em e Última Movimentação ficam sem o clique de ordenar porque o servidor não │
 * │ as aceita, e oferecer um clique que o backend ignora seria mentir sobre o que ele faz. A      │
 * │ ordem padrão é "entrou mais recente primeiro" (`alocadoEm desc`).                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.20: a tabela tem largura mínima e rola DENTRO do próprio contêiner, sem espremer a coluna de
 * situação (o rótulo mais longo é "Enviado Para Admissão").
 */
function TabelaCandidaturas({
  ord,
  itens,
  apoio,
  vazio,
  mostrarPosicao,
  carregando,
  catalogoEtapas,
  selecionados,
  todosDoFiltro,
  onAlternar,
  onToggleTodos,
  onFicha,
  onMover,
  onFinalizar,
}: {
  ord: Ordenacao<AsCandidaturaItem>;
  itens: AsCandidaturaItem[];
  apoio: string;
  vazio: ReactNode;
  mostrarPosicao: boolean;
  carregando: boolean;
  catalogoEtapas: AsEtapaFunil[];
  /** Os ids marcados manualmente (modo de seleção por linha). */
  selecionados: Set<string>;
  /** Modo "aplicar a todos do filtro": as linhas aparecem marcadas e o individual fica travado. */
  todosDoFiltro: boolean;
  onAlternar: (id: string) => void;
  onToggleTodos: () => void;
  onFicha: (c: AsCandidaturaItem) => void;
  onMover: (c: AsCandidaturaItem) => void;
  onFinalizar: (c: AsCandidaturaItem) => void;
}) {
  const etapas = catalogoEtapas;

  if (itens.length === 0) {
    // Enquanto carrega a primeira página não dá para dizer "vazio": seria mentir por um instante.
    if (carregando) return null;
    return (
      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 text-[13px] text-dim">
        {vazio}
      </p>
    );
  }

  return (
    <>
      <p className="mb-3 text-[12.5px] text-dim">{apoio}</p>
      <div className="ea-scroll overflow-x-auto">
        <table className={cn("ds-table", mostrarPosicao ? "min-w-[960px]" : "min-w-[900px]")}>
          <thead>
            <tr>
              {/* A CAIXA DE "TODOS" = "selecionar todos do filtro". Marca o CONJUNTO INTEIRO do
                  recorte (não só a página), e clicar de novo limpa. */}
              <th className="w-[44px] text-center">
                <input
                  type="checkbox"
                  checked={todosDoFiltro}
                  onChange={onToggleTodos}
                  className="h-4 w-4 accent-[var(--accent)]"
                  aria-label="Selecionar todos os candidatos do recorte"
                  title="Seleciona todas as candidaturas do recorte, não só as desta página. Clique de novo para limpar."
                />
              </th>
              <ColunaOrdenavel
                as="th"
                ord={ord}
                chave="candidato"
                className={cn(
                  "text-center",
                  mostrarPosicao ? "w-[18%] min-w-[150px]" : "w-[22%] min-w-[160px]",
                )}
              >
                Candidato
              </ColunaOrdenavel>
              {mostrarPosicao && (
                <th className="w-[11%] min-w-[104px] text-center">Posição</th>
              )}
              <ColunaOrdenavel as="th" ord={ord} chave="etapa" className="w-[14%] text-center">
                Etapa
              </ColunaOrdenavel>
              <ColunaOrdenavel
                as="th"
                ord={ord}
                chave="situacao"
                className={cn("text-center", mostrarPosicao ? "w-[22%]" : "w-[23%]")}
              >
                Situação
              </ColunaOrdenavel>
              <th className={cn("text-center", mostrarPosicao ? "w-[13%]" : "w-[14%]")}>
                <span className="whitespace-normal">Entrou Em</span>
              </th>
              <th className={cn("text-center", mostrarPosicao ? "w-[13%]" : "w-[14%]")}>
                <span className="whitespace-normal">Última Movimentação</span>
              </th>
              <th className={mostrarPosicao ? "w-[10%] text-center" : "w-[11%] text-center"}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((c) => {
              const marcada = todosDoFiltro || selecionados.has(c.id);
              const decide = podeDecidir(c.situacao);
              return (
                <tr key={c.id} className={marcada ? "bg-[var(--surface)]" : undefined}>
                  {/* A caixa da linha encerrada nasce desabilitada (quem saiu não aceita decisão
                      nova); no modo "todos do filtro" todas aparecem marcadas e travadas (para
                      desmarcar, limpe no cabeçalho). O `title` diz o porquê quando desabilitada. */}
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => onAlternar(c.id)}
                      disabled={todosDoFiltro || !decide}
                      className="h-4 w-4 accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={
                        decide
                          ? `Selecionar ${c.candidatoNome}`
                          : `${c.candidatoNome} já saiu do processo e não entra na seleção`
                      }
                      title={
                        todosDoFiltro
                          ? "Todo o recorte está selecionado. Limpe no cabeçalho para escolher pessoa a pessoa."
                          : decide
                            ? undefined
                            : "O processo desta pessoa já terminou, então ela não aceita decisão nova e fica fora das ações em massa. A linha segue na lista como histórico."
                      }
                    />
                  </td>
                  <td className="font-semibold">{c.candidatoNome}</td>
                  {mostrarPosicao && (
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        {rotuloCurtoDoLado(c.posicaoLado) ? (
                          <StatusPill
                            tone={c.posicaoLado === "BANCO" ? "in" : "ok"}
                            label={rotuloCurtoDoLado(c.posicaoLado) as string}
                            title={rotuloDoLado(c.posicaoLado) as string}
                          />
                        ) : (
                          <span className="text-faint">não informado</span>
                        )}
                      </span>
                    </td>
                  )}
                  <td className="text-center">
                    <span className="inline-flex justify-center">
                      {candidaturaViva(c.situacao) ? (
                        <StatusPill
                          tone={tomDaEtapa(c.etapa, etapas)}
                          label={rotuloDaEtapa(c.etapa, etapas)}
                        />
                      ) : (
                        <StatusPill tone="nt" label="Fora Do Funil" />
                      )}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex justify-center">
                      <StatusPill
                        tone={tomDaSituacao(c.situacao)}
                        label={CANDIDATURA_SITUACAO_LABEL[c.situacao]}
                      />
                    </span>
                  </td>
                  <td
                    className={cn(
                      "text-center tabular-nums",
                      !mostrarPosicao && "whitespace-nowrap",
                    )}
                  >
                    {dataHoraBr(c.alocadoEm)}
                  </td>
                  <td
                    className={cn(
                      "text-center tabular-nums",
                      !mostrarPosicao && "whitespace-nowrap",
                    )}
                  >
                    {dataHoraBr(c.atualizadoEm)}
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      <AcaoIcone
                        icone="eye"
                        titulo="Ver a ficha"
                        descricao={`Ver a ficha de ${c.candidatoNome}`}
                        onClick={() => onFicha(c)}
                      />
                      {decide && (
                        <AcaoIcone
                          icone="arr"
                          titulo={
                            podeMoverNoFunil(c.situacao)
                              ? "Mover de etapa"
                              : "Encerrar ou enviar para a admissão"
                          }
                          descricao={
                            podeMoverNoFunil(c.situacao)
                              ? `Mover ${c.candidatoNome} de etapa`
                              : `Encerrar o processo de ${c.candidatoNome} ou enviar para a admissão`
                          }
                          onClick={() => onMover(c)}
                        />
                      )}
                      {podeFinalizarPosicao(c.situacao) && (
                        <AcaoIcone
                          icone="check"
                          titulo="Finalizar posição"
                          descricao={`Finalizar a posição da vaga com ${c.candidatoNome}`}
                          onClick={() => onFinalizar(c)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** O botão de ação em ícone, na mesma forma da Central de Candidatos. */
function AcaoIcone({
  icone,
  titulo,
  descricao,
  onClick,
}: {
  icone: IconName;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={descricao}
      onClick={onClick}
      className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
    >
      <Icon name={icone} className="h-4 w-4" />
    </button>
  );
}
