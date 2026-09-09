"use client";

/**
 * ─ O PAINEL DA VAGA: A VAGA INTEIRA EM UM LUGAR SÓ (etapa 4 da tela unificada de vagas) ────────
 *
 * ┌─ O QUE ELE RESOLVE ─────────────────────────────────────────────────────────────────────────┐
 * │ Ver uma vaga custava três cliques em três lugares: o olho abria a ficha, o funil abria a      │
 * │ lista de candidatos, e "em que pé está o processo" não existia em lugar nenhum. Quem quisesse │
 * │ responder "esta vaga já entregou o que prometeu?" tinha de ler o cilindro da tabela, abrir a  │
 * │ lista de candidatos, contar na mão e lembrar se a vaga estava fechada. Agora é uma caixa só:  │
 * │ os DADOS da vaga, a TRILHA (em que pé ela está) e QUEM está nela.                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ETAPA 4 ENTREGOU A CASCA, SÓ DE LEITURA. A ETAPA 5 É A QUE AGE, e as ações nasceram exatamente
 * nas abas que aquela casca criou: alocar alguém na vaga, cadastrar quem ainda não está na base,
 * entregar uma posição, mover no funil e abrir a ficha. Entregar a forma antes das ações foi o que
 * permitiu validar o desenho sem arriscar a operação, e é por isso que nada aqui precisou mudar de
 * lugar para as ações caberem.
 *
 * TODA REGRA DE "ESTA AÇÃO ESTÁ DISPONÍVEL AGORA?" MORA EM `@/lib/as-vaga-acoes`, com teste, e não
 * dentro deste componente. Uma ação oferecida onde o backend recusa vira um botão que só sabe falhar;
 * uma ação escondida onde o backend aceita vira um beco. As duas falhas são invisíveis na revisão de
 * um componente de 400 linhas e triviais de afirmar em um teste de uma linha.
 *
 * AS AÇÕES REAPROVEITAM OS MODAIS DA CENTRAL DE CANDIDATOS, INTEIROS: alocar, cadastrar, mover e a
 * ficha são os MESMOS componentes daquela tela, com a vaga já escolhida. Reescrevê-los aqui daria
 * duas telas de cadastro de candidato, dois dedup de CPF e dois seletores de etapa de entrada, que
 * divergiriam no primeiro ajuste. O único componente novo é o de FINALIZAR POSIÇÃO, porque essa
 * operação não existia em tela nenhuma.
 *
 * A FICHA DA VAGA CONTINUA NA PÁGINA, E CHEGA COMO `children`. Ela é feita de 38 campos que dependem
 * de uma dúzia de formatadores locais da Central de Vagas (moeda, listas com escape, rótulo de tempo
 * de contrato, nome da UF). Arrastá-los para cá seria mover código VALIDADO de lugar para não
 * acrescentar nada (§A.26): o painel só decide ONDE a ficha aparece, e ela continua sendo escrita
 * onde sempre foi.
 *
 * A TRILHA NÃO TEM ROTA NOVA. Ela é derivada do que a listagem de vagas já trouxe, pela régua de
 * `@/lib/as-vaga-trilha`, que por sua vez lê a contagem de posições por `preenchidas`, a MESMA peça
 * que enche o cilindro da tabela. É isso que garante que a trilha nunca discorde da coluna Posições.
 *
 * OS CANDIDATOS SÃO CARREGADOS SÓ QUANDO A ABA É ABERTA, e a preguiça aqui tem duas razões
 * concretas. A primeira é que abrir a ficha de uma vaga não deveria custar uma consulta que talvez
 * ninguém queira. A segunda é de PERMISSÃO: a lista vem de `GET /as/candidatos/vaga/:id`, que
 * pertence ao menu `as-candidatos`, então um consultor que só tem a Central de Vagas recebe 403.
 * Carregando sob demanda, quem nunca abre a aba nunca vê erro nenhum, e quem abre recebe a mensagem
 * do próprio backend, que é a régua da casa para erro (`mensagemDoErro`).
 *
 * §A.6, E A MINIMIZAÇÃO NÃO AFROUXA AQUI: o painel da vaga NÃO devolve CPF. A lista mostra nome,
 * etapa, situação e datas do processo, e a tela NÃO hidrata as linhas com fichas: puxar a ficha de
 * todo mundo para preencher colunas traria o CPF da vaga inteira para o navegador e desfaria, em uma
 * linha, o que o backend construiu.
 *
 * A FICHA (que MOSTRA o CPF) SÓ ABRE POR CLIQUE DELIBERADO, UMA PESSOA POR VEZ, que é a mesma régua
 * da Central de Candidatos: o número sai do backend só na rota da ficha, e só de quem foi aberto.
 * Nenhuma URL desta tela carrega dado de pessoa, e nenhuma busca daqui manda CPF (a alocação segue
 * pelo `id`, que sempre foi a chave da tabela).
 *
 * §A.11 (sem travessão, célula vazia é "não informado"), §A.12 (máscara única de tabela: título
 * centralizado, divisória entre colunas, ícone dinâmico por estado), §A.20 (nada esmagado, a tabela
 * rola dentro do próprio contêiner), §A.24 (title case em título, aba e tag; botão é ação),
 * §A.29 (toda tabela nasce ordenável, pelo `useOrdenacao` que já existe).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CANDIDATURA_ETAPAS,
  CANDIDATURA_ETAPA_LABEL,
  CANDIDATURA_SITUACOES,
  CANDIDATURA_SITUACAO_LABEL,
  VAGA_STATUS_LABEL,
  candidaturaViva,
  finalizaPosicao,
  type AsCandidaturaItem,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { dataBr, dataHoraBr, mensagemDoErro, painelDaVaga } from "@/lib/as-candidatos";
import { tomDaEtapa, tomDaSituacao, tomDoStatusVaga } from "@/lib/as-candidatos-visual";
import { trilhaDaVaga } from "@/lib/as-vaga-trilha";
import { fraseDoFechamentoForcado } from "@/lib/as-vaga-fechamento";
import { fraseDaReducaoDeMeta } from "@/lib/as-vaga-meta";
import {
  podeDecidir,
  podeFinalizarPosicao,
  podeMoverNoFunil,
  vagaRecebeCandidato,
} from "@/lib/as-vaga-acoes";
import { AlocarCandidatoModal } from "@/components/as/candidatos/AlocarCandidatoModal";
import { NovoCandidatoModal } from "@/components/as/candidatos/NovoCandidatoModal";
import { MoverCandidaturaModal } from "@/components/as/candidatos/MoverCandidaturaModal";
import { FichaCandidatoModal } from "@/components/as/candidatos/FichaCandidatoModal";
import { FinalizarPosicaoModal } from "@/components/as/vagas/FinalizarPosicaoModal";
import { cn } from "@/lib/cn";

type Aba = "vaga" | "candidatos" | "alocados";

const ABAS: { id: Aba; rotulo: string; icone: IconName }[] = [
  { id: "vaga", rotulo: "A Vaga", icone: "doc" },
  { id: "candidatos", rotulo: "Ver Candidatos", icone: "users" },
  { id: "alocados", rotulo: "Ver Candidatos Alocados", icone: "check" },
];

export function VagaPainelModal({
  vaga,
  token,
  onClose,
  onMudou,
  children,
}: {
  vaga: VagaListItem;
  token: string | null;
  onClose: () => void;
  /**
   * AVISA A CENTRAL DE VAGAS DE QUE A VAGA MUDOU, e não é enfeite: o cilindro de posições, a trilha
   * e os cards da tela lem `ocupacao`, que é DERIVADA das candidaturas. Entregar uma posição aqui
   * dentro sem avisar lá fora deixaria o cabeçalho deste painel (que também lê a trilha) discordando
   * da tabela atrás dele, na mesma tela e ao mesmo tempo.
   */
  onMudou: () => void;
  /** A ficha completa da vaga, escrita na Central de Vagas. Vira o conteúdo da aba "A Vaga". */
  children: ReactNode;
}) {
  const [aba, setAba] = useState<Aba>("vaga");
  const [candidaturas, setCandidaturas] = useState<AsCandidaturaItem[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /*
   * ─ AS AÇÕES, CADA UMA COM O SEU ALVO ────────────────────────────────────────────────────────
   * Um estado por ação, e não um só com um discriminador: elas abrem componentes diferentes, com
   * argumentos diferentes, e um estado único obrigaria cada leitura a conferir de que tipo é o alvo
   * antes de usá-lo. `null` quer dizer fechado, em todos.
   */
  const [alocarAberto, setAlocarAberto] = useState(false);
  const [cadastrarAberto, setCadastrarAberto] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [moverAlvo, setMoverAlvo] = useState<AsCandidaturaItem | null>(null);
  const [finalizarAlvo, setFinalizarAlvo] = useState<AsCandidaturaItem | null>(null);

  const trilha = trilhaDaVaga(vaga);
  const precisaDaLista = aba === "candidatos" || aba === "alocados";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const painel = await painelDaVaga(vaga.id, token);
      setCandidaturas(painel.candidaturas);
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar os candidatos desta vaga."));
    } finally {
      setCarregando(false);
    }
  }, [vaga.id, token]);

  /*
   * UMA CONSULTA SÓ PARA AS DUAS ABAS. A lista de alocados é um RECORTE da mesma resposta, filtrado
   * por `finalizaPosicao`, e não uma segunda leitura: duas consultas para o mesmo dado dariam duas
   * fotografias, tiradas em instantes diferentes, que é como uma aba passa a discordar da outra.
   */
  useEffect(() => {
    if (precisaDaLista && candidaturas === null && !carregando && erro === null) void carregar();
  }, [precisaDaLista, candidaturas, carregando, erro, carregar]);

  /**
   * O QUE ACONTECE DEPOIS DE QUALQUER AÇÃO QUE ESCREVE, em um lugar só: fecha o que estava aberto,
   * relê a lista desta vaga e avisa a Central de Vagas.
   *
   * UMA FUNÇÃO SÓ PARA AS CINCO AÇÕES, e não um `onFeito` escrito em cada uma: a que esquecesse o
   * `onMudou` deixaria o cilindro da tabela parado enquanto a lista aqui dentro já tivesse andado, e
   * esse tipo de esquecimento não falha, só mente.
   */
  function aposAcao() {
    setAlocarAberto(false);
    setCadastrarAberto(false);
    setMoverAlvo(null);
    setFinalizarAlvo(null);
    void carregar();
    onMudou();
  }

  const lista = candidaturas ?? [];
  const alocados = lista.filter((c) => finalizaPosicao(c.situacao));
  const titulo = vaga.nomeDivulgacao ?? "Vaga Sem Nome De Divulgação";
  /** A vaga encerrada não recebe candidato novo (trava 2 do backend), então nem oferece o botão. */
  const recebeCandidato = vagaRecebeCandidato(vaga.status);

  return (
    <Modal onClose={onClose} className="max-w-[1040px] p-0" ariaLabel="Painel da vaga">
      <div className="flex max-h-[88vh] flex-col">
        {/* ── TOPO FIXO: quem é a vaga e em que pé ela está ───────────────── */}
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-text">{titulo}</h2>
            <StatusPill
              tone={tomDoStatusVaga(vaga.status)}
              label={VAGA_STATUS_LABEL[vaga.status]}
            />
          </div>
          {/* A LINHA DE IDENTIFICAÇÃO É A MESMA DE ANTES, palavra por palavra (§A.14): ela é o único
              lugar da tela em que a data de abertura e quem abriu aparecem, e reescrevê-la para
              caber cliente e cargo (que a ficha já mostra) apagaria os dois. */}
          <p className="mt-1 text-[12.5px] text-dim">
            Código {vaga.codigo ?? "não informado"}. Aberta em {dataBr(vaga.dataAbertura)} por{" "}
            {vaga.abertoPorNome ?? "não informado"}.
          </p>

          {/* ── A TRILHA: OS DOIS EIXOS, LADO A LADO E NUNCA EM FILA ─────────
              Um em cima do outro pareceria sequência ("primeiro o processo, depois o desfecho"), e
              a régua diz o contrário: eles andam independentes. Lado a lado, a leitura é a que o
              desenho pede, "o processo está assim, e o desfecho está assado". */}
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

          {/* ── A TRILHA DO FECHAMENTO FORÇADO ────────────────────────────────
              SÓ APARECE QUANDO ALGUÉM FORÇOU, que é a exceção e não o normal: a imensa maioria das
              vagas fecha com as posições oficiais preenchidas e não tem nada a mostrar aqui. Uma
              linha vazia dizendo "não foi forçada" acrescentaria ruído em todas as vagas para
              informar sobre nenhuma.

              ELA FICA ABAIXO DOS DOIS EIXOS, E NÃO DENTRO DO "Desfecho", porque não é o estado da
              vaga: é COMO o estado foi alcançado. Dentro do card ela competiria com a frase que
              explica o desfecho; embaixo, ela qualifica os dois.

              §A.6: nome de usuário INTERNO, data e um número de posições. Nenhum dado de candidato. */}
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

          {/* ── A TRILHA DA META REDUZIDA ─────────────────────────────────────
              MESMO LUGAR E MESMO TRATAMENTO VISUAL DO FECHAMENTO FORÇADO, porque é a MESMA natureza
              de informação: nenhum dos dois é o estado da vaga, os dois dizem COMO o estado foi
              alcançado. Separá-los em caixas diferentes faria a mesma pergunta ("esta vaga fechou
              porque entregou, ou porque encolheram a meta?") ser respondida em dois lugares.

              O ARRAY VAZIO É O CASO COMUM E NÃO OCUPA ESPAÇO NENHUM: a imensa maioria das vagas
              nunca teve a meta reduzida, e uma linha dizendo "a meta nunca mudou" acrescentaria
              ruído em todas para informar sobre nenhuma.

              TODAS AS REDUÇÕES APARECEM, da mais antiga para a mais recente, na ordem em que o
              contrato entrega. Guardar só a última contaria uma história falsa: quem baixou de 5
              para 3 e depois de 3 para 1 apareceria como quem baixou de 3 para 1.

              §A.6: nome de usuário INTERNO, data e quatro números de posições. Nenhum dado de
              candidato. */}
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

          {/* ── AS ABAS ──────────────────────────────────────────────────────
              O `.tab` do design system, o mesmo da Esteira: um jeito só de trocar de aba no
              sistema. A contagem só aparece depois de a lista chegar, porque antes disso ela seria
              um número inventado. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {ABAS.map((a) => {
              const conta =
                candidaturas === null
                  ? null
                  : a.id === "candidatos"
                    ? lista.length
                    : a.id === "alocados"
                      ? alocados.length
                      : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={cn("tab", aba === a.id && "active")}
                  onClick={() => setAba(a.id)}
                  aria-pressed={aba === a.id}
                >
                  <span className="dot" />
                  <Icon
                    name={a.icone}
                    className="mr-1.5 inline h-3.5 w-3.5 flex-none align-middle"
                  />
                  {a.rotulo}
                  {conta !== null && (
                    <span className="ml-1.5 tabular-nums text-faint">{conta}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── MIOLO ROLANTE ───────────────────────────────────────────────── */}
        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {aba === "vaga" && children}

          {precisaDaLista && (
            <>
              {erro && (
                <p
                  className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
                  role="alert"
                >
                  {erro}
                </p>
              )}
              {carregando && (
                <p className="text-[13px] text-faint">Carregando quem está nesta vaga.</p>
              )}
              {/* ─ A BARRA DE AÇÕES DA VAGA, só na aba da lista completa ────────────────────
                  Ela não aparece na aba de alocados de propósito: lá a lista é o RECORTE de quem já
                  entregou posição, e trazer alguém novo não é uma operação daquele recorte, é da
                  vaga. Repetir os botões nas duas abas faria a mesma ação parecer duas.

                  DOIS CAMINHOS, PORQUE SÃO DUAS SITUAÇÕES DIFERENTES: a pessoa já está na base (e aí
                  é procurar) ou ainda não está (e aí é cadastrar). Um botão só obrigaria a procurar
                  antes de descobrir que não tem quem procurar, que é justamente o caminho mais comum
                  na captação. Os dois abrem os modais da Central de Candidatos, com ESTA vaga já
                  escolhida. */}
              {aba === "candidatos" && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] text-dim">
                    {recebeCandidato
                      ? "Traga alguém para esta vaga procurando na base ou cadastrando na hora."
                      : `Esta vaga está ${VAGA_STATUS_LABEL[vaga.status]} e não recebe candidato novo. A lista abaixo continua consultável.`}
                  </p>
                  {recebeCandidato && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        className="px-3.5 py-2"
                        onClick={() => setCadastrarAberto(true)}
                      >
                        <Icon name="plus" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                        Cadastrar candidato
                      </Button>
                      <Button className="px-3.5 py-2" onClick={() => setAlocarAberto(true)}>
                        <Icon name="users" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                        Alocar candidato
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!carregando && !erro && candidaturas !== null && (
                <TabelaCandidaturas
                  itens={aba === "candidatos" ? lista : alocados}
                  apoio={
                    aba === "candidatos"
                      ? frasePainel(lista)
                      : "Quem preencheu uma posição desta vaga, contado pela situação da candidatura."
                  }
                  vazio={
                    aba === "candidatos"
                      ? "Ninguém foi vinculado a esta vaga ainda."
                      : "Ninguém foi marcado como alocado nesta vaga ainda."
                  }
                  onFicha={(c) => setFichaId(c.candidatoId)}
                  onMover={(c) => setMoverAlvo(c)}
                  onFinalizar={(c) => setFinalizarAlvo(c)}
                />
              )}
            </>
          )}
        </div>

        {/* ── RODAPÉ ──────────────────────────────────────────────────────────
            SÓ "Fechar". O clone da vaga vive na coluna Ações da Central de Vagas, e repeti-lo aqui
            era o MESMO `clonarVaga` chamado de dois lugares (decisão do diretor, 08/09/2026). */}
        <div className="flex flex-none items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      {/* ─ OS MODAIS DAS AÇÕES, SOBREPOSTOS AO PAINEL ────────────────────────────────────────
          Sobrepor, e não navegar, é a régua que a Central de Candidatos já usa (o "Ver vaga" da
          ficha virou modal por cima pelo mesmo motivo): navegar custa o contexto inteiro, e voltar
          obriga a reabrir a vaga, achar a aba e reencontrar a pessoa. Fechar devolve o painel do
          jeito que ele estava, com a aba e a ordenação preservadas.

          TODOS CHAMAM `aposAcao`, que relê a lista e avisa a Central de Vagas. */}
      {alocarAberto && (
        <AlocarCandidatoModal
          /* SÓ ESTA VAGA NA LISTA, e ela já vem escolhida: o painel é de UMA vaga, e oferecer as
             outras aqui seria abrir, de dentro do painel de uma vaga, a alocação em outra. */
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

      {moverAlvo && (
        <MoverCandidaturaModal
          candidatura={moverAlvo}
          token={token}
          onClose={() => setMoverAlvo(null)}
          onFeito={aposAcao}
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
          /* A FICHA TAMBÉM ESCREVE (registra contato), então ela avisa pelo mesmo caminho. Ela NÃO
             fecha sozinha: quem abriu a ficha está lendo, e fechá-la a cada anotação tiraria a
             pessoa de onde ela está. */
          onMudou={() => {
            void carregar();
            onMudou();
          }}
          /* SÓ A VAGA DESTE PAINEL. A ficha usa o mapa para oferecer o "Ver vaga" de cada
             candidatura da pessoa, e desabilita o botão de quem não está no mapa: quem tem processo
             em outra vaga vê a linha, e o descritivo daquela outra continua na Central de Vagas. */
          vagaPorId={new Map([[vaga.id, vaga]])}
        />
      )}
    </Modal>
  );
}

/** Quantas pessoas estão na vaga e quantas seguem no processo. Texto de apoio, escrita normal. */
function frasePainel(lista: AsCandidaturaItem[]): string {
  if (lista.length === 0) return "Nenhuma candidatura registrada nesta vaga.";
  const vivos = lista.filter((c) => candidaturaViva(c.situacao)).length;
  const total =
    lista.length === 1 ? "1 candidatura registrada" : `${lista.length} candidaturas registradas`;
  return `${total}, sendo ${vivos} ainda no processo. Quem já saiu continua na lista, como histórico.`;
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
 * A TABELA DE CANDIDATURAS, uma só, usada pelas DUAS abas com listas diferentes.
 *
 * DUAS TABELAS SERIAM DUAS MANUTENÇÕES: a aba de alocados mostra exatamente as mesmas colunas, com
 * um recorte a menos de linhas, e a segunda cópia divergiria da primeira no primeiro ajuste de
 * largura.
 *
 * A ORDENAÇÃO ESCOLHIDA ATRAVESSA AS DUAS ABAS, e isso é consequência de ser uma tabela só: React
 * reaproveita a mesma instância ao trocar de aba, então a coluna ordenada continua ordenada do outro
 * lado. É coerente, porque as colunas são as mesmas, e evita que a lista de alocados volte à ordem
 * padrão toda vez que alguém alterna para conferir a lista completa.
 *
 * §A.20: a tabela tem largura mínima e rola DENTRO do próprio contêiner. Sem isso, ela espremeria a
 * coluna de situação, que carrega o rótulo mais longo do vocabulário ("Enviado Para Admissão").
 */
function TabelaCandidaturas({
  itens,
  apoio,
  vazio,
  onFicha,
  onMover,
  onFinalizar,
}: {
  itens: AsCandidaturaItem[];
  apoio: string;
  vazio: string;
  /** Abre a ficha da PESSOA (é a única superfície do módulo que mostra CPF, §A.6). */
  onFicha: (c: AsCandidaturaItem) => void;
  onMover: (c: AsCandidaturaItem) => void;
  onFinalizar: (c: AsCandidaturaItem) => void;
}) {
  /*
   * §A.29: ordenação pelo `useOrdenacao` que já existe, nunca à mão.
   *
   * ETAPA E SITUAÇÃO ORDENAM PELO CATÁLOGO, e não pelo rótulo em ordem alfabética: o funil tem uma
   * ordem de vida (Captação antes de Triagem antes de Aprovação), e ordenar por texto colocaria
   * "Aprovação" na frente de "Captação", dizendo o contrário do processo.
   *
   * QUEM SAIU DO FUNIL VAI PARA O FIM da ordenação por etapa, pela mesma razão de a coluna não
   * mostrar etapa nenhuma nesse caso: a etapa dele é memória, e não posição atual.
   */
  const colunas: ColOrd<AsCandidaturaItem>[] = [
    { chave: "candidato", tipo: "texto", valor: (c) => c.candidatoNome },
    {
      chave: "etapa",
      tipo: "status",
      valor: (c) =>
        candidaturaViva(c.situacao)
          ? CANDIDATURA_ETAPAS.indexOf(c.etapa)
          : CANDIDATURA_ETAPAS.length,
    },
    {
      chave: "situacao",
      tipo: "status",
      valor: (c) => CANDIDATURA_SITUACOES.indexOf(c.situacao),
    },
    { chave: "entrou", tipo: "data", valor: (c) => c.alocadoEm },
    { chave: "movimentou", tipo: "data", valor: (c) => c.atualizadoEm },
  ];
  const ord = useOrdenacao(colunas, itens);

  if (itens.length === 0) {
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
        <table className="ds-table min-w-[860px]">
          <thead>
            <tr>
              {/* §A.20: as larguras foram redistribuídas para a coluna de Ações caber SEM tirar
                  espaço de quem carrega texto longo. Quem cedeu foram as duas colunas de data, que
                  têm largura de sobra para "08/09/2026 19:12", e a de situação continua com o
                  rótulo mais longo do vocabulário ("Enviado Para Admissão") sem quebrar. */}
              <ColunaOrdenavel as="th" ord={ord} chave="candidato" className="w-[24%] text-center">
                Candidato
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="etapa" className="w-[15%] text-center">
                Etapa
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="situacao" className="w-[19%] text-center">
                Situação
              </ColunaOrdenavel>
              {/* Os rótulos das duas colunas de tempo quebram em duas linhas quando aperta, em vez
                  de pedir largura mínima grande e empurrar a tabela para fora (§A.20). */}
              <ColunaOrdenavel as="th" ord={ord} chave="entrou" className="w-[15%] text-center">
                <span className="whitespace-normal">Entrou Em</span>
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="movimentou" className="w-[15%] text-center">
                <span className="whitespace-normal">Última Movimentação</span>
              </ColunaOrdenavel>
              {/* AÇÕES FICA FORA DA ORDENAÇÃO (§A.29): não há o que comparar entre dois grupos de
                  botões, e a mesma exceção já vale na Central de Candidatos. */}
              <th className="w-[12%] text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {ord.itens.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold">{c.candidatoNome}</td>
                {/* A ETAPA SÓ APARECE ENQUANTO A CANDIDATURA ESTÁ VIVA, a mesma régua da Central de
                    Candidatos: mostrá-la depois do desfecho desenharia o descartado dentro do
                    funil, como se ele ainda estivesse em seleção. */}
                <td className="text-center">
                  <span className="inline-flex justify-center">
                    {candidaturaViva(c.situacao) ? (
                      <StatusPill
                        tone={tomDaEtapa(c.etapa)}
                        label={CANDIDATURA_ETAPA_LABEL[c.etapa]}
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
                <td className="whitespace-nowrap text-center tabular-nums">
                  {dataHoraBr(c.alocadoEm)}
                </td>
                <td className="whitespace-nowrap text-center tabular-nums">
                  {dataHoraBr(c.atualizadoEm)}
                </td>
                {/* AÇÕES SÓ EM ÍCONE, com o rótulo por extenso em `title` e `aria-label`, na mesma
                    forma da Central de Candidatos: o ícone é o atalho de quem conhece a tela, e o
                    rótulo continua alcançável pelo mouse e pelo leitor de tela.

                    CADA AÇÃO APARECE SÓ QUANDO EXISTE, e quem decide são as réguas testadas de
                    `as-vaga-acoes`. Botão que só sabe falhar é pior do que botão ausente: ele gasta
                    o clique, devolve uma recusa e não diz o que fazer no lugar. */}
                <td>
                  <div className="flex items-center justify-center gap-1">
                    <AcaoIcone
                      icone="eye"
                      titulo="Ver a ficha"
                      descricao={`Ver a ficha de ${c.candidatoNome}`}
                      onClick={() => onFicha(c)}
                    />
                    {/* A MESMA PORTA, COM O NOME DO QUE ELA ABRE AGORA. Para quem está em seleção
                        ela é o movimento no funil; para quem já foi entregue, o que resta lá dentro
                        é a decisão (encerrar ou enviar para a admissão), e chamá-la de "mover"
                        esconderia o passo seguinte do alocado atrás de uma palavra que não é a
                        dele. O modal é o mesmo, e é ele que mostra o que cabe em cada caso. */}
                    {podeDecidir(c.situacao) && (
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * O BOTÃO DE AÇÃO EM ÍCONE, na mesma forma da Central de Candidatos (`AcaoIcone` daquela página).
 *
 * ELE É REESCRITO AQUI, E ISSO É DELIBERADO: o de lá é uma função interna do `page.tsx` daquela tela,
 * não exportada, e movê-lo para o design system para reusar em dois lugares mexeria em código
 * VALIDADO fora do escopo desta etapa (§A.14/§A.26). São doze linhas sem estado nem regra; promovê-lo
 * a componente do DS é uma limpeza legítima, e fica PROPOSTA, não feita por conta própria.
 */
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
