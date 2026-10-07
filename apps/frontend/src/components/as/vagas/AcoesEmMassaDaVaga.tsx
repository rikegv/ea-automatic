"use client";

/**
 * ─ AS AÇÕES EM MASSA DA VAGA: a barra da seleção e as confirmações (grupo 1 da A&S) ───────────
 *
 * ┌─ O QUE ISTO RESOLVE ────────────────────────────────────────────────────────────────────────┐
 * │ Uma vaga de alto volume recebe dezenas de candidatos, e todo gesto do funil era feito UM A   │
 * │ UM, com uma confirmação cada. Mover trinta pessoas de Triagem para Entrevista custava trinta │
 * │ aberturas de modal. As quatro rotas em massa já existem no backend; esta é a superfície que  │
 * │ as usa, dentro do painel da vaga, sobre as linhas que o consultor marcou.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ADICIONAR E FINALIZAR POSIÇÃO SÃO BOTÕES SEPARADOS (decisão do diretor), e eles nem moram no
 * mesmo lugar: ADICIONAR traz gente para o funil, não consome posição nenhuma e parte de quem AINDA
 * NÃO está na vaga, então é um botão do topo da aba, com lista própria. FINALIZAR POSIÇÃO ENTREGA a
 * vaga e CONSOME a meta, e parte de quem já está na lista, então é um botão desta barra. Um clique
 * errado não pode queimar posição, e é por isso que o rótulo daqui diz "Finalizar posição" e o de lá
 * diz "Adicionar", com a frase de apoio dizendo qual consome o quê.
 *
 * CADA AÇÃO PERGUNTA ANTES. Nenhuma dispara no clique da barra: o clique abre a confirmação, que diz
 * quantas linhas serão tocadas e o que acontece com elas. Em massa isso vale mais do que no
 * individual, porque o estrago também é multiplicado pelo tamanho da seleção.
 *
 * A BARRA SÓ OFERECE O QUE PODE EXISTIR. Quem decide são as réguas testadas de `as-vaga-acoes`
 * (`podeFinalizarPosicao`, `podeDecidir`), as MESMAS que decidem os ícones de cada linha: um botão
 * que só sabe falhar gasta o clique, devolve uma recusa e não diz o que fazer no lugar. Na aba de
 * alocados, por exemplo, ninguém mais pode finalizar posição (todos já finalizaram), e o botão
 * simplesmente não aparece.
 *
 * O RESULTADO É METADE DA ENTREGA, e ele vive fora da barra de propósito: depois do lote a seleção é
 * limpa e a lista é relida, então um resultado desenhado dentro da barra sumiria junto com ela, no
 * instante exato em que o consultor precisa lê-lo. Ver `ResultadoLoteModal`.
 *
 * §A.6: o que trafega é id de candidatura, etapa, lado e o motivo escrito pelo consultor. Nenhum CPF
 * sai daqui, e o nome mostrado na lista de falhas vem da memória da tela, não de busca nova.
 * §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação, escrita normal),
 * §A.35 (nada de `<select>` cru: o seletor de etapa é o `Select` do design system).
 */

import { useState } from "react";
import {
  AS_MAXIMO_POR_LOTE,
  CANDIDATURA_SITUACAO_AJUDA,
  CANDIDATURA_SITUACAO_LABEL,
  motivoVemDoCatalogo,
  type AsCandidaturaItem,
  type AsResultadoAcaoEmMassa,
  type AsResultadoEmMassa,
  type CandidaturaEtapa,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  finalizarPosicaoPorFiltro,
  mensagemDoErro,
  moverEtapaPorFiltro,
  registrarSaidaPorFiltro,
  type AbaDaVaga,
  type AlvoPorFiltroDaVaga,
} from "@/lib/as-candidatos";
import { rotuloDaEtapa, useEtapas } from "@/lib/as-etapas";
import {
  finalizarPosicaoEmLote,
  moverEtapaEmLote,
  registrarSaidaEmLote,
  type SaidaEmLote,
} from "@/lib/as-candidatos-lote";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { CampoMotivoDaSaida } from "@/components/as/candidatos/CampoMotivoDaSaida";
import {
  POSICAO_LADOS,
  POSICAO_LADO_LABEL,
  metaDoLado,
  oficiaisAbertas,
  podeDecidir,
  podeFinalizarPosicao,
  preenchidasDoLado,
  type PosicaoLado,
} from "@/lib/as-vaga-acoes";
import { ResultadoLoteModal } from "@/components/as/vagas/ResultadoLoteModal";
import { EnviarShortlistModal } from "@/components/as/vagas/EnviarShortlistModal";
import { useShortlists } from "@/lib/as-shortlists";
import { useStatusVaga, vagaEmProcesso } from "@/lib/as-status-vaga";
import { cn } from "@/lib/cn";

/** Qual confirmação está aberta. `null` é a barra sozinha, sem nada perguntado ainda. */
type Acao = "FINALIZAR" | "MOVER" | "DESVINCULAR" | "ENVIAR" | "SHORTLIST";

/**
 * O MOTIVO DO DESVÍNCULO, as duas saídas sem êxito. As etiquetas são as MESMAS palavras da ação
 * individual (`MoverCandidaturaModal`), de propósito: o consultor escolhe entre "Descartado Pela
 * Seleção" e "Desistiu Do Processo" numa tela e na outra, e dois vocabulários para a mesma escolha
 * fariam a mesma decisão parecer duas. São ETIQUETAS que classificam, então title case (§A.24).
 */
const DESVINCULO: { situacao: Extract<SaidaEmLote, "DESCARTADO" | "DESISTIU">; rotulo: string; apoio: string }[] = [
  {
    situacao: "DESCARTADO",
    rotulo: "Descartado Pela Seleção",
    apoio: "A seleção decidiu não seguir com estas pessoas.",
  },
  {
    situacao: "DESISTIU",
    rotulo: "Desistiu Do Processo",
    apoio: "As próprias pessoas saíram do processo.",
  },
];

export function AcoesEmMassaDaVaga({
  vaga,
  aba,
  selecionadas,
  todosDoFiltro = false,
  quantidade,
  filtro,
  token,
  onLimpar,
  onFeito,
}: {
  vaga: VagaListItem;
  /** Em qual aba a barra está: decide se "Finalizar posição" faz sentido no modo "todos do filtro". */
  aba?: AbaDaVaga;
  /** As candidaturas MARCADAS, inteiras: é delas que sai o nome que a lista de falhas mostra. */
  selecionadas: AsCandidaturaItem[];
  /**
   * ─ O MODO "APLICAR A TODOS DO FILTRO" (decisão do diretor, 07/10/2026) ──────────────────────────
   *
   * Quando ligado, as ações de STATUS agem sobre o CONJUNTO INTEIRO do recorte, SEM teto, mandando o
   * FILTRO ao servidor (rotas por-filtro), e não a lista de ids. As duas ações de CREDENCIAL (Enviar
   * Para Admissão e Enviar Shortlist) ficam DESABILITADAS aqui: enviar credencial exige seleção
   * nominal, com a prévia de quem recebe o quê. Elas só voltam no modo de ids marcados.
   */
  todosDoFiltro?: boolean;
  /** Quantas candidaturas a ação vai tocar: o `total` do filtro quando "todos", senão a seleção. */
  quantidade?: number;
  /** O alvo das rotas por-filtro: o recorte corrente mais a vaga de origem. Usado só no modo "todos". */
  filtro?: AlvoPorFiltroDaVaga;
  token: string | null;
  onLimpar: () => void;
  /** Relê a lista da vaga, avisa a Central de Vagas e limpa a seleção. */
  onFeito: () => void;
}) {
  const [acao, setAcao] = useState<Acao | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** O resultado do último lote. Vive AQUI e não na barra: a barra some quando a seleção é limpa. */
  const [resultado, setResultado] = useState<{
    titulo: string;
    dados: AsResultadoEmMassa;
    nomes: Map<string, string>;
  } | null>(null);

  /**
   * ─ A SHORTLIST DESTA VAGA (Frente E, pontos 10 e 11) ────────────────────────────────────────
   *
   * ELA É LIDA AQUI, E NÃO DENTRO DO MODAL, por uma razão só: é dela que sai o NÚMERO do próximo
   * envio, e é o número que decide se o formulário pede o motivo do reenvio. Lendo lá dentro, o
   * campo obrigatório apareceria depois de a caixa já estar aberta, piscando na cara de quem lê.
   *
   * ELA SÓ É BUSCADA QUANDO O ENVIO É POSSÍVEL (`emProcesso`): vaga em rascunho, fechada ou
   * cancelada não manda shortlist, e uma leitura por painel aberto seria requisição sem uso.
   */
  const { status: catalogoStatus } = useStatusVaga(token);
  /* A MESMA RÉGUA DO SERVIDOR, e não uma lista de status escrita aqui: lá o envio só é aceito em
     vaga de papel ABERTURA ou ENTREGA (`papelDeVagaEmProcesso`). Um botão que só sabe dar 409
     gasta o clique, devolve uma recusa e não diz o que fazer no lugar. */
  const emProcesso = vagaEmProcesso(vaga.status, catalogoStatus);
  const shortlists = useShortlists(vaga.id, token, emProcesso);

  const ids = selecionadas.map((c) => c.id);
  const podeFinalizar = selecionadas.some((c) => podeFinalizarPosicao(c.situacao));
  const podeDecidirAlgo = selecionadas.some((c) => podeDecidir(c.situacao));
  /** O teto do lote é do contrato compartilhado, e a barra o diz ANTES de a recusa de 400 chegar. */
  const acimaDoTeto = ids.length > AS_MAXIMO_POR_LOTE;

  /**
   * O DISPARO, EM UM LUGAR SÓ PARA AS TRÊS AÇÕES DESTA BARRA.
   *
   * O MAPA DE NOMES É CONGELADO ANTES DE CHAMAR, e isso não é detalhe: `onFeito` relê a lista e limpa
   * a seleção, então montar o mapa depois da resposta encontraria uma seleção já vazia e a lista de
   * falhas sairia inteira como "não informado". §A.6: o nome vem da memória da tela, nunca de busca.
   */
  async function executar(titulo: string, chamada: () => Promise<AsResultadoEmMassa>) {
    const nomes = new Map(selecionadas.map((c) => [c.id, c.candidatoNome]));
    setErro(null);
    setProcessando(true);
    try {
      const dados = await chamada();
      setAcao(null);
      setResultado({ titulo, dados, nomes });
      onFeito();
    } catch (err) {
      // A RECUSA DO LOTE INTEIRO (vaga encerrada, teto estourado) não é resultado, é erro: ela não
      // tem `aplicadas` nem `falhas`, e mostrá-la na caixa de resultado desenharia zero aplicadas
      // como se o servidor tivesse tentado linha a linha, que é justamente o que ele não fez.
      setErro(mensagemDoErro(err, "Falha ao aplicar a ação em massa."));
    } finally {
      setProcessando(false);
    }
  }

  // ─ O MODO "TODOS DO FILTRO" É OUTRA BARRA ──────────────────────────────────────────────────────
  // Todos os hooks acima já rodaram, então este desvio no corpo do render é seguro (a quantidade de
  // hooks não muda). Ele troca a barra inteira: no modo "todos", a ação manda o FILTRO ao servidor,
  // sem teto, e as credenciais ficam de fora. A barra de ids (abaixo) continua exatamente como era.
  if (todosDoFiltro && filtro) {
    return (
      <AcoesPorFiltroDaVaga
        vaga={vaga}
        aba={aba}
        filtro={filtro}
        quantidade={quantidade ?? 0}
        token={token}
        onLimpar={onLimpar}
        onFeito={onFeito}
      />
    );
  }

  return (
    <>
      {selecionadas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
          <span className="text-[12.5px] text-dim">
            selecionadas:{" "}
            <span className="font-semibold tabular-nums text-text">{selecionadas.length}</span>
          </span>
          <button
            type="button"
            onClick={onLimpar}
            className="text-[12.5px] text-accent hover:underline"
          >
            limpar seleção
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* FINALIZAR POSIÇÃO É A ÚNICA QUE CONSOME A META, e o botão diz isso no `title`: as
                outras três movem ou encerram processo, esta ENTREGA a vaga. */}
            {podeFinalizar && (
              <Button
                variant="secondary"
                className="shrink-0 px-3 py-2"
                disabled={processando}
                title="Entrega a posição da vaga e consome a meta"
                onClick={() => {
                  setErro(null);
                  setAcao("FINALIZAR");
                }}
              >
                <Icon name="check" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                {`Finalizar posição (${selecionadas.length})`}
              </Button>
            )}
            {/* ─ ENVIAR A SHORTLIST AO CLIENTE ─────────────────────────────────────────────
                SÓ EM VAGA EM PROCESSO, pela mesma régua do servidor. E ela NÃO depende de
                `podeDecidirAlgo`: apresentar ao cliente não é decidir nada sobre a pessoa, é
                mandar o nome dela. Quem já saiu do processo é barrado dentro do formulário, por
                nome, porque a recusa do servidor é por contagem e não diz quem tirar. */}
            {emProcesso && (
              <Button
                variant="secondary"
                className="shrink-0 px-3 py-2"
                disabled={processando}
                title="Congela esta lista como a shortlist enviada ao cliente"
                onClick={() => {
                  setErro(null);
                  setAcao("SHORTLIST");
                }}
              >
                <Icon name="doc" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                {`Enviar shortlist (${selecionadas.length})`}
              </Button>
            )}
            {podeDecidirAlgo && (
              <>
                <Button
                  variant="secondary"
                  className="shrink-0 px-3 py-2"
                  disabled={processando}
                  onClick={() => {
                    setErro(null);
                    setAcao("MOVER");
                  }}
                >
                  <Icon name="arr" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                  {`Mover no funil (${selecionadas.length})`}
                </Button>
                <Button
                  variant="secondary"
                  className="shrink-0 px-3 py-2"
                  disabled={processando}
                  onClick={() => {
                    setErro(null);
                    setAcao("ENVIAR");
                  }}
                >
                  <Icon name="right" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                  {`Enviar para admissão (${selecionadas.length})`}
                </Button>
                <Button
                  variant="secondary"
                  className="shrink-0 px-3 py-2 text-danger"
                  disabled={processando}
                  onClick={() => {
                    setErro(null);
                    setAcao("DESVINCULAR");
                  }}
                >
                  <Icon name="x" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                  {`Desvincular da vaga (${selecionadas.length})`}
                </Button>
              </>
            )}
          </div>

          {acimaDoTeto && (
            <p className="basis-full text-[12px] text-warn">
              O sistema aplica no máximo {AS_MAXIMO_POR_LOTE} linhas por vez. Reduza a seleção antes
              de confirmar.
            </p>
          )}

          {/* O ERRO DO LOTE INTEIRO fica NA BARRA quando nenhuma confirmação está aberta, porque foi
              dali que a ação partiu e é ali que a seleção continua de pé. */}
          {erro && acao === null && (
            <p className="basis-full text-[12px] text-danger" role="alert">
              {erro}
            </p>
          )}
        </div>
      )}

      {acao === "FINALIZAR" && (
        <FinalizarEmLoteModal
          vaga={vaga}
          selecionadas={selecionadas}
          processando={processando}
          erro={erro}
          bloqueado={acimaDoTeto}
          onCancelar={() => setAcao(null)}
          onConfirmar={(lado, ciente) =>
            void executar("Finalizar Posição Em Massa", () =>
              finalizarPosicaoEmLote(ids, token, {
                // SEMPRE COM A VAGA: é o que liga as duas proteções do backend (lote inteiro
                // recusado com a vaga encerrada, linha recusada quando não é desta vaga).
                vagaId: vaga.id,
                lado,
                cienteBancoComOficiaisAbertas: ciente,
              }),
            )
          }
        />
      )}

      {acao === "MOVER" && (
        <MoverEmLoteModal
          selecionadas={selecionadas}
          processando={processando}
          erro={erro}
          bloqueado={acimaDoTeto}
          onCancelar={() => setAcao(null)}
          onConfirmar={(etapa) =>
            void executar("Mover Etapa Em Massa", () => moverEtapaEmLote(ids, etapa, token))
          }
        />
      )}

      {(acao === "DESVINCULAR" || acao === "ENVIAR") && (
        <SaidaEmLoteModal
          modo={acao}
          selecionadas={selecionadas}
          token={token}
          processando={processando}
          erro={erro}
          bloqueado={acimaDoTeto}
          onCancelar={() => setAcao(null)}
          onConfirmar={(situacao, motivo) =>
            void executar(
              situacao === "ENVIADO_PARA_ADMISSAO"
                ? "Enviar Para Admissão Em Massa"
                : "Desvincular Em Massa",
              () => registrarSaidaEmLote(ids, situacao, motivo, token),
            )
          }
        />
      )}

      {/* O ENVIO DA SHORTLIST NÃO PASSA PELO `executar` DAS OUTRAS: ele não é lote parcial (a rota
          aceita ou recusa a lista INTEIRA, numa transação só), então não tem `aplicadas` nem
          `falhas` para mostrar em `ResultadoLoteModal`. O que ele tem de próprio é a pergunta da
          lista curta, e ela vive dentro do formulário, que é onde o consultor está olhando. */}
      {acao === "SHORTLIST" && (
        <EnviarShortlistModal
          vagaId={vaga.id}
          selecionadas={selecionadas}
          enviadas={shortlists.shortlists}
          carregandoEnviadas={shortlists.carregando}
          token={token}
          onCancelar={() => setAcao(null)}
          onEnviada={() => {
            setAcao(null);
            // A LISTA DE ENVIOS É RELIDA AQUI, e não só quando alguém volta para a aba da vaga: é
            // dela que sai o número do PRÓXIMO envio, e sem a releitura um reenvio feito em
            // seguida abriria como se fosse a primeira lista, sem pedir o motivo.
            void shortlists.recarregar();
            onFeito();
          }}
        />
      )}

      {resultado && (
        <ResultadoLoteModal
          titulo={resultado.titulo}
          resultado={resultado.dados}
          nomes={resultado.nomes}
          onClose={() => setResultado(null)}
        />
      )}
    </>
  );
}

// ── AS TRÊS CONFIRMAÇÕES ────────────────────────────────────────────────────

/**
 * FINALIZAR POSIÇÃO EM MASSA: a única ação daqui que CONSOME a meta da vaga.
 *
 * OS DOIS LADOS SÃO CARTÕES COM O NÚMERO À VISTA, o mesmo desenho da ação individual: a escolha tem
 * duas opções e cada uma carrega um número que decide a resposta ("oficial: 1 de 5 preenchidas").
 * Num seletor recolhido, esses números só apareceriam depois de abrir a lista, que é exatamente
 * quando eles deixam de ajudar.
 *
 * A CIÊNCIA DO BANCO É COLETADA AQUI, ANTES, e essa é a diferença real para o individual. Lá, a
 * primeira tentativa vai sem ciência, o backend recusa com um 409 que traz o número, e a tela
 * pergunta. Em massa, esse mesmo 409 vira UMA FALHA POR LINHA: trinta recusas idênticas, e nenhuma
 * pergunta. Então a tela adianta a pergunta com o MESMO número que o backend mede, e o flag só vai
 * quando o consultor marcou. A trava continua sendo do backend, medida dentro da transação.
 */
function FinalizarEmLoteModal({
  vaga,
  selecionadas,
  processando,
  erro,
  bloqueado,
  onCancelar,
  onConfirmar,
}: {
  vaga: VagaListItem;
  selecionadas: AsCandidaturaItem[];
  processando: boolean;
  erro: string | null;
  bloqueado: boolean;
  onCancelar: () => void;
  onConfirmar: (lado: PosicaoLado, ciente: boolean) => void;
}) {
  const [lado, setLado] = useState<PosicaoLado>("OFICIAL");
  const [ciente, setCiente] = useState(false);

  const abertas = oficiaisAbertas(vaga);
  const pedeCiencia = lado === "BANCO" && abertas !== null && abertas > 0;
  /** Quem já entregou posição não entrega de novo: a linha vai falhar, e a tela avisa antes. */
  const jaEntregues = selecionadas.filter((c) => !podeFinalizarPosicao(c.situacao)).length;
  const alvos = selecionadas.length - jaEntregues;

  return (
    <ModalDeLote
      titulo="Finalizar Posição Em Massa"
      apoio={`${frasePessoas(alvos)} da seleção recebem uma posição desta vaga. Esta é a ação que consome a meta.`}
      acao="Finalizar posição"
      processando={processando}
      erro={erro}
      impedido={bloqueado || alvos === 0 || (pedeCiencia && !ciente)}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(lado, pedeCiencia && ciente)}
    >
      <Secao titulo="De Qual Lado Da Meta">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {POSICAO_LADOS.map((l) => {
            const meta = metaDoLado(vaga, l);
            const feitas = preenchidasDoLado(vaga, l);
            const escolhido = l === lado;
            return (
              <button
                key={l}
                type="button"
                disabled={processando}
                aria-pressed={escolhido}
                onClick={() => {
                  setLado(l);
                  // TROCAR DE LADO APAGA A CIÊNCIA: ela foi dada sobre o banco, com um número na
                  // frente, e carregá-la para uma escolha nova seria reaproveitar um aceite que
                  // ninguém deu para esta escolha.
                  setCiente(false);
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition",
                  escolhido
                    ? "border-[var(--accent)] bg-[var(--surface-2)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]",
                  processando && "opacity-60",
                )}
              >
                <span className="flex items-start justify-between gap-1.5">
                  <span className="text-[13px] font-semibold leading-tight text-text">
                    {POSICAO_LADO_LABEL[l]}
                  </span>
                  {escolhido && (
                    <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
                  )}
                </span>
                <span className="block text-[11.5px] text-faint">
                  {meta === null
                    ? "meta não informada"
                    : `${feitas} de ${meta} ${meta === 1 ? "posição preenchida" : "posições preenchidas"}`}
                </span>
              </button>
            );
          })}
        </div>

        {/* A CIÊNCIA DO BANCO, com o número na frente. Sem ela marcada, o botão não confirma. */}
        {pedeCiencia && (
          <label className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[rgba(214,168,69,0.12)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={ciente}
              onChange={(e) => setCiente(e.target.checked)}
              disabled={processando}
              className="mt-[3px] h-4 w-4 flex-none accent-[var(--accent)]"
            />
            <span className="text-[12px] leading-snug text-dim">
              Esta vaga ainda tem {abertas}{" "}
              {abertas === 1 ? "posição oficial aberta" : "posições oficiais abertas"}. Estou ciente
              de que estas pessoas vão para a reserva e de que a posição oficial continua em aberto.
              O aceite fica registrado no histórico de cada candidatura.
            </span>
          </label>
        )}
      </Secao>

      {/* O QUE A TELA JÁ SABE QUE VAI FALHAR, dito ANTES do clique, com as réguas que decidem os
          ícones de cada linha. O backend recusa de qualquer jeito; a tela existe para ensinar o
          caminho antes, em vez de devolver a recusa depois. */}
      {jaEntregues > 0 && (
        <AvisoDaSelecao>
          {frasePessoas(jaEntregues)} da seleção já entregaram uma posição desta vaga e vão voltar na
          lista de falhas. Só {frasePessoas(alvos)} recebem posição agora.
        </AvisoDaSelecao>
      )}

      <Secao titulo="O Que Muda Para Estas Pessoas">
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
          {CANDIDATURA_SITUACAO_AJUDA.ALOCADO} Finalizar a posição não envia ninguém para a admissão:
          o envio é o passo seguinte, e tem botão próprio nesta mesma barra.
        </p>
      </Secao>
    </ModalDeLote>
  );
}

/**
 * MOVER NO FUNIL EM MASSA. SÓ A ETAPA DE DESTINO, porque de onde cada pessoa sai é o que está
 * gravado nela: a seleção costuma misturar etapas de origem, e é exatamente por isso que o destino é
 * um só e a origem não é perguntada.
 *
 * TODAS AS ETAPAS ATIVAS SÃO OFERECIDAS, e isso espelha a régua do funil de hoje: ele deixou de ser
 * trilho em 27/08, e de qualquer etapa se vai para qualquer outra. A INATIVA fica de fora porque o
 * backend a recusa ("foi desativada e não recebe mais candidatos"), e num lote a recusa custaria a
 * linha de todo mundo. A única recusa possível por linha é a
 * pessoa já estar na etapa de destino, e ela volta na lista de falhas com a frase do backend.
 *
 * §A.35: `Select` do design system, nunca `<select>` cru.
 */
function MoverEmLoteModal({
  selecionadas,
  processando,
  erro,
  bloqueado,
  onCancelar,
  onConfirmar,
}: {
  selecionadas: AsCandidaturaItem[];
  processando: boolean;
  erro: string | null;
  bloqueado: boolean;
  onCancelar: () => void;
  onConfirmar: (etapa: CandidaturaEtapa) => void;
}) {
  /*
   * `ativas` PARA O SELETOR, `etapas` PARA O AVISO. O aviso "N já estão em X" fala da etapa que o
   * consultor ACABOU de escolher, então ela é sempre uma ativa; a lista completa entra aqui porque
   * `rotuloDaEtapa` é a mesma função em toda a tela e não deve ter duas fontes de rótulo.
   */
  const { etapas, ativas } = useEtapas();
  const [etapa, setEtapa] = useState<CandidaturaEtapa | "">("");
  /** Quem já saiu sem êxito não se move: a linha vai falhar, e a tela avisa antes. */
  const parados = selecionadas.filter((c) => !podeDecidir(c.situacao)).length;
  const alvos = selecionadas.length - parados;
  /** Quem JÁ está na etapa escolhida: o backend recusa o movimento para a própria etapa. */
  const jaEstao = etapa ? selecionadas.filter((c) => c.etapa === etapa).length : 0;

  return (
    <ModalDeLote
      titulo="Mover Etapa Em Massa"
      apoio={`${frasePessoas(alvos)} da seleção passam para a etapa escolhida. A situação de cada uma não muda.`}
      acao="Mover no funil"
      processando={processando}
      erro={erro}
      impedido={bloqueado || alvos === 0 || etapa === ""}
      onCancelar={onCancelar}
      onConfirmar={() => etapa && onConfirmar(etapa)}
    >
      <Secao titulo="Etapa De Destino">
        <Select
          value={etapa}
          onChange={(v) => setEtapa(v as CandidaturaEtapa)}
          options={ativas.map((e) => ({
            value: e.codigo,
            label: e.rotulo,
          }))}
          placeholder="Escolha para onde estas pessoas vão"
          ariaLabel="Etapa de destino"
          disabled={processando}
        />
        <p className="mt-2 text-[11.5px] text-faint">
          O funil não é um trilho: de qualquer etapa se vai para qualquer outra, para a frente e para
          trás. Quem já estiver na etapa escolhida volta na lista de falhas.
        </p>
      </Secao>

      {parados > 0 && (
        <AvisoDaSelecao>
          {frasePessoas(parados)} da seleção já saíram do processo e não se movem mais no funil. Elas
          vão voltar na lista de falhas.
        </AvisoDaSelecao>
      )}
      {jaEstao > 0 && (
        <AvisoDaSelecao>
          {frasePessoas(jaEstao)} da seleção já estão em {rotuloDaEtapa(etapa, etapas)}.
        </AvisoDaSelecao>
      )}
    </ModalDeLote>
  );
}

/**
 * DESVINCULAR EM MASSA e ENVIAR PARA ADMISSÃO EM MASSA: a MESMA rota de saída, com desfechos
 * diferentes, e por isso o mesmo componente com dois modos.
 *
 * O MOTIVO É OBRIGATÓRIO E É UM SÓ PARA O LOTE (é o que o servidor aceita, e é o mais prático: o
 * lote nasce de um desfecho comum). A régua é a MESMA da tela individual: botão desabilitado com
 * menos de dois caracteres ÚTEIS, e o texto vai APARADO. Medir a string crua deixaria `"   "` passar
 * daqui, e o motivo chegaria vazio ao histórico de trinta pessoas de uma vez.
 */
function SaidaEmLoteModal({
  modo,
  selecionadas,
  token,
  processando,
  erro,
  bloqueado,
  onCancelar,
  onConfirmar,
}: {
  modo: "DESVINCULAR" | "ENVIAR";
  selecionadas: AsCandidaturaItem[];
  token: string | null;
  processando: boolean;
  erro: string | null;
  bloqueado: boolean;
  onCancelar: () => void;
  onConfirmar: (situacao: SaidaEmLote, motivo: string) => void;
}) {
  const envio = modo === "ENVIAR";
  const [desvinculo, setDesvinculo] = useState<Extract<SaidaEmLote, "DESCARTADO" | "DESISTIU">>(
    "DESCARTADO",
  );
  const [motivo, setMotivo] = useState("");

  const situacao: SaidaEmLote = envio ? "ENVIADO_PARA_ADMISSAO" : desvinculo;
  const parados = selecionadas.filter((c) => !podeDecidir(c.situacao)).length;
  const alvos = selecionadas.length - parados;
  const motivoOk = motivo.trim().length >= 2;

  return (
    <ModalDeLote
      titulo={envio ? "Enviar Para Admissão Em Massa" : "Desvincular Em Massa"}
      apoio={
        envio
          ? `${frasePessoas(alvos)} da seleção vão para a esteira admissional. A posição da vaga fica preenchida por elas.`
          : `${frasePessoas(alvos)} da seleção saem desta vaga e voltam para o banco de candidatos. A posição volta a ficar livre.`
      }
      acao={envio ? "Enviar para admissão" : "Desvincular da vaga"}
      processando={processando}
      erro={erro}
      impedido={bloqueado || alvos === 0 || !motivoOk}
      perigo={!envio}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(situacao, motivo.trim())}
    >
      {!envio && (
        <Secao titulo="Motivo Da Saída">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DESVINCULO.map((d) => {
              const escolhido = d.situacao === desvinculo;
              return (
                <button
                  key={d.situacao}
                  type="button"
                  disabled={processando}
                  aria-pressed={escolhido}
                  onClick={() => {
                    setDesvinculo(d.situacao);
                    /* ─ TROCAR DE DESFECHO LIMPA O MOTIVO, e agora ele PRECISA limpar ──────────
                       O campo mudou de NATUREZA entre os dois: o descarte é um nome do catálogo, a
                       desistência é prosa. Mantido, o texto escrito em uma passaria carimbado com a
                       outra situação, e no sentido catálogo para prosa o valor sobreviveria para ser
                       gravado como explicação de um desfecho que ninguém explicou. É a mesma régua
                       que o `alternarSaida` da tela individual já segue. */
                    setMotivo("");
                  }}
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5 text-left transition",
                    escolhido
                      ? "border-[var(--accent)] bg-[var(--surface-2)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
                    processando && "opacity-60",
                  )}
                >
                  <span className="block text-[13px] font-semibold text-text">{d.rotulo}</span>
                  <span className="block text-[11.5px] text-faint">{d.apoio}</span>
                </button>
              );
            })}
          </div>
        </Secao>
      )}

      {/* ─ O MESMO CAMPO DA SAÍDA INDIVIDUAL, e o lote precisava dele tanto quanto ──────────────
          O LOTE NÃO É PORTA NOVA: `registrarSaidaEmLote` chama a MESMA `registrarSaida` linha a
          linha, então ele herda a conferência do catálogo. Texto livre aqui falharia trinta vezes
          de uma vez, com o motivo certo na cabeça de quem clicou e 400 em todas as linhas.

          QUEM DECIDE ENTRE SELETOR E CAIXA DE TEXTO É `motivoVemDoCatalogo`, dentro do componente:
          o descarte é CLASSIFICAÇÃO (catálogo), a desistência e o envio são PROSA. É por isso que a
          escolha do desfecho, logo acima, troca o campo abaixo sem nenhuma condição escrita aqui. */}
      <Secao
        titulo={
          envio
            ? "O Que A Admissão Precisa Saber"
            : motivoVemDoCatalogo(situacao)
              ? "O Motivo Do Descarte"
              : "O Detalhe Do Motivo"
        }
      >
        <CampoMotivoDaSaida
          situacao={situacao}
          valor={motivo}
          onChange={setMotivo}
          token={token}
          desabilitado={processando}
          alturaMinima="min-h-[92px]"
          semRotulo
          /* O LOTE NÃO OFERECE OS MOTIVOS QUE PEDEM A PRETENSÃO SALARIAL, e o servidor os RECUSA
             aqui: perguntada uma vez para valer por N pessoas, a pretensão gravaria um número falso
             em todas menos uma. Escondê-los é o que evita o consultor escolher o que vai ser
             recusado depois de marcar trinta linhas. No desfecho individual nada muda. */
          semMotivosQuePedemPretensao
          placeholder={
            envio
              ? "O que fechou o processo e o que a admissão precisa saber"
              : "Por que estas pessoas saíram do processo"
          }
        />
        <p className="mt-2 text-[11.5px] text-faint">
          {motivoVemDoCatalogo(situacao)
            ? "O motivo é obrigatório e vale para a seleção inteira: ele é gravado no histórico de cada uma das pessoas, e é o que alguém vai ler daqui a seis meses sem ter participado do processo. A lista é a do catálogo mantido pela administração, sem os motivos que pedem a pretensão salarial: esse valor é de cada pessoa, então esses descartes são registrados um a um, pela ficha do candidato."
            : "O motivo é obrigatório e vale para a seleção inteira: ele é gravado no histórico de cada uma das pessoas, e é o que alguém vai ler daqui a seis meses sem ter participado do processo. Escreva pelo menos dois caracteres."}
        </p>
      </Secao>

      {envio && (
        <Secao titulo="O Que Muda Para Estas Pessoas">
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
            {CANDIDATURA_SITUACAO_AJUDA.ENVIADO_PARA_ADMISSAO} O sistema confere quantas posições
            ainda cabem antes de gravar cada linha, e quem não couber volta na lista de falhas.
          </p>
        </Secao>
      )}

      {parados > 0 && (
        <AvisoDaSelecao>
          {frasePessoas(parados)} da seleção já saíram do processo e não aceitam decisão nova. Elas
          vão voltar na lista de falhas.
        </AvisoDaSelecao>
      )}

      {/* QUEM ESTÁ NA SELEÇÃO, dito por nome e situação. Em massa é fácil marcar uma linha a mais
          sem perceber, e a confirmação é o último lugar em que dá para ver antes de gravar. */}
      <Secao titulo="Quem Está Na Seleção">
        <ul className="ea-scroll flex max-h-[168px] flex-col gap-1.5 overflow-y-auto">
          {selecionadas.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
            >
              <span className="text-[12.5px] font-semibold text-text">{c.candidatoNome}</span>
              <StatusPill
                tone={tomDaSituacao(c.situacao)}
                label={CANDIDATURA_SITUACAO_LABEL[c.situacao]}
              />
            </li>
          ))}
        </ul>
      </Secao>
    </ModalDeLote>
  );
}

// ── AS PEÇAS COMPARTILHADAS DAS TRÊS CONFIRMAÇÕES ───────────────────────────

/**
 * A CASCA DAS TRÊS CONFIRMAÇÕES: cabeçalho, miolo rolante, erro e os dois botões.
 *
 * UMA CASCA SÓ, e não o `ConfirmDialog` do design system, porque as três precisam de ESCOLHA dentro
 * (o lado da meta, a etapa de destino, o motivo escrito), e aquele diálogo é de mensagem e resposta.
 * Três cascas próprias divergiriam de largura, de rodapé e de tratamento de erro no primeiro ajuste.
 */
function ModalDeLote({
  titulo,
  apoio,
  acao,
  processando,
  erro,
  impedido,
  perigo,
  onCancelar,
  onConfirmar,
  children,
}: {
  titulo: string;
  apoio: string;
  /** O rótulo do botão que confirma. Botão é AÇÃO, então escrita normal (§A.24). */
  acao: string;
  processando: boolean;
  erro: string | null;
  impedido: boolean;
  perigo?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal onClose={onCancelar} className="max-w-[620px] p-0" ariaLabel={titulo}>
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">{titulo}</h2>
          <p className="mt-1 text-[12.5px] text-dim">{apoio}</p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {children}
          {erro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button
            variant="secondary"
            className="px-4 py-2.5"
            onClick={onCancelar}
            disabled={processando}
          >
            Cancelar
          </Button>
          <Button
            /* O TOM DE PERIGO PRECISA SOBRESCREVER O `background` INTEIRO, e não só a cor: o
               `.btn-primary` do design system pinta um GRADIENTE (`background: var(--btn-grad)`), e
               um `bg-*` (que é `background-color`) fica ATRÁS da imagem do gradiente, invisível.
               Medido na homologação: o botão de desvincular saía azul. */
            className={cn("px-4 py-2.5", perigo && "[background:var(--danger)] text-white")}
            disabled={processando || impedido}
            onClick={onConfirmar}
          >
            {processando ? "Aplicando…" : acao}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** O aviso do que a tela já sabe que vai falhar. Amarelo de atenção, nunca vermelho de recusa. */
function AvisoDaSelecao({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12px] leading-snug text-dim">
      <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
      <span>{children}</span>
    </p>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text">{titulo}</h3>
      {children}
    </section>
  );
}

/** "1 pessoa" ou "N pessoas", com o plural calculado. §A.11: nada de "(s)" nem travessão. */
function frasePessoas(n: number): string {
  return n === 1 ? "1 pessoa" : `${n} pessoas`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// O MODO "APLICAR A TODOS DO FILTRO", SEM TETO (decisão do diretor, 07/10/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ A BARRA QUANDO "TODOS DO FILTRO" ESTÁ LIGADO ───────────────────────────────────────────────
 *
 * Aqui a ação NÃO manda ids: manda o FILTRO, e o servidor resolve o conjunto inteiro e age sobre
 * ele em blocos, sem o teto de 200 (que protege só o payload do modo de ids). O retorno é CONTAGEM
 * (`AsResultadoAcaoEmMassa`), nunca a lista de falhas com nome, que num conjunto de milhares seria
 * relatório de dado pessoal (§A.6).
 *
 * AS CREDENCIAIS FICAM DE FORA: "Enviar para admissão" dispara o link do Portal (uma credencial de
 * acesso ao prontuário) e "Enviar shortlist" manda nome ao cliente. Os dois exigem a PRÉVIA NOMINAL
 * de quem recebe o quê, que só existe na seleção por ids. Aqui eles aparecem desabilitados, com o
 * motivo no `title`, e o backend ainda recusa `ENVIADO_PARA_ADMISSAO` por filtro (defesa em
 * profundidade): a tela nem oferece.
 */
function AcoesPorFiltroDaVaga({
  vaga,
  aba,
  filtro,
  quantidade,
  token,
  onLimpar,
  onFeito,
}: {
  vaga: VagaListItem;
  aba?: AbaDaVaga;
  filtro: AlvoPorFiltroDaVaga;
  quantidade: number;
  token: string | null;
  onLimpar: () => void;
  onFeito: () => void;
}) {
  type AcaoFiltro = "FINALIZAR" | "MOVER" | "DESVINCULAR";
  const [acao, setAcao] = useState<AcaoFiltro | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ acao: AcaoFiltro; dados: AsResultadoAcaoEmMassa } | null>(
    null,
  );

  async function executar(tipo: AcaoFiltro, chamada: () => Promise<AsResultadoAcaoEmMassa>) {
    setErro(null);
    setProcessando(true);
    try {
      const dados = await chamada();
      setAcao(null);
      setResultado({ acao: tipo, dados });
      onFeito();
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao aplicar a ação em massa."));
    } finally {
      setProcessando(false);
    }
  }

  // Na aba de alocados todo mundo já entregou posição, então finalizar de novo não faz sentido.
  const mostrarFinalizar = aba !== "alocados";
  const credencialTitulo = "Enviar credencial exige seleção nominal, pessoa a pessoa";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
        <span className="text-[12.5px] text-dim">
          selecionadas:{" "}
          <span className="font-semibold tabular-nums text-text">{quantidade}</span>
        </span>
        <span className="text-[11.5px] text-faint">todas as do recorte</span>
        <button type="button" onClick={onLimpar} className="text-[12.5px] text-accent hover:underline">
          limpar seleção
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {mostrarFinalizar && (
            <Button
              variant="secondary"
              className="shrink-0 px-3 py-2"
              disabled={processando}
              title="Entrega a posição da vaga e consome a meta"
              onClick={() => {
                setErro(null);
                setAcao("FINALIZAR");
              }}
            >
              <Icon name="check" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
              {`Finalizar posição (${quantidade})`}
            </Button>
          )}
          {/* AS DUAS CREDENCIAIS, DESABILITADAS NO MODO FILTRO (a régua do diretor). */}
          <Button
            variant="secondary"
            className="shrink-0 px-3 py-2"
            disabled
            title={credencialTitulo}
          >
            <Icon name="doc" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
            Enviar shortlist
          </Button>
          <Button
            variant="secondary"
            className="shrink-0 px-3 py-2"
            disabled={processando}
            onClick={() => {
              setErro(null);
              setAcao("MOVER");
            }}
          >
            <Icon name="arr" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
            {`Mover no funil (${quantidade})`}
          </Button>
          <Button
            variant="secondary"
            className="shrink-0 px-3 py-2"
            disabled
            title={credencialTitulo}
          >
            <Icon name="right" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
            Enviar para admissão
          </Button>
          <Button
            variant="secondary"
            className="shrink-0 px-3 py-2 text-danger"
            disabled={processando}
            onClick={() => {
              setErro(null);
              setAcao("DESVINCULAR");
            }}
          >
            <Icon name="x" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
            {`Desvincular da vaga (${quantidade})`}
          </Button>
        </div>

        <p className="basis-full text-[12px] text-faint">
          Enviar credencial exige seleção nominal, então a shortlist e o envio para admissão ficam de
          fora enquanto o recorte inteiro está selecionado.
        </p>

        {erro && acao === null && (
          <p className="basis-full text-[12px] text-danger" role="alert">
            {erro}
          </p>
        )}
      </div>

      {acao === "FINALIZAR" && (
        <FinalizarPorFiltroModal
          vaga={vaga}
          quantidade={quantidade}
          processando={processando}
          erro={erro}
          onCancelar={() => setAcao(null)}
          onConfirmar={(lado, ciente) =>
            void executar("FINALIZAR", () =>
              finalizarPosicaoPorFiltro(filtro, token, {
                lado,
                cienteBancoComOficiaisAbertas: ciente,
              }),
            )
          }
        />
      )}

      {acao === "MOVER" && (
        <MoverPorFiltroModal
          quantidade={quantidade}
          processando={processando}
          erro={erro}
          onCancelar={() => setAcao(null)}
          onConfirmar={(etapa) =>
            void executar("MOVER", () => moverEtapaPorFiltro(filtro, etapa, token))
          }
        />
      )}

      {acao === "DESVINCULAR" && (
        <SaidaPorFiltroModal
          quantidade={quantidade}
          processando={processando}
          erro={erro}
          token={token}
          onCancelar={() => setAcao(null)}
          onConfirmar={(situacao, motivo) =>
            void executar("DESVINCULAR", () =>
              registrarSaidaPorFiltro(filtro, situacao, motivo, token),
            )
          }
        />
      )}

      {resultado && (
        <ResultadoPorFiltroModal
          acao={resultado.acao}
          dados={resultado.dados}
          onClose={() => setResultado(null)}
        />
      )}
    </>
  );
}

/** Milhar no padrão pt-BR, para "2.509" ler de longe em vez de "2509". */
function fmtNum(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

/**
 * ─ O AVISO DO TEMPO PELO VOLUME, E A ANIMAÇÃO ENQUANTO PROCESSA (§3.4 do mapa de alcance) ──────
 *
 * §A.11 (sem travessão) e §A.24 (o TÍTULO em title case, a frase de apoio em escrita normal). O
 * título é a tag que avisa do volume ("A Movimentação De 2.509 Candidatos Pode Levar Alguns
 * Instantes"); a animação enquanto `processando` diz que a tela não travou.
 */
function AvisoDeVolume({
  titulo,
  processando,
}: {
  titulo: string;
  processando: boolean;
}) {
  return (
    <p
      className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12px] leading-snug text-dim"
      aria-live="polite"
    >
      {processando ? (
        <Spinner />
      ) : (
        <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
      )}
      <span>
        <span className="font-semibold text-text">{titulo} </span>
        {processando
          ? "Processando em blocos. Não feche esta janela."
          : "O sistema aplica em blocos e confirma quantos foram ao terminar."}
      </span>
    </p>
  );
}

/** O anel que gira enquanto o lote grande roda. Decorativo, sai da árvore de acessibilidade. */
function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-[1px] h-3.5 w-3.5 flex-none animate-spin text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" />
    </svg>
  );
}

/** FINALIZAR POSIÇÃO POR FILTRO: a única ação daqui que CONSOME a meta da vaga. */
function FinalizarPorFiltroModal({
  vaga,
  quantidade,
  processando,
  erro,
  onCancelar,
  onConfirmar,
}: {
  vaga: VagaListItem;
  quantidade: number;
  processando: boolean;
  erro: string | null;
  onCancelar: () => void;
  onConfirmar: (lado: PosicaoLado, ciente: boolean) => void;
}) {
  const [lado, setLado] = useState<PosicaoLado>("OFICIAL");
  const [ciente, setCiente] = useState(false);
  const abertas = oficiaisAbertas(vaga);
  const pedeCiencia = lado === "BANCO" && abertas !== null && abertas > 0;

  return (
    <ModalDeLote
      titulo="Finalizar Posição Em Massa"
      apoio="Todas as candidaturas vivas do recorte recebem uma posição desta vaga. Esta é a ação que consome a meta."
      acao="Finalizar posição"
      processando={processando}
      erro={erro}
      impedido={pedeCiencia && !ciente}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(lado, pedeCiencia && ciente)}
    >
      <AvisoDeVolume
        titulo={`A Finalização De ${fmtNum(quantidade)} ${quantidade === 1 ? "Posição Pode" : "Posições Pode"} Levar Alguns Instantes`}
        processando={processando}
      />
      <Secao titulo="De Qual Lado Da Meta">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {POSICAO_LADOS.map((l) => {
            const meta = metaDoLado(vaga, l);
            const feitas = preenchidasDoLado(vaga, l);
            const escolhido = l === lado;
            return (
              <button
                key={l}
                type="button"
                disabled={processando}
                aria-pressed={escolhido}
                onClick={() => {
                  setLado(l);
                  setCiente(false);
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition",
                  escolhido
                    ? "border-[var(--accent)] bg-[var(--surface-2)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]",
                  processando && "opacity-60",
                )}
              >
                <span className="flex items-start justify-between gap-1.5">
                  <span className="text-[13px] font-semibold leading-tight text-text">
                    {POSICAO_LADO_LABEL[l]}
                  </span>
                  {escolhido && (
                    <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
                  )}
                </span>
                <span className="block text-[11.5px] text-faint">
                  {meta === null
                    ? "meta não informada"
                    : `${feitas} de ${meta} ${meta === 1 ? "posição preenchida" : "posições preenchidas"}`}
                </span>
              </button>
            );
          })}
        </div>

        {pedeCiencia && (
          <label className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[rgba(214,168,69,0.12)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={ciente}
              onChange={(e) => setCiente(e.target.checked)}
              disabled={processando}
              className="mt-[3px] h-4 w-4 flex-none accent-[var(--accent)]"
            />
            <span className="text-[12px] leading-snug text-dim">
              Esta vaga ainda tem {abertas}{" "}
              {abertas === 1 ? "posição oficial aberta" : "posições oficiais abertas"}. Estou ciente
              de que estas pessoas vão para a reserva e de que a posição oficial continua em aberto. O
              aceite fica registrado no histórico de cada candidatura.
            </span>
          </label>
        )}
      </Secao>

      <Secao titulo="O Que Muda Para Estas Pessoas">
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
          {CANDIDATURA_SITUACAO_AJUDA.ALOCADO} Quem já entregou posição ou já saiu do processo não é
          tocado, e entra na contagem do que não foi aplicado.
        </p>
      </Secao>
    </ModalDeLote>
  );
}

/** MOVER NO FUNIL POR FILTRO: só a etapa de destino, como no lote por ids. */
function MoverPorFiltroModal({
  quantidade,
  processando,
  erro,
  onCancelar,
  onConfirmar,
}: {
  quantidade: number;
  processando: boolean;
  erro: string | null;
  onCancelar: () => void;
  onConfirmar: (etapa: CandidaturaEtapa) => void;
}) {
  const { ativas } = useEtapas();
  const [etapa, setEtapa] = useState<CandidaturaEtapa | "">("");

  return (
    <ModalDeLote
      titulo="Mover Etapa Em Massa"
      apoio="Todas as candidaturas vivas do recorte passam para a etapa escolhida. A situação de cada uma não muda."
      acao="Mover no funil"
      processando={processando}
      erro={erro}
      impedido={etapa === ""}
      onCancelar={onCancelar}
      onConfirmar={() => etapa && onConfirmar(etapa)}
    >
      <AvisoDeVolume
        titulo={`A Movimentação De ${fmtNum(quantidade)} ${quantidade === 1 ? "Candidato Pode" : "Candidatos Pode"} Levar Alguns Instantes`}
        processando={processando}
      />
      <Secao titulo="Etapa De Destino">
        <Select
          value={etapa}
          onChange={(v) => setEtapa(v as CandidaturaEtapa)}
          options={ativas.map((e) => ({ value: e.codigo, label: e.rotulo }))}
          placeholder="Escolha para onde estas pessoas vão"
          ariaLabel="Etapa de destino"
          disabled={processando}
        />
        <p className="mt-2 text-[11.5px] text-faint">
          O funil não é um trilho: de qualquer etapa se vai para qualquer outra. Quem já saiu do
          processo ou já está na etapa escolhida não é movido, e entra na contagem do que não foi
          aplicado.
        </p>
      </Secao>
    </ModalDeLote>
  );
}

/** DESVINCULAR POR FILTRO: Descartado ou Desistiu, com motivo obrigatório para o recorte inteiro. */
function SaidaPorFiltroModal({
  quantidade,
  processando,
  erro,
  token,
  onCancelar,
  onConfirmar,
}: {
  quantidade: number;
  processando: boolean;
  erro: string | null;
  token: string | null;
  onCancelar: () => void;
  onConfirmar: (situacao: Extract<SaidaEmLote, "DESCARTADO" | "DESISTIU">, motivo: string) => void;
}) {
  const [desvinculo, setDesvinculo] = useState<Extract<SaidaEmLote, "DESCARTADO" | "DESISTIU">>(
    "DESCARTADO",
  );
  const [motivo, setMotivo] = useState("");
  const motivoOk = motivo.trim().length >= 2;

  return (
    <ModalDeLote
      titulo="Desvincular Em Massa"
      apoio="Todas as candidaturas vivas do recorte saem desta vaga e voltam para o banco de candidatos. A posição volta a ficar livre."
      acao="Desvincular da vaga"
      processando={processando}
      erro={erro}
      impedido={!motivoOk}
      perigo
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(desvinculo, motivo.trim())}
    >
      <AvisoDeVolume
        titulo={`O Desvínculo De ${fmtNum(quantidade)} ${quantidade === 1 ? "Candidato Pode" : "Candidatos Pode"} Levar Alguns Instantes`}
        processando={processando}
      />
      <Secao titulo="Motivo Da Saída">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DESVINCULO.map((d) => {
            const escolhido = d.situacao === desvinculo;
            return (
              <button
                key={d.situacao}
                type="button"
                disabled={processando}
                aria-pressed={escolhido}
                onClick={() => {
                  setDesvinculo(d.situacao);
                  setMotivo("");
                }}
                className={cn(
                  "rounded-xl border px-3.5 py-2.5 text-left transition",
                  escolhido
                    ? "border-[var(--accent)] bg-[var(--surface-2)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
                  processando && "opacity-60",
                )}
              >
                <span className="block text-[13px] font-semibold text-text">{d.rotulo}</span>
                <span className="block text-[11.5px] text-faint">{d.apoio}</span>
              </button>
            );
          })}
        </div>
      </Secao>

      <Secao
        titulo={motivoVemDoCatalogo(desvinculo) ? "O Motivo Do Descarte" : "O Detalhe Do Motivo"}
      >
        <CampoMotivoDaSaida
          situacao={desvinculo}
          valor={motivo}
          onChange={setMotivo}
          token={token}
          desabilitado={processando}
          alturaMinima="min-h-[92px]"
          semRotulo
          semMotivosQuePedemPretensao
          placeholder="Por que estas pessoas saíram do processo"
        />
        <p className="mt-2 text-[11.5px] text-faint">
          O motivo é obrigatório e vale para o recorte inteiro: ele é gravado no histórico de cada
          candidatura viva alcançada. Quem já saiu do processo não é tocado.
        </p>
      </Secao>
    </ModalDeLote>
  );
}

/**
 * ─ O RESULTADO DE UMA AÇÃO POR FILTRO: QUANTOS FORAM, E QUANTOS NÃO ────────────────────────────
 *
 * Contagem, nunca a lista nominal (§A.6): num conjunto de milhares, listar nome por nome seria
 * despejar dado pessoal na tela. É modal de LEITURA, então nasce com "Fechar" (§A.41).
 */
function ResultadoPorFiltroModal({
  acao,
  dados,
  onClose,
}: {
  acao: "FINALIZAR" | "MOVER" | "DESVINCULAR";
  dados: AsResultadoAcaoEmMassa;
  onClose: () => void;
}) {
  const { afetados, falharam } = dados;
  const participio =
    acao === "FINALIZAR"
      ? afetados === 1
        ? "Posição Finalizada"
        : "Posições Finalizadas"
      : acao === "MOVER"
        ? afetados === 1
          ? "Candidato Movido"
          : "Candidatos Movidos"
        : afetados === 1
          ? "Candidato Desvinculado"
          : "Candidatos Desvinculados";
  const verboFalha =
    acao === "FINALIZAR" ? "finalizadas" : acao === "MOVER" ? "movidos" : "desvinculados";
  const titulo = `${fmtNum(afetados)} ${participio}`;

  return (
    <Modal onClose={onClose} className="max-w-[520px] p-0" ariaLabel={titulo}>
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">{titulo}</h2>
        </div>
        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          <p className="text-[13px] leading-snug text-dim">
            {afetados === 0
              ? "Nenhuma candidatura do recorte aceitou esta ação."
              : "A ação foi aplicada ao recorte inteiro, em blocos."}
          </p>
          {falharam > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
              <span>
                {fmtNum(falharam)}{" "}
                {falharam === 1 ? "candidatura não foi" : "candidaturas não foram"} {verboFalha}:
                já estavam fora do processo ou já nesse estado, então o sistema não as tocou.
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
