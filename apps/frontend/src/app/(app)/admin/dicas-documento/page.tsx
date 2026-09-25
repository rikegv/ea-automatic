"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { FiltroCampo, FiltroTrigger } from "@/components/ui/FiltroTrigger";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import {
  CATALOGO_DE_FILTROS_VAZIO,
  DICA_DOCUMENTO_TEXTO_MAX,
  ROTULO_DA_SITUACAO,
  carregarCatalogoDeFiltros,
  contarFiltrosDasDicas,
  gravarDica,
  inativarDica,
  listarDicas,
  reativarDica,
  situacaoDaLinha,
  validarTextoDaDica,
  type CatalogoDeFiltrosDasDicas,
  type FiltrosDasDicasDeDocumento,
  type LinhaDeDicaDeDocumento,
  type SituacaoDaDica,
} from "@/lib/dicas-documento";

/**
 * ADMIN: DICAS POR TIPO DE DOCUMENTO.
 *
 * O diretor cadastra, POR TIPO DE DOCUMENTO, como aquele documento precisa estar para passar na
 * auditoria. UM TIPO, UMA DICA: a régua não é "várias regras por documento" (isso é a tela de
 * Regras De Auditoria, que alimenta o motor de IA), é UM texto por documento, e o destinatário é
 * outro: quem lê a dica é o CANDIDATO, no portal.
 *
 * A TELA LISTA OS TIPOS, NÃO AS DICAS, e essa é a decisão de leitura que importa. Listar só o que
 * já tem dica responde "o que eu escrevi", e a pergunta do diretor é a inversa: "o que ainda falta
 * escrever". Por isso a linha é o TIPO DE DOCUMENTO, e a coluna Dica é que fica vazia.
 *
 * SÓ OS TIPOS ATIVOS ENTRAM. Tipo inativo saiu do catálogo vivo (`admin/tipos-documento`), não
 * entra em régua nenhuma e portanto nunca chega a um candidato: listá-lo aqui seria oferecer
 * trabalho que ninguém vai ler. O subtítulo diz isso com todas as letras, para a ausência não
 * parecer sumiço.
 *
 * §A.12 máscara única de tabela · §A.20 larguras sem esmagar · §A.24 Title Case em título e pill ·
 * §A.29 ordenação clicável pelo `useOrdenacao` · §A.35 nada de `<select>` cru, o seletor de tipo é
 * o `Select` do design system, com busca (o catálogo passa de 30 opções) · §A.41 o modal não fecha
 * ao clicar fora, tem "Cancelar" e "Salvar", e o Escape continua fechando.
 *
 * §A.30: a escolha foi feita pelo diretor, com a lista das cinco colunas na mão, e ela é de DOIS
 * filtros: SITUAÇÃO e DOCUMENTO. Código, Dica e Ações NÃO viram filtro. Os dois são múltiplos
 * (§A.28), no componente compartilhado, e as opções vêm do CATÁLOGO do endpoint, nunca das linhas
 * carregadas (§A.37).
 *
 * §A.23: o menu nasce só para o SUPER_ADMIN. Esta tela não concede nem distribui menu a ninguém.
 *
 * A LISTA VEM PRONTA DO SERVIDOR (`GET /admin/dicas-documento` devolve uma linha por tipo ATIVO,
 * com a dica quando existe), então a tela NÃO cruza dois catálogos aqui dentro. O cruzamento é uma
 * consulta só, no banco, e o que chega é exatamente a tabela que se vê.
 */
export default function DicasDocumentoPage() {
  const { token } = useAuth();
  /** O RECORTE: o que os filtros deixaram passar, e é o que a tabela desenha. */
  const [linhas, setLinhas] = useState<Linha[]>([]);
  /**
   * O UNIVERSO: todos os tipos ativos, sem filtro nenhum.
   *
   * Ele existe por duas razões, e as duas são de correção, não de desempenho:
   *  1. O CONTADOR DO TOPO é sobre o universo. Contador que respeita filtro não é contador, é o
   *     tamanho da lista com outro nome, e "12 de 31 com dica" viraria "1 de 1" ao filtrar.
   *  2. O SELETOR DO MODAL oferece TODOS os documentos. Com o filtro ligado, oferecer só o recorte
   *     impediria cadastrar a dica de quem está fora dele, e a tela existe justamente para isso.
   */
  const [universo, setUniverso] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Os dois filtros, ambos múltiplos (§A.28) ─────────────────────────────────────────────────
  const [situacoes, setSituacoes] = useState<SituacaoDaDica[]>([]);
  const [documentos, setDocumentos] = useState<string[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoDeFiltrosDasDicas>(CATALOGO_DE_FILTROS_VAZIO);

  // Modal de preenchimento (§A.41). `null` = fechado, "nova" = criação (documento ainda por
  // escolher), uma linha = edição daquele documento.
  const [aberto, setAberto] = useState<Linha | "nova" | null>(null);
  const [tipoEdit, setTipoEdit] = useState("");
  const [textoEdit, setTextoEdit] = useState("");
  const [saving, setSaving] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  // Remoção da dica (a dica sai; o tipo de documento continua existindo).
  const [alvoRemover, setAlvoRemover] = useState<Linha | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const filtros = useMemo<FiltrosDasDicasDeDocumento>(
    () => ({ situacoes, documentos }),
    [situacoes, documentos],
  );
  const filtrosAtivos = contarFiltrosDasDicas(filtros);

  function limparFiltros() {
    setSituacoes([]);
    setDocumentos([]);
  }

  /**
   * O CATÁLOGO DOS FILTROS, buscado UMA vez na entrada (§A.37).
   *
   * Ele não muda durante a sessão de trabalho (é o catálogo de tipos ativos mais três valores de
   * contrato), e recarregá-lo a cada filtro só gastaria chamada. Indisponível, a tela continua
   * inteira: `carregarCatalogoDeFiltros` já devolve a reserva em vez de lançar.
   */
  useEffect(() => {
    if (!token) return;
    void carregarCatalogoDeFiltros(token).then(setCatalogo);
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      /* DUAS CHAMADAS SÓ QUANDO HÁ FILTRO, e nunca por preciosismo: sem filtro o recorte É o
         universo, então pedir a mesma lista duas vezes seria uma ida a mais para receber o que já
         se tem na mão. */
      const temFiltro = filtrosAtivos > 0;
      const [recorte, todos] = await Promise.all([
        listarDicas(token, temFiltro ? filtros : undefined),
        temFiltro ? listarDicas(token) : Promise.resolve(null),
      ]);
      setLinhas(recorte);
      setUniverso(todos ?? recorte);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [token, filtros, filtrosAtivos]);

  useEffect(() => {
    void load();
  }, [load]);

  // O CONTADOR É SOBRE O UNIVERSO, e é por isso que ele lê `universo` e não `linhas`.
  const comDica = useMemo(() => universo.filter((l) => l.dicaId).length, [universo]);

  // §A.29: ordenação clicável. Situação ordena por RANK (sem dica primeiro, que é o que falta
  // fazer), e não alfabética. A coluna de ações fica de fora: é controle, não dado.
  const colunas = useMemo<ColOrd<Linha>[]>(
    () => [
      { chave: "documento", tipo: "texto", valor: (l) => l.nome },
      { chave: "codigo", tipo: "texto", valor: (l) => l.codigo },
      { chave: "dica", tipo: "texto", valor: (l) => l.texto ?? "" },
      // Sem dica primeiro (é o que falta fazer), depois a inativa (escrita, mas fora do ar), e a
      // ativa por último, que é a que não pede nada de ninguém.
      { chave: "situacao", tipo: "status", valor: (l) => situacao(l).rank },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, linhas);

  // TODOS os documentos, e não o recorte: ver a nota do `universo`.
  const opcoesTipo = useMemo(
    () =>
      universo.map((l) => ({
        value: l.tipoDocumentoId,
        label: l.dicaId ? `${l.nome} (já tem dica)` : l.nome,
        busca: l.codigo,
      })),
    [linhas],
  );

  function abrirNova() {
    setAberto("nova");
    setTipoEdit("");
    setTextoEdit("");
    setErroModal(null);
  }

  function abrirLinha(l: Linha) {
    setAberto(l);
    setTipoEdit(l.tipoDocumentoId);
    setTextoEdit(l.texto ?? "");
    setErroModal(null);
  }

  /* A MESMA RÉGUA DO SERVIDOR, RODADA ENQUANTO A PESSOA DIGITA. Ela recusa `<` e `>` e recusa o
     vazio, em vez de limpar em silêncio, então a tela diz isso ANTES do clique: o caminho normal é
     nunca ver um erro vindo da rede. O texto medido é o NORMALIZADO, que é o que o servidor mede. */
  const conferido = validarTextoDaDica(textoEdit);
  const podeSalvar = Boolean(tipoEdit) && !conferido.erro && !saving;

  async function salvar() {
    if (!podeSalvar) return;
    setSaving(true);
    setErroModal(null);
    try {
      // UM VERBO SÓ, e é o que some com a pergunta "já existe?": a chave é o TIPO, então quem abre
      // "Nova Dica" e escolhe um documento que já tem dica está EDITANDO aquela dica, sem que a
      // tela precise decidir nada. Um tipo, uma dica.
      await gravarDica(token, tipoEdit, { texto: conferido.texto });
      setAberto(null);
      await load();
    } catch (e) {
      setErroModal(e instanceof ApiError || e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  /* INATIVAÇÃO LÓGICA, e o parâmetro é o TIPO: o id da dica nunca precisa sair do servidor para
     voltar como parâmetro, porque um tipo tem uma dica só. O texto NÃO se perde, e é por isso que
     existe o par "reativar": sem ele, a dica ocultada ficaria visível na tabela, com o texto
     inteiro à mostra, e sem nenhum caminho de volta ao portal. */
  async function inativar() {
    const alvo = alvoRemover;
    if (!alvo?.dicaId) return;
    setRemovendo(true);
    setError(null);
    try {
      await inativarDica(token, alvo.tipoDocumentoId);
      setAlvoRemover(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Erro ao ocultar a dica.");
    } finally {
      setRemovendo(false);
    }
  }

  async function reativar(l: Linha) {
    setError(null);
    try {
      await reativarDica(token, l.tipoDocumentoId);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error ? e.message : "Erro ao reativar a dica.",
      );
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Cadastros"
        title="Dicas Por Documento"
        subtitle="O que o candidato precisa saber para o documento passar na auditoria. Um texto por tipo de documento, exibido no portal do candidato. A lista traz os tipos ativos do catálogo."
      />

      <GlassCard className="mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        {/* O CONTADOR NÃO MUDOU DE SENTIDO COM O FILTRO, e isso é escolha: ele fala do UNIVERSO
            ("quanto do catálogo já tem dica"), que é a pergunta que ele responde desde que nasceu.
            Recalculá-lo sobre o recorte o transformaria no tamanho da lista com outro nome. O
            tamanho do recorte é dito à parte, e só quando há recorte. */}
        <p className="text-sm text-dim">
          {loading
            ? "Carregando o catálogo de documentos."
            : `${comDica} de ${universo.length} documentos com dica cadastrada.`}
          {!loading && filtrosAtivos > 0 && (
            <span className="text-faint"> Filtro ativo: {linhas.length} na lista.</span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {/* OS DOIS FILTROS (§A.30), no gatilho compartilhado: ele é um ícone com badge, então a
              barra de filtros NÃO empurra a tabela nem rouba largura da coluna Dica (§A.20). */}
          <FiltroTrigger count={filtrosAtivos} onLimpar={limparFiltros}>
            <FiltroCampo label="Situação">
              <MultiSelect
                values={situacoes}
                onChange={(v) => setSituacoes(v as SituacaoDaDica[])}
                options={catalogo.situacoes.map((o) => ({
                  value: o.valor,
                  // O rótulo é o DESTA tela (§A.24), com o do servidor como reserva: é o que faz
                  // a opção do filtro dizer a mesma palavra que a pill da linha.
                  label: ROTULO_DA_SITUACAO[o.valor] ?? o.rotulo,
                }))}
                placeholder="Todas"
                ariaLabel="Situação da dica"
              />
            </FiltroCampo>
            <FiltroCampo label="Documento">
              <MultiSelect
                values={documentos}
                onChange={setDocumentos}
                // §A.35: passa de 30 opções, e o `MultiSelect` já traz a busca interna.
                options={catalogo.documentos.map((o) => ({ value: o.valor, label: o.rotulo }))}
                placeholder="Todos"
                ariaLabel="Tipo de documento"
              />
            </FiltroCampo>
          </FiltroTrigger>
          <Button onClick={abrirNova} disabled={loading} className="px-4 py-2.5">
            Nova dica
          </Button>
        </div>
      </GlassCard>

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="overflow-x-auto">
          {/* §A.20: as larguras aproveitam o espaço em vez de esmagar. A Dica é a coluna elástica
              (é o texto longo e é o que se lê), o Documento tem o segundo peso, e Código, Situação
              e Ações ficam presos ao seu conteúdo, sem roubar espaço do texto. */}
          <table className="ds-table w-full min-w-[860px] table-fixed">
            {/* AS LARGURAS, EM REM E NÃO EM PORCENTAGEM, porque a coluna que precisa CRESCER é a
                Dica, e só ela: as outras quatro têm conteúdo de tamanho conhecido, então prender
                cada uma ao seu conteúdo é o que sobra de espaço para o texto. Somadas dão 47rem
                (752px), então numa tela de 1200 de conteúdo a Dica fica com ~450px, e no mínimo
                de 860 ainda sobram ~110px antes de a tabela passar a rolar na horizontal. */}
            <colgroup>
              <col className="w-[16rem]" />
              <col className="w-[13rem]" />
              <col />
              <col className="w-[10rem]" />
              <col className="w-[9.5rem]" />
            </colgroup>
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="documento">
                  Documento
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="codigo">
                  Código
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="dica">
                  Dica
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="situacao">
                  Situação
                </ColunaOrdenavel>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : linhas.length === 0 ? (
                <tr>
                  {/* A LISTA VAZIA TEM DUAS CAUSAS, e dizer a errada faz o filtro parecer
                      catálogo vazio. Com filtro ligado, o caminho de volta é dito junto. */}
                  <td colSpan={5} className="py-8 text-center text-faint">
                    {filtrosAtivos > 0
                      ? "Nenhum documento atende aos filtros. Limpe os filtros para ver o catálogo inteiro."
                      : "Nenhum tipo de documento ativo no catálogo."}
                  </td>
                </tr>
              ) : (
                ord.itens.map((l) => (
                  <tr key={l.tipoDocumentoId}>
                    <td className="font-semibold">{l.nome}</td>
                    {/* O código é MAIÚSCULA COM SUBLINHADO (`COMPROVANTE_ESCOLARIDADE`), e o
                        sublinhado não é ponto de quebra para o navegador: sem o `break-all` o
                        código mais longo do catálogo vazaria da própria coluna. */}
                    <td className="break-all text-[12.5px] text-dim">{l.codigo}</td>
                    <td>
                      {l.texto ? (
                        // Duas linhas e reticências: a célula mostra o começo do texto para a
                        // varredura, e o texto inteiro é lido no modal, que é onde ele se edita.
                        <span className="line-clamp-2 text-dim">{l.texto}</span>
                      ) : (
                        // §A.11: marcador de célula vazia é texto, nunca o glifo.
                        <span className="text-faint">não informado</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill tone={situacao(l).tone} label={situacao(l).label} />
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button onClick={() => abrirLinha(l)} className="text-accent hover:underline">
                        {l.dicaId ? "editar" : "cadastrar"}
                      </button>
                      {l.dicaId && (
                        <>
                          <span className="px-2 text-faint">·</span>
                          {l.ativo === false ? (
                            <button
                              onClick={() => void reativar(l)}
                              className="text-accent hover:underline"
                            >
                              reativar
                            </button>
                          ) : (
                            <button
                              onClick={() => setAlvoRemover(l)}
                              className="text-danger hover:underline"
                            >
                              ocultar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {aberto && (
        <Modal onClose={() => setAberto(null)} className="max-w-2xl" ariaLabel="Dica do documento">
          <h3>{aberto !== "nova" && aberto.dicaId ? "Editar Dica" : "Nova Dica"}</h3>
          <p className="psub mt-1">
            Este texto aparece para o candidato, no portal, no momento em que ele vai enviar este
            documento. Escreva o que precisa estar visível e legível para o documento ser aceito.
          </p>

          <label className="mt-4 block text-[12.5px] text-dim">
            Documento
            <Select
              className="mt-1"
              value={tipoEdit}
              onChange={(v) => {
                setTipoEdit(v);
                // Trocar de documento no modo "Nova Dica" traz o texto que aquele documento já
                // tem, quando tem: sem isso, salvar por cima apagaria o que estava escrito sem
                // que a pessoa tivesse visto.
                if (aberto === "nova") {
                  setTextoEdit(linhas.find((l) => l.tipoDocumentoId === v)?.texto ?? "");
                }
              }}
              // §A.35: o catálogo passa de 30 tipos, então a busca é obrigatória.
              searchable
              disabled={aberto !== "nova"}
              ariaLabel="Tipo de documento da dica"
              placeholder="Escolher o documento"
              options={opcoesTipo}
            />
            {aberto !== "nova" && (
              <span className="mt-1 block text-[11.5px] text-faint">
                O documento não muda na edição. Para escrever a dica de outro, volte e abra a linha
                dele.
              </span>
            )}
          </label>

          <label className="mt-4 block text-[12.5px] text-dim">
            Dica
            <textarea
              className="ds-input mt-1 min-h-[160px] resize-y"
              placeholder="Ex.: envie a frente e o verso no mesmo arquivo, com o documento inteiro dentro da foto e todos os números legíveis."
              value={textoEdit}
              onChange={(e) => setTextoEdit(e.target.value)}
              maxLength={DICA_DOCUMENTO_TEXTO_MAX}
            />
          </label>
          <p className="mt-1 text-[11.5px] text-faint">
            {conferido.texto.length} de {DICA_DOCUMENTO_TEXTO_MAX} caracteres. As quebras de linha
            são preservadas no portal. O texto sai como foi escrito: o portal não formata nem
            interpreta marcação, e os sinais &lt; e &gt; não são aceitos.
          </p>

          {/* A RECUSA DO SERVIDOR, DITA ANTES DO ENVIO. Só aparece depois que a pessoa escreveu
              alguma coisa: avisar "escreva a dica" num campo que ela ainda nem tocou é ralhar. */}
          {!erroModal && conferido.erro && textoEdit.length > 0 && (
            <p className="mt-3 text-[12.5px] text-danger" role="alert">
              {conferido.erro}
            </p>
          )}

          {erroModal && (
            <p className="mt-3 text-[12.5px] text-danger" role="alert">
              {erroModal}
            </p>
          )}

          {/* §A.41: saída visível e deliberada. Cancelar e Salvar, e nada de fechar por encostar
              fora. Texto de botão é AÇÃO, então escrita normal (§A.24). */}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAberto(null)} className="px-4 py-2.5">
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={!podeSalvar} className="px-4 py-2.5">
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(alvoRemover)}
        tone="danger"
        title="Ocultar A Dica?"
        message={
          alvoRemover
            ? `A dica de "${alvoRemover.nome}" deixa de aparecer para o candidato no portal. O texto continua guardado, e o botão "reativar" devolve a dica ao portal quando você quiser.`
            : ""
        }
        confirmLabel="Ocultar"
        busy={removendo}
        onConfirm={inativar}
        onCancel={() => setAlvoRemover(null)}
      />
    </>
  );
}

/**
 * A linha da tabela é a linha do contrato, sem tradução no meio: um TIPO ATIVO, com a dica quando
 * existe (`dicaId` nulo é "ainda não tem", que é o caso que a tela existe para mostrar).
 */
type Linha = LinhaDeDicaDeDocumento;

/**
 * AS TRÊS SITUAÇÕES, e a terceira só existe porque a remoção é LÓGICA: a dica ocultada continua
 * na tabela, com o texto à mostra, e chamá-la de "Com Dica" seria mentir para quem confere o que o
 * candidato está vendo. O rank ordena pelo que pede trabalho: sem dica primeiro, oculta depois.
 *
 * §A.24: rótulo de pill é etiqueta, então Title Case.
 *
 * O ESTADO E O RÓTULO VÊM DA BIBLIOTECA, e é o que faz a pill da linha e a opção do filtro dizerem
 * a MESMA palavra: filtrar por "Dica Inativa" e a linha exibir outra coisa faria o filtro parecer
 * quebrado sem estar. Aqui fica só o que é da tabela, o tom e a ordem.
 */
const APRESENTACAO_DA_SITUACAO: Record<SituacaoDaDica, { tone: "ok" | "wn" | "nt"; rank: number }> =
  {
    // Sem dica primeiro (é o que falta fazer), a inativa depois (escrita, mas fora do ar), e a
    // ativa por último, que é a que não pede nada de ninguém.
    SEM_DICA: { tone: "wn", rank: 0 },
    DICA_INATIVA: { tone: "nt", rank: 1 },
    COM_DICA: { tone: "ok", rank: 2 },
  };

function situacao(l: Linha): { tone: "ok" | "wn" | "nt"; label: string; rank: number } {
  const estado = situacaoDaLinha(l);
  return { ...APRESENTACAO_DA_SITUACAO[estado], label: ROTULO_DA_SITUACAO[estado] };
}
