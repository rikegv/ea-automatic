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
 * esta pessoa" é UMA pergunta, e Descartado, Desistiu e Contratado são respostas dela tanto quanto
 * Triagem. Eles ficam num GRUPO PRÓPRIO, abaixo do funil, porque são de outra natureza: a etapa é
 * um lugar e se desfaz, o desfecho é uma DECISÃO e encerra o processo. O grupo separado é o que diz
 * isso sem precisar de aviso escrito.
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
 * §A.11 (sem travessão), §A.24 (title case em título e rótulo de etapa).
 */

import { useState } from "react";
import {
  CANDIDATURA_ETAPAS,
  CANDIDATURA_ETAPA_LABEL,
  CANDIDATURA_SITUACAO_LABEL,
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
} from "@/lib/as-candidatos";
import { tomDaEtapa, tomDaSituacao } from "@/lib/as-candidatos-visual";
import { cn } from "@/lib/cn";

type Saida = "DESCARTADO" | "DESISTIU" | "CONTRATADO";

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
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [saidaAberta, setSaidaAberta] = useState<Saida | null>(null);
  const [motivo, setMotivo] = useState("");

  /** A etapa clicada enquanto a requisição não volta: só ela mostra o estado de espera, não a grade toda. */
  const [movendoPara, setMovendoPara] = useState<CandidaturaEtapa | null>(null);
  const viva = candidatura.situacao === "ATIVO";

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
    tone: "default" | "danger";
    acao: () => Promise<unknown>;
    falha: string;
  } | null>(null);

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
            {CANDIDATURA_ETAPA_LABEL[candidatura.etapa]}.
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {!viva ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-dim">
              Esta candidatura já foi encerrada como{" "}
              {CANDIDATURA_SITUACAO_LABEL[candidatura.situacao]} e não se move mais no funil.
              {candidatura.motivoDescarte
                ? ` Motivo registrado: ${candidatura.motivoDescarte}.`
                : ""}
            </p>
          ) : (
            <>
              {/* ── O SELETOR DE ETAPA: UM CARD POR ETAPA DO FUNIL ─────────────────────────
                  NA ORDEM DO PROCESSO (`CANDIDATURA_ETAPAS`), da Captação à Aprovação, porque é
                  assim que o time lê o funil. Cada card diz, na linha de apoio, o que aquele clique
                  significa em relação a onde a pessoa está: avançar, voltar ou o lugar atual. Sem
                  essa linha, "Triagem" é ambíguo para quem está na Entrevista.

                  CINCO COLUNAS EM TELA LARGA, DUAS NO CELULAR: cabem numa fileira só, e a fileira é
                  o funil desenhado. */}
              <Secao titulo="Mover No Funil">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {CANDIDATURA_ETAPAS.map((e, i) => {
                    const atual = e === candidatura.etapa;
                    const posAtual = CANDIDATURA_ETAPAS.indexOf(candidatura.etapa);
                    return (
                      <button
                        key={e}
                        type="button"
                        disabled={ocupado || atual}
                        aria-current={atual ? "step" : undefined}
                        onClick={() => {
                          setMovendoPara(e);
                          pedirConfirmacao({
                            titulo: `Mover Para ${CANDIDATURA_ETAPA_LABEL[e]}?`,
                            mensagem: `${candidatura.candidatoNome} sai de ${CANDIDATURA_ETAPA_LABEL[candidatura.etapa]} e passa a ${CANDIDATURA_ETAPA_LABEL[e]}. Mover de etapa não aprova nem encerra ninguém, e dá para mover de novo depois.`,
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
                            <span className={cn("pill mt-0.5 !gap-0 !border-0 !bg-transparent !p-0", tomDaEtapa(e))}>
                              <span className="pd" />
                            </span>
                            <span className="text-[12.5px] font-semibold leading-tight text-text">
                              {CANDIDATURA_ETAPA_LABEL[e]}
                            </span>
                          </span>
                          {atual && <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />}
                        </span>
                        <span className="block text-[11px] text-faint">
                          {atual
                            ? "Etapa atual"
                            : movendoPara === e && ocupado
                              ? "Movendo…"
                              : i > posAtual
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

              {/* A APROVAÇÃO É A OPERAÇÃO QUE CONSOME POSIÇÃO, e por isso ela mora na etapa de
                  Aprovação e não vem junto com o avanço: chegar na última etapa não aprova ninguém. */}
              {candidatura.etapa === "APROVACAO" && (
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

              {/* OS DESFECHOS, no mesmo seletor e em grupo próprio: mesma pergunta ("para onde
                  mando esta pessoa"), natureza diferente (a etapa se desfaz, o desfecho encerra).
                  Por isso eles NÃO disparam no clique: abrem o campo de motivo e esperam. */}
              <Secao titulo="Encerrar O Processo">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <BotaoSaida
                    rotulo="Descartar"
                    apoio="Encerra sem êxito"
                    ativo={saidaAberta === "DESCARTADO"}
                    onClick={() =>
                      setSaidaAberta(saidaAberta === "DESCARTADO" ? null : "DESCARTADO")
                    }
                  />
                  <BotaoSaida
                    rotulo="Desistiu"
                    apoio="A pessoa saiu do processo"
                    ativo={saidaAberta === "DESISTIU"}
                    onClick={() => setSaidaAberta(saidaAberta === "DESISTIU" ? null : "DESISTIU")}
                  />
                  <BotaoSaida
                    rotulo="Contratado"
                    apoio="Ocupa uma posição"
                    ativo={saidaAberta === "CONTRATADO"}
                    onClick={() =>
                      setSaidaAberta(saidaAberta === "CONTRATADO" ? null : "CONTRATADO")
                    }
                  />
                </div>

                {saidaAberta && (
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
                        placeholder={SAIDA_PLACEHOLDER[saidaAberta]}
                      />
                    </label>
                    <div className="mt-3 flex justify-end">
                      <Button
                        className="px-4 py-2.5"
                        disabled={ocupado || motivo.trim().length < 2}
                        onClick={() =>
                          pedirConfirmacao({
                            titulo: `${SAIDA_TITULO[saidaAberta]}?`,
                            mensagem: SAIDA_FRASE(saidaAberta, candidatura.candidatoNome),
                            rotulo: SAIDA_ACAO[saidaAberta],
                            // OS DESFECHOS SÃO "danger" e o movimento de etapa não é: encerrar não
                            // se desfaz clicando em outro lugar, mover se desfaz.
                            tone: "danger",
                            acao: () =>
                              registrarSaida(
                                candidatura.id,
                                saidaAberta,
                                motivo.trim(),
                                token,
                              ),
                            falha: SAIDA_FALHA[saidaAberta],
                          })
                        }
                      >
                        {SAIDA_ACAO[saidaAberta]}
                      </Button>
                    </div>
                  </div>
                )}
              </Secao>
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

/** O título do diálogo de cada desfecho, em title case (§A.24). */
const SAIDA_TITULO: Record<Saida, string> = {
  DESCARTADO: "Descartar Candidato",
  DESISTIU: "Registrar Desistência",
  CONTRATADO: "Registrar Contratação",
};

/** O rótulo do botão que confirma. Botão é AÇÃO, então escrita normal (§A.24). */
const SAIDA_ACAO: Record<Saida, string> = {
  DESCARTADO: "Descartar",
  DESISTIU: "Registrar desistência",
  CONTRATADO: "Registrar contratação",
};

/**
 * O TEXTO DE APOIO DO CAMPO DE MOTIVO, por desfecho. Um placeholder genérico ("O que aconteceu")
 * convida a escrever "saiu", e o motivo é o que a linha do tempo vai mostrar daqui a seis meses para
 * quem nunca participou do processo.
 */
const SAIDA_PLACEHOLDER: Record<Saida, string> = {
  DESCARTADO: "Por que esta pessoa foi descartada",
  DESISTIU: "O que a pessoa disse ao desistir",
  CONTRATADO: "Para qual posição, e o que fechou a contratação",
};

/** A mensagem de falha por desfecho. Contratar que falha não pode dizer "falha ao registrar saída". */
const SAIDA_FALHA: Record<Saida, string> = {
  DESCARTADO: "Falha ao descartar o candidato.",
  DESISTIU: "Falha ao registrar a desistência.",
  CONTRATADO: "Falha ao registrar a contratação.",
};

/**
 * A FRASE DIZ O QUE ACONTECE COM A VAGA, que é o que o consultor precisa saber antes de confirmar:
 * descarte e desistência LIBERAM posição, contratação OCUPA. As três encerram o processo da pessoa.
 */
function SAIDA_FRASE(saida: Saida, nome: string): string {
  if (saida === "CONTRATADO") {
    return `${nome} passa a Contratado, OCUPA uma posição da vaga e sai do funil. O sistema confere quantas posições ainda cabem antes de gravar.`;
  }
  const verbo = saida === "DESCARTADO" ? "é descartada" : "consta como desistente";
  return `${nome} ${verbo} e o processo dela encerra. A posição volta a ficar livre na vaga, e reabrir depois é uma candidatura nova.`;
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
