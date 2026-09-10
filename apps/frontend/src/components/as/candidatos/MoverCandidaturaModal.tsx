"use client";

/**
 * MOVER A CANDIDATURA: o funil inteiro e os desfechos, no MESMO SELETOR de cards.
 *
 * ┌─ O QUE MUDOU E POR QUE (decisão do diretor, 27/08) ────────────────────────────────────────┐
 * │ A tela oferecia só a PRÓXIMA etapa, e da Captação isso era UM card: clicar ali era a única  │
 * │ coisa que dava para fazer, então "escolher" era uma palavra grande demais para o que a tela │
 * │ permitia. Voltar era impossível.                                                            │
 * │                                                                                             │
 * │ AGORA TODA ETAPA DO FUNIL É UM CARD, na ordem do processo, e o consultor clica no destino.  │
 * │ Para a frente, para trás e pulando quantas quiser: a operação real não é linear, e a régua  │
 * │ que fingia que era obrigava a etapa gravada a mentir sobre o processo.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS DESFECHOS ENTRAM NO MESMO SELETOR, e não em outra caixa: para quem opera, "para onde mando
 * esta pessoa" é UMA pergunta, e Descartado, Desistiu e Enviado Para Admissão são respostas dela
 * tanto quanto Triagem. Eles ficam ABAIXO do funil, porque são de outra natureza: a etapa é um lugar
 * e se desfaz, o desfecho é uma DECISÃO. A separação é o que diz isso sem precisar de aviso escrito.
 *
 * ─ DESVINCULAR COM MOTIVO (decisão do diretor) ───────────────────────────────────────────────
 *
 * O MECANISMO FICA, A APRESENTAÇÃO MUDA. Descartado e Desistiu sempre tiraram a pessoa da vaga e
 * sempre exigiram motivo; o que a tela chamava de "encerrar o processo" é, para quem opera,
 * DESVINCULAR o candidato da vaga. Os dois passam a viver na seção "Desvincular Da Vaga", e a
 * escolha entre eles passa a ser o MOTIVO de a pessoa ter saído, detalhado no texto livre.
 *
 * ENVIAR PARA A ADMISSÃO NÃO É DESVINCULAR, e por isso saiu do agrupamento para uma seção própria:
 * é o desfecho bem-sucedido, a pessoa continua ocupando a posição da vaga e avança para a esteira.
 * Ele não mudou em nada, nem no rótulo nem na frase (§A.14).
 *
 * NENHUM CAMINHO NOVO FOI ABERTO: mesma rota (`registrarSaida`), mesmo motivo obrigatório e mesmo
 * efeito na conta de posições. Um botão "desvincular" ao lado do que já fazia isso seria um segundo
 * caminho para o mesmo efeito, que é como duas regras para a mesma coisa começam a divergir.
 *
 * ─ O QUE A ETAPA 5 MUDOU AQUI, e por que era urgente ─────────────────────────────────────────
 *
 * ESTE MODAL CHAMAVA DE ENCERRADO QUEM NÃO ESTÁ. A régua era `situacao === "ATIVO"`, então quem
 * estivesse APROVADO ou ALOCADO recebia "esta candidatura já foi encerrada como Alocado e não se move
 * mais no funil", o oposto exato do modelo: o alocado PREENCHE a posição e CONTINUA no funil. O
 * defeito estava dormente só porque ninguém era alocado ainda; no dia em que o botão de entregar
 * posição passou a funcionar, ele viraria texto errado na tela.
 *
 * E "REGISTRAR CONTRATAÇÃO" VIROU "ENVIAR PARA ADMISSÃO" (decisão do diretor), no rótulo e em tudo
 * ao redor. A diferença entre os dois estados vizinhos é dita pela frase de
 * `CANDIDATURA_SITUACAO_AJUDA`, consumida do vocabulário compartilhado e nunca reescrita aqui.
 *
 * O DESFECHO NÃO DISPARA NO CLIQUE. Clicar num card de etapa move na hora, porque mover é reversível
 * (basta clicar em outra etapa). Clicar num desfecho ABRE o campo de motivo e espera a confirmação,
 * porque encerrar não se desfaz por clique.
 *
 * O MOTIVO É OBRIGATÓRIO NOS TRÊS DESFECHOS (ajuste 7 do diretor). Antes só o descarte o exigia, e
 * só aqui na tela: a rota aceitava desfecho sem motivo, então a régra furava por fora e o histórico
 * de etapas nasceria com buracos justamente nos eventos que mais precisam de explicação. Agora o DTO
 * exige junto (`RegistrarSaidaDto.motivo`), e esta tela é a camada que evita a viagem até o 400.
 *
 * O RÓTULO DO BOTÃO É POR DESFECHO, e não mais "Registrar saída" para os três (bug 3 do diretor).
 * O nome interno da operação do backend (`registrarSaida`, que cobre legitimamente os três) tinha
 * vazado para o rótulo, e quem clicava em Contratado era convidado a "registrar a saída" de alguém
 * que estava ENTRANDO. O mapa `SAIDA_ACAO` já existia e já dizia a palavra certa de cada um.
 *
 * A ETAPA ATUAL APARECE COMO CARD MARCADO E DESABILITADO, em vez de sumir da lista: some, e o
 * consultor perde a referência de onde a pessoa está bem na hora de decidir para onde ela vai.
 *
 * AS MENSAGENS DE TRAVA VÊM DO BACKEND, PRONTAS, e é a delas que a tela mostra. As quatro travas do
 * módulo (aprovar além das posições, alocar em vaga encerrada, duplicar candidatura e a corrida
 * entre dois consultores) já explicam o que aconteceu e o que fazer. Reescrever aqui daria duas
 * versões da mesma regra, e a da tela envelheceria primeiro.
 *
 * ─ VOLTAR PARA A SELEÇÃO: o desfazer do envio (decisão do diretor) ───────────────────────────
 *
 * A QUARTA SEÇÃO, e ela aparece EXATAMENTE onde a de enviar desaparece: quem já está enviado não
 * recebe o card de envio (a situação atual nunca vira card), e é só ele que recebe este botão. As
 * duas nunca convivem, e a simetria não é estética: a pergunta "para onde mando esta pessoa" e a
 * pergunta "como desfaço o que mandei" são a mesma decisão vista dos dois lados.
 *
 * ELA NÃO PEDE MOTIVO, e é a única seção de desfecho que não pede. O motivo que existia era o do
 * ENVIO, e a reversão o LIMPA da linha viva porque ele perdeu o referente: o histórico guarda o
 * original, com autor e data, e é de lá que a ficha continua contando essa parte da história.
 *
 * §A.11 (sem travessão), §A.24 (title case em título e rótulo de etapa).
 */

import { useState } from "react";
import {
  CANDIDATURA_SITUACAO_AJUDA,
  CANDIDATURA_SITUACAO_LABEL,
  ehSaidaSemExito,
  finalizaPosicao,
  type AsCandidaturaItem,
  type CandidaturaEtapa,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  aprovarCandidatura,
  mensagemDoErro,
  moverEtapa,
  registrarSaida,
  reverterEnvioParaAdmissao,
} from "@/lib/as-candidatos";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { ordemDaEtapa, rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { podeAprovar, podeMoverNoFunil, podeReverterEnvio } from "@/lib/as-vaga-acoes";
import { cn } from "@/lib/cn";

type Saida = "DESCARTADO" | "DESISTIU" | "ENVIADO_PARA_ADMISSAO";

/** As duas saídas que TIRAM a pessoa da vaga, e que passam a se apresentar como desvínculo. */
type Desvinculo = "DESCARTADO" | "DESISTIU";

/**
 * A RÉGUA CONTINUA SENDO A DO VOCABULÁRIO COMPARTILHADO: esta função só ENSINA AO TYPESCRIPT o que
 * `ehSaidaSemExito` já decide, para o compilador saber que o card do desvínculo nunca recebe o envio
 * para a admissão. Nenhuma lista nova, nenhuma segunda definição de quem encerra o processo.
 */
function ehDesvinculo(sa: Saida): sa is Desvinculo {
  return ehSaidaSemExito(sa);
}

/** Os três desfechos, na ordem em que aparecem. Encerramentos primeiro, avanço por último. */
const SAIDAS: Saida[] = ["DESCARTADO", "DESISTIU", "ENVIADO_PARA_ADMISSAO"];

export function MoverCandidaturaModal({
  candidatura,
  token,
  onClose,
  onFeito,
}: {
  candidatura: AsCandidaturaItem;
  token: string | null;
  onClose: () => void;
  onFeito: () => void;
}) {
  /*
   * DUAS LISTAS, E A DIFERENÇA É O QUE IMPEDE UM DEFEITO SILENCIOSO:
   *  . `ativas` desenha os CARDS. Oferecer uma etapa que o diretor tirou de circulação levaria a
   *    um 400 do backend ("foi desativada e não recebe mais candidatos") depois do clique.
   *  . `etapas` (a lista COMPLETA) resolve o rótulo e a POSIÇÃO da etapa atual. Se a pessoa está
   *    parada numa etapa que foi inativada depois, ela não está nas ativas, e calcular a posição
   *    dela ali daria "não encontrada": todos os cards diriam "Avançar para cá", inclusive os que
   *    ficam ATRÁS dela no funil.
   */
  const { etapas, ativas } = useEtapas();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [saidaAberta, setSaidaAberta] = useState<Saida | null>(null);
  const [motivo, setMotivo] = useState("");

  /** A etapa clicada enquanto a requisição não volta: só ela mostra o estado de espera, não a grade toda. */
  const [movendoPara, setMovendoPara] = useState<CandidaturaEtapa | null>(null);
  /*
   * ┌─ A RÉGUA DE QUEM SE MOVE, E O ERRO QUE ELA CORRIGE ────────────────────────────────────────┐
   * │ ERA `situacao === "ATIVO"`, E ISSO FAZIA A TELA CHAMAR DE ENCERRADO QUEM NÃO ESTÁ. Quem     │
   * │ estivesse APROVADO ou ALOCADO lia "esta candidatura já foi encerrada como Alocado e não se  │
   * │ move mais no funil", que é o oposto exato do modelo: o alocado PREENCHE a posição e         │
   * │ CONTINUA no funil, e o aprovado nem desfecho teve.                                          │
   * │                                                                                            │
   * │ SÃO DUAS PERGUNTAS DIFERENTES, e o defeito foi tratá-las como uma:                          │
   * │   `ehSaidaSemExito`   o processo desta pessoa ACABOU? (descartado, desistiu)                │
   * │   `podeMoverNoFunil`  ela anda de etapa AGORA? (o alocado anda: a régua é `candidaturaViva`, │
   * │                       espelhando a trava do backend, e mora em `as-vaga-acoes`)             │
   * │                                                                                            │
   * │ NENHUMA LISTA NOVA: a primeira é do vocabulário compartilhado, lida também pelo backend.    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const encerrada = ehSaidaSemExito(candidatura.situacao);
  const moveNoFunil = podeMoverNoFunil(candidatura.situacao);
  /** Os desfechos que fazem sentido oferecer AGORA: todos, menos o estado em que a pessoa já está. */
  const saidasOferecidas = SAIDAS.filter((sa) => sa !== candidatura.situacao);
  /**
   * OS DOIS GRUPOS, separados pela MESMA régua do vocabulário compartilhado (`ehSaidaSemExito`), e
   * não por uma lista escrita aqui. Desvincular e enviar para a admissão são de naturezas opostas:
   * um TIRA a pessoa da vaga e libera a posição, o outro a mantém ocupando a posição e a avança para
   * a esteira. Uma segunda lista nesta tela divergiria da régua no dia em que uma situação nova
   * entrasse, e divergiria justamente na conta de posições.
   */
  const desvinculosOferecidos = saidasOferecidas.filter(ehDesvinculo);
  const envioOferecido = saidasOferecidas.filter((sa) => !ehDesvinculo(sa));

  /**
   * ┌─ NENHUMA AÇÃO DE ESTADO EXECUTA EM UM CLIQUE SÓ (decisão do diretor, 27/08) ───────────────┐
   * │ A regra vale para TUDO que muda o estado do candidato, e não só para o que é definitivo:    │
   * │ mover de etapa, aprovar, descartar, desistir e contratar. O motivo é concreto: um clique    │
   * │ involuntário movia a pessoa sem ninguém perceber, e como a linha só mostra a etapa NOVA,    │
   * │ não havia como notar que ela tinha andado.                                                  │
   * │                                                                                             │
   * │ O FLUXO PASSA A SER: clicar em mover, escolher a etapa no card, CONFIRMAR, e só então move. │
   * │ Casa com o seletor de cards da OST anterior: o card escolhe o DESTINO, o diálogo pergunta   │
   * │ se é para ir.                                                                               │
   * │                                                                                             │
   * │ MOVER DE ETAPA NÃO É "danger", e os desfechos SÃO: mover se desfaz clicando em outro card,  │
   * │ encerrar não se desfaz. O tom do diálogo diz essa diferença sem precisar de aviso escrito.  │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * UM ESTADO SÓ PARA TODAS AS AÇÕES, e não um `useState` por botão: a confirmação guarda o texto e
   * a própria função a executar. Assim uma ação nova entra passando por aqui por construção, em vez
   * de alguém precisar lembrar de criar mais um par de estados.
   */
  const [confirmacao, setConfirmacao] = useState<{
    titulo: string;
    mensagem: string;
    rotulo: string;
    /*
     * O `warn` ENTROU COM A REVERSÃO, e é o tom que faltava aqui. `default` veste a ação de SUCESSO
     * (check azul) e `danger` a veste de IRREVERSÍVEL (vermelho); voltar alguém para a seleção não é
     * nenhum dos dois: é correção legítima, que o consultor tem o direito de fazer e mesmo assim
     * precisa parar para ler. O `ConfirmDialog` já servia os três tons, e nenhuma confirmação
     * existente muda de aparência por causa desta linha.
     */
    tone: "default" | "danger" | "warn";
    acao: () => Promise<unknown>;
    falha: string;
  } | null>(null);

  /**
   * ─ TROCAR DE CARD LIMPA O MOTIVO, e isso é integridade do histórico, não zelo de tela ─────────
   *
   * A CAIXA DE MOTIVO É UMA SÓ para os dois cards do desvínculo (e para o envio), de propósito: dois
   * campos dariam duas regras de obrigatoriedade para divergir. O preço disso é que o ESTADO também é
   * um só, e sem esta limpeza o texto escrito em "Descartado Pela Seleção" continuava no campo ao
   * clicar em "Desistiu Do Processo", pronto para ser enviado CARIMBADO COM A OUTRA SITUAÇÃO.
   *
   * O DANO SERIA SILENCIOSO E PERMANENTE: o motivo é o que o histórico do candidato vai mostrar daqui
   * a seis meses para quem nunca participou do processo, e um desfecho explicado pelo motivo do outro
   * é histórico falso, gravado sem nada falhar.
   *
   * FECHAR O CARD TAMBÉM LIMPA, pelo mesmo motivo: reabrir o card devolve o campo em branco, em vez de
   * ressuscitar um texto que o consultor já tinha abandonado.
   */
  function alternarSaida(sa: Saida) {
    setSaidaAberta((atual) => (atual === sa ? null : sa));
    setMotivo("");
  }

  /** Não executa: PERGUNTA. Quem chama descreve a ação, e o diálogo é quem dispara. */
  function pedirConfirmacao(c: NonNullable<typeof confirmacao>) {
    setErro(null);
    setConfirmacao(c);
  }

  async function executarConfirmada() {
    if (!confirmacao) return;
    const { acao, falha } = confirmacao;
    setErro(null);
    setOcupado(true);
    try {
      await acao();
      setConfirmacao(null);
      onFeito();
    } catch (err) {
      // O DIÁLOGO FECHA NO ERRO, e a mensagem do backend aparece no corpo do modal, que é onde o
      // consultor está olhando. Mantê-lo aberto por cima esconderia a frase que explica a recusa.
      setConfirmacao(null);
      setMovendoPara(null);
      setErro(mensagemDoErro(err, falha));
    } finally {
      setOcupado(false);
    }
  }

  /**
   * A CAIXA DO MOTIVO, UMA SÓ, usada pelos dois grupos.
   *
   * ELA APARECE DENTRO DO GRUPO DO CARD ABERTO, e é por isso que virou função em vez de ficar solta
   * no fim da seção: com os desfechos em dois grupos, uma caixa fixa embaixo apareceria longe do
   * card clicado (ou, pior, duplicada). Duplicar o JSX daria dois campos de motivo com duas regras
   * de obrigatoriedade para divergir.
   *
   * O MOTIVO É OBRIGATÓRIO NOS DOIS GRUPOS, e a tela é a PRIMEIRA barreira: o `@MinLength(2)` do DTO
   * continua sendo a segunda. Afrouxar aqui deixaria o histórico nascer com buraco justamente nos
   * eventos que mais precisam de explicação.
   */
  function caixaDeMotivo(sa: Saida) {
    return (
      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-dim">
            Motivo
            <span className="ml-1 text-danger">*</span>
          </span>
          <textarea
            className="ds-input min-h-[70px] resize-y"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={SAIDA_PLACEHOLDER[sa]}
          />
        </label>
        <div className="mt-3 flex justify-end">
          <Button
            className="px-4 py-2.5"
            disabled={ocupado || motivo.trim().length < 2}
            onClick={() =>
              pedirConfirmacao({
                titulo: `${SAIDA_TITULO[sa]}?`,
                mensagem: SAIDA_FRASE(sa, candidatura.candidatoNome),
                rotulo: SAIDA_ACAO[sa],
                // OS DESFECHOS SÃO "danger" e o movimento de etapa não é: desvincular e enviar para
                // a admissão não se desfazem clicando em outro lugar, mover se desfaz.
                tone: "danger",
                acao: () => registrarSaida(candidatura.id, sa, motivo.trim(), token),
                falha: SAIDA_FALHA[sa],
              })
            }
          >
            {SAIDA_ACAO[sa]}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal onClose={onClose} className="max-w-[760px] p-0" ariaLabel="Mover a candidatura">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-text">{candidatura.candidatoNome}</h2>
            <StatusPill
              tone={tomDaSituacao(candidatura.situacao)}
              label={CANDIDATURA_SITUACAO_LABEL[candidatura.situacao]}
            />
          </div>
          <p className="mt-1 text-[12.5px] text-dim">
            {candidatura.vagaNome ?? candidatura.vagaCodigo ?? "não informado"}. Etapa atual:{" "}
            {rotuloDaEtapa(candidatura.etapa, etapas)}.
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {encerrada ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-dim">
              Esta candidatura já foi encerrada como{" "}
              {CANDIDATURA_SITUACAO_LABEL[candidatura.situacao]} e não se move mais no funil.
              {candidatura.motivoDescarte
                ? ` Motivo registrado: ${candidatura.motivoDescarte}.`
                : ""}
            </p>
          ) : (
            <>
              {/* ─ O QUE A SITUAÇÃO ATUAL SIGNIFICA, DITO ANTES DE QUALQUER DECISÃO ─────────
                  A frase vem de `CANDIDATURA_SITUACAO_AJUDA`, do vocabulário compartilhado, e não é
                  reescrita aqui: `ALOCADO` e `ENVIADO_PARA_ADMISSAO` são vizinhos e fáceis de trocar,
                  e trocar um pelo outro grava no banco um fato que não aconteceu. Duas redações da
                  mesma diferença divergem no primeiro ajuste. */}
              <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
                <p className="text-[12.5px] leading-snug text-dim">
                  {CANDIDATURA_SITUACAO_AJUDA[candidatura.situacao]}
                </p>
                {/* ─ DESFAZER UMA ALOCAÇÃO ERRADA É DESVINCULAR COM MOTIVO ────────────────
                    A FRASE EXISTIA E NUNCA APARECEU PARA NINGUÉM. Ela nasceu aninhada dentro de
                    `!moveNoFunil`, e `podeMoverNoFunil` é `candidaturaViva`, o COMPLEMENTO EXATO de
                    `ehSaidaSemExito`: dentro deste ramo (o ramo de quem NÃO está encerrado) ele é
                    sempre verdadeiro, então a condição era sempre falsa e o bloco inteiro era código
                    morto. Quem mais perdia era justamente o ALOCADO, para quem a frase foi escrita.

                    A PERGUNTA CERTA NÃO É "QUEM NÃO SE MOVE NO FUNIL", É "QUEM OCUPA A POSIÇÃO".
                    A régua é `finalizaPosicao`, do vocabulário compartilhado (a posição foi
                    ENTREGUE?), a mesma que enche o cilindro da vaga: nenhuma régua nova foi escrita
                    aqui. O alocado se move no funil como todo mundo, e é ele que precisa saber como
                    devolver a posição que preencheu.

                    ELA FICA JUNTO DO QUE A SITUAÇÃO SIGNIFICA, e não dentro da seção do desvínculo:
                    é aqui que a pergunta nasce, logo depois de a tela dizer que a pessoa preenche a
                    posição. E APONTA para a seção abaixo em vez de oferecer botão próprio, porque o
                    gesto já existe lá e um segundo caminho para o mesmo efeito é como duas regras
                    para a mesma coisa começam a divergir. */}
                {finalizaPosicao(candidatura.situacao) && (
                  <p className="mt-2 text-[12px] leading-snug text-faint">
                    Para desfazer uma alocação errada, desvincule o candidato na seção abaixo
                    informando o motivo da saída.
                  </p>
                )}
              </div>
              {/* ── O SELETOR DE ETAPA: UM CARD POR ETAPA DO FUNIL ─────────────────────────
                  NA ORDEM DO PROCESSO (a coluna `ordem` do catálogo), da primeira à última, porque
                  é assim que o time lê o funil. Etapa nova cadastrada pelo diretor no meio do funil
                  aparece no meio, sem esta tela ser tocada. Cada card diz, na linha de apoio, o que aquele clique
                  significa em relação a onde a pessoa está: avançar, voltar ou o lugar atual. Sem
                  essa linha, "Triagem" é ambíguo para quem está na Entrevista.

                  ATÉ CINCO COLUNAS EM TELA LARGA, DUAS NO CELULAR: a fileira é o funil desenhado.
                  Com mais etapas do que colunas ela quebra em linhas, na ordem, e continua lendo
                  como funil. */}
              {moveNoFunil && (
              <Secao titulo="Mover No Funil">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {ativas.map((etapa) => {
                    const e = etapa.codigo;
                    const atual = e === candidatura.etapa;
                    // A COMPARAÇÃO É POR `ordem` DO CATÁLOGO, e não por posição no array desenhado:
                    // a etapa atual pode nem estar entre as ativas, e aí o array não teria posição
                    // para ela. Quem não é encontrada vai para o FIM (nunca para antes da primeira).
                    const posAtual = ordemDaEtapa(candidatura.etapa, etapas);
                    return (
                      <button
                        key={e}
                        type="button"
                        disabled={ocupado || atual}
                        aria-current={atual ? "step" : undefined}
                        onClick={() => {
                          setMovendoPara(e);
                          pedirConfirmacao({
                            titulo: `Mover Para ${etapa.rotulo}?`,
                            mensagem: `${candidatura.candidatoNome} sai de ${rotuloDaEtapa(candidatura.etapa, etapas)} e passa a ${etapa.rotulo}. Mover de etapa não aprova nem encerra ninguém, e dá para mover de novo depois.`,
                            rotulo: "Mover",
                            tone: "default",
                            acao: () => moverEtapa(candidatura.id, e, token),
                            falha: "Falha ao mover de etapa.",
                          });
                        }}
                        className={cn(
                          "flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition",
                          atual
                            ? "cursor-default border-[var(--accent)] bg-[var(--surface-2)]"
                            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]",
                          ocupado && !atual && "opacity-50",
                        )}
                      >
                        {/* §A.20: AQUI ERA UMA PILL, E ELA TRANSBORDAVA (defeito pego na prova
                            visual). A pill é `whitespace-nowrap` por natureza, e "Entrevista
                            Soulan" numa coluna de cinco vazava por cima do card vizinho. O ponto
                            colorido carrega a mesma leitura de estado que a pill dava, e o nome ao
                            lado pode quebrar em duas linhas em vez de escapar da caixa. */}
                        <span className="flex items-start justify-between gap-1.5">
                          <span className="flex min-w-0 items-start gap-1.5">
                            {/* O ponto reusa a MESMA marca da pill do sistema (`.pill .pd`), com o
                                tom vindo de `tomDaEtapa`, então a cor da etapa aqui é a mesma cor
                                da etapa na tabela. `!bg-transparent`, sem borda e sem espaço zera
                                a caixa da pill e deixa só o ponto: nenhuma cor nova entrou no
                                sistema por causa deste card. */}
                            <span className={cn("pill mt-0.5 !gap-0 !border-0 !bg-transparent !p-0", tomDaEtapa(e, etapas))}>
                              <span className="pd" />
                            </span>
                            <span className="text-[12.5px] font-semibold leading-tight text-text">
                              {etapa.rotulo}
                            </span>
                          </span>
                          {atual && <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />}
                        </span>
                        <span className="block text-[11px] text-faint">
                          {atual
                            ? "Etapa atual"
                            : movendoPara === e && ocupado
                              ? "Movendo…"
                              : etapa.ordem > posAtual
                                ? "Avançar para cá"
                                : "Voltar para cá"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-faint">
                  O movimento é livre: avance, volte ou pule quantas etapas precisar. Mover de etapa
                  não aprova nem encerra ninguém, só registra onde a pessoa está no processo.
                </p>
              </Secao>
              )}

              {/* A APROVAÇÃO É A OPERAÇÃO QUE CONSOME POSIÇÃO, e por isso ela mora na etapa de
                  Aprovação e não vem junto com o avanço: chegar na última etapa não aprova ninguém.

                  E SÓ APARECE EM SELEÇÃO, por integridade e não por coerência de tela: a rota de
                  aprovar NÃO exige situação nenhuma, então aprovar quem já está ALOCADO gravaria
                  `APROVADO` por cima da entrega, ou seja, DESFARIA a posição entregue com um clique
                  que parece inofensivo. Enquanto o modal escondia tudo de quem não era ATIVO, essa
                  porta estava fechada por acidente; abrindo o modal para o alocado, ela passa a ser
                  fechada de propósito (`podeAprovar`, com teste). */}
              {candidatura.etapa === "APROVACAO" && podeAprovar(candidatura.situacao) && (
                <Secao titulo="A Decisão">
                  <Button
                    className="px-4 py-2.5"
                    disabled={ocupado}
                    onClick={() =>
                      pedirConfirmacao({
                        titulo: "Aprovar Candidato?",
                        mensagem: `${candidatura.candidatoNome} passa a Aprovado e OCUPA uma posição da vaga. O sistema confere quantas ainda cabem antes de gravar.`,
                        rotulo: "Aprovar",
                        tone: "default",
                        acao: () => aprovarCandidatura(candidatura.id, token),
                        falha: "Falha ao aprovar.",
                      })
                    }
                  >
                    Aprovar candidato
                  </Button>
                  <p className="mt-2 text-[12px] text-faint">
                    Aprovar ocupa uma posição da vaga. O sistema confere quantas ainda cabem.
                  </p>
                </Secao>
              )}

              {/* ─ DESVINCULAR DA VAGA: as duas saídas sem êxito, apresentadas como MOTIVO ──────
                  ┌─ O QUE MUDOU (decisão do diretor) ────────────────────────────────────────────┐
                  │ O MECANISMO FICA, A APRESENTAÇÃO MUDA. Descartado e Desistiu sempre tiraram a  │
                  │ pessoa da vaga e sempre exigiram motivo; o que a tela chamava de "encerrar o   │
                  │ processo" é, do ponto de vista de quem opera, DESVINCULAR o candidato da vaga. │
                  │ Agora a seção pergunta o que a pessoa veio fazer, e a escolha entre as duas    │
                  │ saídas passa a ser o MOTIVO de ela ter saído.                                  │
                  │                                                                                │
                  │ NENHUM CAMINHO NOVO FOI ABERTO: é a mesma rota, o mesmo motivo obrigatório e o │
                  │ mesmo efeito na conta de posições. Um segundo botão que fizesse "o mesmo, mas  │
                  │ desvinculando" é como duas regras para a mesma coisa começam a divergir.       │
                  └────────────────────────────────────────────────────────────────────────────────┘

                  ENVIAR PARA A ADMISSÃO NÃO ENTRA AQUI, e por isso ganhou seção própria logo abaixo:
                  ele é o desfecho BEM-SUCEDIDO, não tira ninguém da vaga (a posição fica preenchida
                  por essa pessoa) e agrupá-lo com o desvínculo faria a tela chamar de saída o
                  avanço para a esteira admissional.

                  ELES NÃO DISPARAM NO CLIQUE: o card abre o campo de motivo e espera a confirmação,
                  porque desvincular não se desfaz clicando em outro lugar.

                  O APOIO DE CADA CARD É A FRASE DO VOCABULÁRIO COMPARTILHADO
                  (`CANDIDATURA_SITUACAO_AJUDA`), e não um resumo escrito aqui. Duas redações da
                  mesma diferença divergem no primeiro ajuste.

                  A SITUAÇÃO ATUAL NÃO VIRA CARD: oferecer "desistiu" a quem já consta como
                  desistente seria oferecer o lugar onde a pessoa já está. */}
              {desvinculosOferecidos.length > 0 && (
                <Secao titulo="Desvincular Da Vaga">
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-2",
                      desvinculosOferecidos.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1",
                    )}
                  >
                    {desvinculosOferecidos.map((sa) => (
                      <BotaoSaida
                        key={sa}
                        rotulo={DESVINCULO_MOTIVO[sa]}
                        apoio={CANDIDATURA_SITUACAO_AJUDA[sa]}
                        ativo={saidaAberta === sa}
                        onClick={() => alternarSaida(sa)}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-faint">
                    Escolha o motivo da saída e escreva o detalhe. O candidato sai da vaga e volta
                    para o banco de candidatos, a posição volta a ficar livre e o motivo fica no
                    histórico.
                  </p>
                  {saidaAberta !== null && ehDesvinculo(saidaAberta) && caixaDeMotivo(saidaAberta)}
                </Secao>
              )}

              {/* O DESFECHO BEM-SUCEDIDO, em seção própria: a pessoa não sai da vaga, ela AVANÇA
                  para a esteira admissional e a posição continua preenchida por ela. */}
              {envioOferecido.map((sa) => (
                <Secao key={sa} titulo="Enviar Para A Admissão">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <BotaoSaida
                      rotulo={SAIDA_ACAO[sa]}
                      apoio={CANDIDATURA_SITUACAO_AJUDA[sa]}
                      ativo={saidaAberta === sa}
                      onClick={() => alternarSaida(sa)}
                    />
                  </div>
                  {saidaAberta === sa && caixaDeMotivo(sa)}
                </Secao>
              ))}

              {/* ─ VOLTAR PARA A SELEÇÃO: o desfazer do envio, e SÓ para quem está enviado ──────
                  ┌─ POR QUE ELE EXISTE (decisão do diretor) ──────────────────────────────────────┐
                  │ MANDAR A PESSOA ERRADA PARA A ESTEIRA É ERRO DE CLIQUE, e erro de clique tem de │
                  │ ser desfeito por quem o cometeu, no minuto seguinte. Enquanto ele não é         │
                  │ desfeito, a pessoa errada segue OCUPANDO uma posição da vaga que precisa dela.  │
                  └────────────────────────────────────────────────────────────────────────────────┘

                  O RÓTULO DESCREVE O EFEITO, NÃO O MECANISMO: "Voltar para a seleção" é o que
                  acontece com a pessoa (ela volta a estar em seleção, na etapa em que parou, e volta
                  a contar em Candidatos Em Processo). "Reverter" é o nome da operação para quem
                  escreveu o código, e obrigaria o consultor a deduzir o que exatamente é revertido.
                  Botão é AÇÃO, então escrita normal (§A.24); o título da seção é TÍTULO, e é ele que
                  vai em title case.

                  ELE SÓ EXISTE PARA QUEM ESTÁ ENVIADO (`podeReverterEnvio`, espelho do backend).
                  Em qualquer outra situação a rota devolve 409, e um botão que só sabe dar 409 é
                  ruído que ensina o consultor a ignorar a tela.

                  NÃO DISPARA NO CLIQUE, como nenhuma ação de estado deste modal: ele PERGUNTA, e a
                  pergunta diz as três coisas que mudam (a etapa em que a pessoa volta a ficar, a
                  posição que fica livre e o motivo do envio, que sai da linha e fica no histórico).
                  Sem a última frase, o motivo sumiria da ficha sem ninguém ter sido avisado. */}
              {podeReverterEnvio(candidatura.situacao) && (
                <Secao titulo="Voltar Para A Seleção">
                  <Button
                    className="px-4 py-2.5"
                    disabled={ocupado}
                    onClick={() =>
                      pedirConfirmacao({
                        titulo: "Voltar Para A Seleção?",
                        mensagem: `${candidatura.candidatoNome} sai da esteira admissional e volta para a seleção, na etapa ${rotuloDaEtapa(candidatura.etapa, etapas)}, que é onde ela parou. A posição que ela ocupava fica livre na vaga. O motivo do envio sai da ficha e continua registrado no histórico, com quem reverteu.`,
                        rotulo: "Voltar para a seleção",
                        // `warn` e não `danger`: desfazer um envio errado é correção legítima, não
                        // acusação, e mesmo assim é decisão registrada, que se lê antes de confirmar.
                        tone: "warn",
                        acao: () => reverterEnvioParaAdmissao(candidatura.id, token),
                        falha: "Falha ao voltar o candidato para a seleção.",
                      })
                    }
                  >
                    Voltar para a seleção
                  </Button>
                  <p className="mt-2 text-[12px] text-faint">
                    Desfaz o envio para a admissão: a pessoa volta para a etapa em que estava, a
                    posição dela fica livre na vaga e o motivo do envio fica só no histórico.
                  </p>
                </Secao>
              )}
            </>
          )}

          {erro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}
        </div>

        <div className="flex flex-none justify-end border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      {/* O PORTÃO DE TODAS AS AÇÕES DE ESTADO. Ele é o `ConfirmDialog` do design system, o mesmo da
          Esteira, e não uma caixa própria desta tela: um jeito só de confirmar no sistema inteiro. */}
      <ConfirmDialog
        open={confirmacao !== null}
        title={confirmacao?.titulo ?? ""}
        message={confirmacao?.mensagem ?? ""}
        confirmLabel={confirmacao?.rotulo ?? "Confirmar"}
        tone={confirmacao?.tone ?? "default"}
        busy={ocupado}
        onConfirm={() => void executarConfirmada()}
        onCancel={() => {
          // DESISTIR NÃO PODE DEIXAR RASTRO: o card volta a dizer "Avançar para cá" em vez de ficar
          // marcado como se o movimento tivesse acontecido.
          setConfirmacao(null);
          setMovendoPara(null);
        }}
      />
    </Modal>
  );
}

/**
 * O título do diálogo de cada desfecho, em title case (§A.24).
 *
 * "REGISTRAR CONTRATAÇÃO" VIROU "ENVIAR PARA ADMISSÃO" (decisão do diretor). A palavra contratação
 * dava a entender um processo CONCLUÍDO, e é o oposto do que o estado significa: a pessoa foi para a
 * esteira admissional, a admissão COMEÇOU e ainda NÃO terminou. Quem já dizia isso certo era o
 * vocabulário compartilhado (`ENVIADO_PARA_ADMISSAO` e a frase de `CANDIDATURA_SITUACAO_AJUDA`); era
 * a tela que continuava com a palavra antiga, contando outra história na hora da decisão.
 */
const SAIDA_TITULO: Record<Saida, string> = {
  DESCARTADO: "Desvincular Da Vaga",
  DESISTIU: "Desvincular Da Vaga",
  ENVIADO_PARA_ADMISSAO: "Enviar Para Admissão",
};

/**
 * O MOTIVO DA SAÍDA, que é como as duas saídas sem êxito passam a se apresentar (decisão do
 * diretor). O gesto é um só, desvincular; o que o consultor escolhe no card é POR QUE a pessoa saiu,
 * e o texto livre logo abaixo detalha.
 *
 * É ETIQUETA QUE CLASSIFICA, então title case (§A.24), e não verbo: "Descartar" era o comando de uma
 * tela em que a escolha ERA a ação, e aqui a ação passou a ser o botão que confirma.
 */
const DESVINCULO_MOTIVO: Record<Desvinculo, string> = {
  DESCARTADO: "Descartado Pela Seleção",
  DESISTIU: "Desistiu Do Processo",
};

/** O rótulo do botão que confirma. Botão é AÇÃO, então escrita normal (§A.24). */
const SAIDA_ACAO: Record<Saida, string> = {
  DESCARTADO: "Desvincular da vaga",
  DESISTIU: "Desvincular da vaga",
  ENVIADO_PARA_ADMISSAO: "Enviar para admissão",
};

/**
 * O TEXTO DE APOIO DO CAMPO DE MOTIVO, por desfecho. Um placeholder genérico ("O que aconteceu")
 * convida a escrever "saiu", e o motivo é o que a linha do tempo vai mostrar daqui a seis meses para
 * quem nunca participou do processo.
 */
const SAIDA_PLACEHOLDER: Record<Saida, string> = {
  DESCARTADO: "Por que esta pessoa foi descartada",
  DESISTIU: "O que a pessoa disse ao desistir",
  ENVIADO_PARA_ADMISSAO: "O que fechou o processo e o que a admissão precisa saber",
};

/** A mensagem de falha por desfecho. O envio que falha não pode dizer "falha ao registrar saída". */
const SAIDA_FALHA: Record<Saida, string> = {
  DESCARTADO: "Falha ao desvincular o candidato da vaga.",
  DESISTIU: "Falha ao desvincular o candidato da vaga.",
  ENVIADO_PARA_ADMISSAO: "Falha ao enviar para a admissão.",
};

/**
 * A FRASE DIZ O QUE ACONTECE COM A VAGA, que é o que o consultor precisa saber antes de confirmar:
 * o desvínculo LIBERA posição, o envio para a admissão OCUPA.
 *
 * A FRASE DO ENVIO FOI REESCRITA JUNTO COM O RÓTULO, e não só o nome do estado: ela dizia "passa a
 * Contratado e sai do funil", duas coisas que o modelo não afirma mais. O que acontece é que a pessoa
 * vai para a esteira admissional, a admissão começa e ainda não termina, e a posição da vaga fica
 * preenchida por ela.
 *
 * A FRASE DO DESVÍNCULO DIZ O MOTIVO ESCOLHIDO E PARA ONDE A PESSOA VAI (decisão do diretor): ela
 * volta para o banco de candidatos, e o motivo é o que o histórico vai mostrar daqui a seis meses
 * para quem nunca participou do processo.
 */
function SAIDA_FRASE(saida: Saida, nome: string): string {
  if (saida === "ENVIADO_PARA_ADMISSAO") {
    return `${nome} vai para a esteira admissional: a admissão começa e ainda não termina. A posição da vaga fica preenchida por ela, e o sistema confere quantas posições ainda cabem antes de gravar.`;
  }
  return `${nome} sai desta vaga com o motivo ${DESVINCULO_MOTIVO[saida]} e volta para o banco de candidatos. A posição volta a ficar livre na vaga, o motivo fica no histórico, e trazer a pessoa de volta depois é uma candidatura nova.`;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text">{titulo}</h3>
      {children}
    </section>
  );
}

function BotaoSaida({
  rotulo,
  apoio,
  ativo,
  onClick,
}: {
  rotulo: string;
  apoio: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={
        ativo
          ? "rounded-xl border border-[var(--accent)] bg-[var(--surface-2)] px-3 py-2.5 text-left"
          : "rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
      }
    >
      <span className="block text-[13px] font-semibold text-text">{rotulo}</span>
      <span className="block text-[11.5px] text-faint">{apoio}</span>
    </button>
  );
}
