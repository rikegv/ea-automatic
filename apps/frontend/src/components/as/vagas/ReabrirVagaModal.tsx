"use client";

/**
 * ─ REABRIR VAGA: A ÚNICA TELA QUE DESFAZ UM ENCERRAMENTO OU UMA ENTREGA (peça 2 da onda B3) ────
 *
 * ┌─ DOIS CAMINHOS DESDE 30/09, E A DIFERENÇA NÃO É COSMÉTICA ─────────────────────────────────┐
 * │ CANCELADA  desfaz um encerramento. É o caminho original, palavra por palavra.               │
 * │ ENTREGUE   desfaz uma ENTREGA, e o caso é o cliente que REPROVOU o que recebeu. Aqui a tela  │
 * │            pede uma PREVISÃO DE ENTREGA NOVA, e o motivo é a régua da SLA: ela é uma         │
 * │            contagem REGRESSIVA até a previsão, e em contagem regressiva NÃO EXISTE "zerar",  │
 * │            existe PRAZO NOVO. Sem prazo novo a vaga reabriria contra a previsão antiga, que  │
 * │            quase sempre já passou, e nasceria "Prazo Vencido" sem ninguém ter atrasado nada. │
 * │                                                                                             │
 * │ E A TELA DIZ O QUE VAI ACONTECER: a vaga volta para Aberta e os candidatos do funil voltam   │
 * │ para Triagem. Quem clica precisa saber disso ANTES de confirmar, e não depois de descobrir   │
 * │ que a triagem recomeçou.                                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA É ──────────────────────────────────────────────────────────────────────────────┐
 * │ Fechar e cancelar LEVAM a vaga ao estado terminal. Esta é a primeira que VOLTA de lá, e é   │
 * │ por isso que ela é de MASTER inteiro, por decisão do diretor: cancelar é do consultor,      │
 * │ desfazer o cancelamento não é.                                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O MASTER ESCOLHE UM A UM, E ESSA É A TRAVA, NÃO UM DETALHE DE CONFORTO ─────────────────────
 *
 * Não existe "restaurar todos". A escolha pessoa a pessoa É o mecanismo de segurança do caminho
 * antigo: ali o sistema ADMITE que não sabe quem saiu por causa do cancelamento, e quem decide é
 * gente, lendo motivo e data de cada saída. Um botão de marcar tudo devolveria à vaga, com um
 * clique, quem a SELEÇÃO descartou por mérito.
 *
 * ─ A `origem` MUDA O QUE A TELA AFIRMA, e é aí que a peça se ganha ou se perde ────────────────
 *
 * `COM_ORIGEM`         o cancelamento carimbou onde cada um estava. A tela PODE prometer volta
 *                      exata, porque o dado existe.
 * `SEM_ORIGEM`         cancelamento anterior ao carimbo. A tela diz, com todas as letras, que o
 *                      sistema NÃO SABE onde cada pessoa estava nem se ela saiu por causa do
 *                      cancelamento, e que quem for escolhido volta EM SELEÇÃO. Não se suaviza:
 *                      é justamente por não saber que a escolha vira responsabilidade de quem marca.
 * `NINGUEM_DESCARTADO` o cancelamento não encerrou ninguém. Lista vazia, a tela diz isso e NÃO
 *                      OFERECE NADA. Mostrar aqui os outros descartados da vaga é o furo que a
 *                      auditoria vetou: ofereceria para ressurreição quem a seleção recusou.
 *
 * E SÃO QUATRO FRASES, NÃO TRÊS: o `SEM_ORIGEM` com a LISTA VAZIA existe na base (medido na vaga
 * cancelada `1234567` da homologação) e não pode falar de "quem você marcar" embaixo de uma lista
 * sem ninguém. Por isso a frase é uma RÉGUA COM TESTE (`@/lib/as-vaga-reabertura`) e não um mapa
 * dentro deste componente: prometer demais aqui é a única forma de esta tela errar, e é uma falha
 * que não quebra nada.
 *
 * ─ O BOTÃO NÃO SE ESCONDE DO CONSULTOR COMUM (decisão do diretor) ─────────────────────────────
 *
 * Ele clica e LÊ que só Master reabre. Esconder ensina que o sistema está quebrado; dizer ensina
 * quem procurar. E esse caminho NÃO FAZ REQUISIÇÃO NENHUMA: a rota de leitura é gatada, e um comum
 * que a chamasse levaria 403 e um erro vermelho no lugar de uma explicação. O papel já está na
 * sessão, então a tela responde sozinha. A autoridade continua sendo o servidor, que recusa o POST
 * de quem não é Master mesmo que alguém burle a tela.
 *
 * §A.41: modal de PREENCHIMENTO (tem seleção), então sai por "Cancelar" ou pelo botão que reabre, e
 * nunca por clique fora. No caminho do comum ele é de LEITURA, e sai por "Fechar". Nenhum dos dois
 * fica sem saída visível.
 * §A.6: nome, etapa, situação, motivo e data do PROCESSO, que é o que a rota entrega. Nenhum CPF,
 * nenhum contato. Quem já foi expurgado aparece marcado e não volta.
 * §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação, escrita normal),
 * §A.35 (nenhum seletor nativo nasce aqui).
 */

import { useCallback, useEffect, useState } from "react";
import {
  CANDIDATURA_SITUACAO_LABEL,
  type AsCandidaturaParaReabrir,
  type AsVagaReabrirPrevia,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { apiFetch } from "@/lib/api";
import { dataBr, dataHoraBr, mensagemDoErro } from "@/lib/as-candidatos";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { rotuloDoLado } from "@/lib/as-vaga-acoes";
import { fraseDaReabertura, fraseDaReaberturaDeEntrega } from "@/lib/as-vaga-reabertura";
import { ehDoPapelDaVaga } from "@/lib/as-status-vaga";

export function ReabrirVagaModal({
  vaga,
  token,
  podeReabrir,
  onFechar,
  onReaberta,
}: {
  vaga: VagaListItem;
  token: string | null;
  /**
   * O PAPEL DA SESSÃO, resolvido pela Central de Vagas (`isAdmin`, que é MASTER ou SUPER_ADMIN, a
   * tradução exata do `@Roles` da rota). Falso NÃO faz requisição nenhuma: ver o cabeçalho.
   */
  podeReabrir: boolean;
  onFechar: () => void;
  /** A vaga já reaberta, como o servidor a devolveu. A Central de Vagas atualiza a linha com ela. */
  onReaberta: (v: VagaListItem) => void;
}) {
  const { etapas } = useEtapas();
  const [previa, setPrevia] = useState<AsVagaReabrirPrevia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  /**
   * A PREVISÃO DE ENTREGA NOVA, e ela só existe no caminho da vaga ENTREGUE.
   *
   * NASCE VAZIA DE PROPÓSITO, sem sugerir hoje nem a previsão antiga: o prazo de uma vaga que voltou
   * é combinado com o cliente, e um valor pré-preenchido seria aceito no primeiro clique e passaria
   * a valer como se alguém tivesse combinado. Vazio obriga a decisão, que é o ponto do campo.
   */
  const [novaPrevisao, setNovaPrevisao] = useState("");

  /* ─ QUAL DOS DOIS CAMINHOS É ESTE ─────────────────────────────────────────────────────────────
     A PERGUNTA É PELO PAPEL (`ENTREGA`), e nunca `status === "ENTREGUE"`: o papel é único no
     catálogo, então renomear a linha "Entregue" ou criar outra de entrega não faz esta tela voltar
     em silêncio a se comportar como a da vaga cancelada. Mesma régua da Central de Vagas. */
  const deEntrega = ehDoPapelDaVaga(vaga.status, "ENTREGA");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPrevia(
        await apiFetch<AsVagaReabrirPrevia>(`/as/vagas/${vaga.id}/reabrir-previa`, { token }),
      );
    } catch (err) {
      setErro(
        mensagemDoErro(
          err,
          deEntrega
            ? "Falha ao carregar o que esta reabertura pode devolver ao processo."
            : "Falha ao carregar quem este cancelamento encerrou.",
        ),
      );
    } finally {
      setCarregando(false);
    }
  }, [vaga.id, token, deEntrega]);

  /* A LEITURA SÓ ACONTECE PARA QUEM PODE REABRIR. Para o comum, o `podeReabrir` falso corta o
     efeito antes do `fetch`, e a caixa desenha a explicação direto (ver o cabeçalho do arquivo). */
  useEffect(() => {
    if (podeReabrir) void carregar();
  }, [podeReabrir, carregar]);

  const rotulo = vaga.nomeDivulgacao ?? "Vaga Sem Nome";

  // ── O CAMINHO DO CONSULTOR COMUM: explicação, e nenhuma requisição ─────────
  if (!podeReabrir) {
    return (
      <Modal onClose={onFechar} className="max-w-[520px] p-6" ariaLabel="Reabrir vaga">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--surface-2)] text-dim">
            <Icon name="lock" className="h-4 w-4" />
          </span>
          <div>
            <div className="eyebrow !mb-1">Atração e Seleção</div>
            <h2 className="text-lg font-semibold text-text">Reabrir Vaga É Ação De Master</h2>
            <p className="mt-1.5 text-[12.5px] leading-snug text-dim">
              {deEntrega
                ? "Entregar uma vaga ao cliente é do consultor, desfazer a entrega não é."
                : "Cancelar uma vaga é do consultor, desfazer o cancelamento não é."}{" "}
              Para trazer <span className="font-semibold text-text">{rotulo}</span> de volta ao
              trabalho, peça a reabertura a quem tem o papel de Master.
            </p>
          </div>
        </div>
        {/* §A.41: leitura sai por "Fechar", e a saída fica visível. */}
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="secondary" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </Modal>
    );
  }

  const lista = previa?.candidaturas ?? [];
  /* A FRASE SAI DA RÉGUA TESTADA, pelos dois eixos que a determinam: COMO o sistema sabe quem o
     cancelamento encerrou, e SE há alguém a oferecer. Sem prévia ainda, nada é afirmado.

     NO CAMINHO DA ENTREGA É OUTRA FRASE, e não uma adaptação desta: ali não houve cancelamento
     nenhum, então toda frase que fale de "este cancelamento" seria falsa. */
  const aviso = deEntrega
    ? fraseDaReaberturaDeEntrega(lista.length)
    : fraseDaReabertura(previa?.origem ?? "NINGUEM_DESCARTADO", lista.length);
  /* O PRAZO NOVO É OBRIGATÓRIO NO CAMINHO DA ENTREGA, e a tela não deixa nem tentar: reabrir contra
     a previsão antiga é o defeito que este campo existe para impedir. O servidor continua sendo a
     trava; aqui é só não oferecer um clique que ele recusaria. */
  const faltaPrevisao = deEntrega && !novaPrevisao;
  // QUEM JÁ FOI EXPURGADO NÃO ENTRA NA CONTA DO QUE VOLTA: ele aparece para o Master não procurar
  // para sempre uma pessoa que ele lembra que estava lá, e o servidor recusa restaurá-lo (§A.6).
  const selecionaveis = lista.filter((c) => !c.anonimizado);
  const marcados = selecionados.filter((id) => selecionaveis.some((c) => c.candidaturaId === id));

  function alternar(c: AsCandidaturaParaReabrir) {
    if (c.anonimizado) return;
    setSelecionados((atual) =>
      atual.includes(c.candidaturaId)
        ? atual.filter((x) => x !== c.candidaturaId)
        : [...atual, c.candidaturaId],
    );
  }

  async function confirmar() {
    if (salvando) return;
    if (faltaPrevisao) {
      setErroSalvar(
        "Informe a previsão de entrega nova antes de reabrir. Sem ela, o prazo voltaria a correr contra a previsão antiga, que já passou.",
      );
      return;
    }
    setSalvando(true);
    setErroSalvar(null);
    try {
      const atualizada = await apiFetch<VagaListItem>(`/as/vagas/${vaga.id}/reabrir`, {
        method: "POST",
        token,
        /* A LISTA SÓ VIAJA QUANDO ALGUÉM FOI MARCADO. Mandar um array vazio e não mandar nada são a
           mesma coisa para o servidor, e o corpo mínimo diz a verdade sobre a intenção: reabrir a
           vaga sem trazer ninguém de volta é um pedido legítimo, e é o único possível quando o
           cancelamento não encerrou ninguém.

           `dataLimite` SÓ VIAJA NO CAMINHO DA ENTREGA, pelo mesmo princípio: a reabertura da vaga
           cancelada não renegocia prazo, e mandar o campo vazio ali pediria ao servidor para
           reescrever uma previsão que ninguém tocou. */
        body: {
          ...(marcados.length > 0 ? { candidaturaIds: marcados } : {}),
          ...(deEntrega && novaPrevisao ? { dataLimite: novaPrevisao } : {}),
        },
      });
      onReaberta(atualizada);
    } catch (err) {
      /* A FRASE É A DO BACKEND, INTEIRA. Ele é a autoridade e recusa com motivo: id fora do
         conjunto, pessoa expurgada, duas linhas da mesma pessoa, capacidade estourada, papel
         insuficiente. Traduzir isso em "erro ao reabrir" apagaria justamente o que resolve. */
      setErroSalvar(mensagemDoErro(err, "Falha ao reabrir a vaga."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      /* §A.41: PREENCHIMENTO, então a saída é "Cancelar" ou o botão que reabre. Enquanto salva, nem
         o Escape interrompe: a escrita já está a caminho do servidor. */
      onClose={salvando ? () => undefined : onFechar}
      className="max-w-[720px] p-0"
      ariaLabel="Reabrir vaga"
    >
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--surface-2)] text-accent">
              <Icon name="refresh" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text">Reabrir Vaga</h2>
              <p className="mt-1 text-[12.5px] text-dim">
                <span className="font-semibold text-text">{rotulo}</span>, código{" "}
                {vaga.codigo ?? "não informado"}.{" "}
                {deEntrega
                  ? "A vaga volta ao trabalho e deixa de estar entregue, com um prazo novo."
                  : "A vaga volta ao trabalho e deixa de estar encerrada."}
              </p>
            </div>
          </div>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {carregando && (
            <p className="text-[13px] text-faint">
              {deEntrega
                ? "Carregando o que esta reabertura pode devolver ao processo."
                : "Carregando quem este cancelamento encerrou."}
            </p>
          )}

          {erro && (
            <p
              className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3.5 py-3 text-[13px] text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}

          {previa && !carregando && !erro && (
            <>
              {/* ─ O QUE ESTA REABERTURA PODE PROMETER ────────────────────────────────────────
                  A FRASE NÃO É ESCRITA AQUI: ela é a única forma de esta tela errar (prometer volta
                  exata onde o sistema não sabe onde a pessoa estava), então mora em
                  `fraseDaReabertura`, com teste, e depende de DOIS eixos, não de um. O quarto caso,
                  `SEM_ORIGEM` com a lista vazia, só apareceu com dado real.

                  O AMARELO É SÓ DO CASO QUE PEDE DECISÃO COM INFORMAÇÃO INCOMPLETA. Pintar todos de
                  amarelo ensinaria o time a ignorar a cor justamente onde ela importa. */}
              <p
                className={
                  aviso.alerta
                    ? "flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3.5 py-3 text-[12.5px] leading-snug text-warn"
                    : "flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[12.5px] leading-snug text-dim"
                }
                role={aviso.alerta ? "alert" : undefined}
              >
                <Icon
                  name="alert"
                  className={
                    aviso.alerta
                      ? "mt-[2px] h-3.5 w-3.5 flex-none text-warn"
                      : "mt-[2px] h-3.5 w-3.5 flex-none text-accent"
                  }
                />
                <span>{aviso.frase}</span>
              </p>

              {/* ─ A PREVISÃO DE ENTREGA NOVA: SÓ NO CAMINHO DA ENTREGA ──────────────────────
                  ┌─ POR QUE UM CAMPO, E NÃO UM BOTÃO DE "ZERAR A SLA" ──────────────────────┐
                  │ A SLA desta casa é uma contagem REGRESSIVA até a Previsão De Entrega, e   │
                  │ em contagem regressiva não existe zerar: existe PRAZO NOVO. Sem este      │
                  │ campo, a vaga reaberta voltaria a contar contra a previsão antiga, que    │
                  │ quase sempre já passou, e nasceria "Prazo Vencido" sem ninguém ter        │
                  │ atrasado nada. O prazo velho não se perde: ele fica guardado, e é o que   │
                  │ permite dizer depois que houve renegociação, e não atraso.                │
                  └─────────────────────────────────────────────────────────────────────────┘

                  `input type="date"` É A EXCEÇÃO ACEITA DA §A.35: é controle do navegador com
                  comportamento próprio, e não uma lista de opção. O rótulo é de CAMPO, então
                  vai em frase normal (§A.24), igual aos vizinhos da trilha. */}
              {deEntrega && (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
                  <label
                    htmlFor="reabrir-nova-previsao"
                    className="block text-[12.5px] font-semibold text-text"
                  >
                    Previsão de entrega nova
                  </label>
                  <input
                    id="reabrir-nova-previsao"
                    type="date"
                    value={novaPrevisao}
                    onChange={(e) => setNovaPrevisao(e.target.value)}
                    disabled={salvando}
                    aria-describedby="reabrir-nova-previsao-ajuda"
                    className="ds-input mt-2 max-w-[220px]"
                  />
                  <p id="reabrir-nova-previsao-ajuda" className="mt-2 text-[12px] leading-snug text-faint">
                    O prazo desta vaga é uma contagem regressiva até a previsão de entrega, então
                    reabrir pede um prazo novo: não existe zerar a contagem. A previsão que estava
                    valendo era {dataBr(vaga.dataLimite)}, e ela continua registrada como o prazo
                    anterior.
                  </p>
                </div>
              )}

              {lista.length > 0 && (
                <>
                  <p className="mt-4 text-[12.5px] text-dim">
                    Marque quem volta para o processo. Quem ficar desmarcado continua como está, e o
                    histórico dele não muda.
                  </p>

                  <ul className="mt-3 flex flex-col gap-2">
                    {lista.map((c) => {
                      const marcado = selecionados.includes(c.candidaturaId);
                      return (
                        <li
                          key={c.candidaturaId}
                          className={
                            c.anonimizado
                              ? "rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 opacity-70"
                              : marcado
                                ? "rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3"
                                : "rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                          }
                        >
                          <label
                            className={
                              c.anonimizado
                                ? "flex items-start gap-3"
                                : "flex cursor-pointer items-start gap-3"
                            }
                          >
                            <input
                              type="checkbox"
                              className="mt-[3px] h-4 w-4 flex-none accent-[var(--accent)]"
                              checked={marcado}
                              disabled={c.anonimizado || salvando}
                              onChange={() => alternar(c)}
                              aria-label={`Trazer ${c.candidatoNome} de volta para a vaga`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[13px] font-semibold text-text">
                                  {c.candidatoNome}
                                </span>
                                <StatusPill
                                  tone={tomDaEtapa(c.etapaOrigem, etapas)}
                                  label={rotuloDaEtapa(c.etapaOrigem, etapas)}
                                />
                                {/* A SITUAÇÃO DE ORIGEM SÓ APARECE QUANDO EXISTE. No cancelamento
                                    antigo ela é nula, e inventar "Em Seleção" aqui seria afirmar
                                    como fato o que a caixa amarela acabou de dizer que ninguém
                                    sabe. O lado da posição entra junto, quando houver. */}
                                {c.situacaoOrigem && (
                                  <StatusPill
                                    tone={tomDaSituacao(c.situacaoOrigem)}
                                    label={
                                      c.posicaoLadoOrigem
                                        ? `${CANDIDATURA_SITUACAO_LABEL[c.situacaoOrigem]}, ${rotuloDoLado(c.posicaoLadoOrigem)}`
                                        : CANDIDATURA_SITUACAO_LABEL[c.situacaoOrigem]
                                    }
                                  />
                                )}
                                {c.anonimizado && <StatusPill tone="nt" label="Dado Expurgado" />}
                              </span>
                              {/* ─ MOTIVO E DATA DA SAÍDA: EXIGÊNCIA DE AUDITORIA, NÃO ENFEITE ──
                                  Sem eles, o Master decidiria RECONHECENDO NOME, que é o gesto que
                                  a ciência de reentrada existe para impedir. Com eles, "descartado
                                  por perfil não aderente em março" e "descartado no dia do
                                  cancelamento" deixam de ser a mesma linha na tela. */}
                              <span className="mt-1 block text-[12px] leading-snug text-faint">
                                {c.saidaEm
                                  ? `Saiu em ${dataHoraBr(c.saidaEm)}.`
                                  : "Data da saída não informada."}{" "}
                                {c.motivoSaida
                                  ? `Motivo: ${c.motivoSaida}`
                                  : "Motivo não informado."}
                              </span>
                              {c.anonimizado && (
                                <span className="mt-1 block text-[12px] leading-snug text-warn">
                                  Os dados desta pessoa já foram expurgados pela retenção, então ela
                                  não volta ao processo. Ela aparece aqui para você saber que estava
                                  na vaga.
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {erroSalvar && (
                <p
                  className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3.5 py-3 text-[13px] text-danger"
                  role="alert"
                >
                  {erroSalvar}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-4">
          {/* O QUE VAI ACONTECER, DITO AO LADO DO BOTÃO. Zero marcados é caso legítimo e não erro,
              então a frase diz o que a vaga recebe, em vez de cobrar uma escolha. */}
          <p className="text-[12px] text-faint">
            {/* NO CAMINHO DA ENTREGA A FRASE DIZ O EFEITO, e não a contagem de marcados: o que
                acontece com quem está com o cliente (volta para o começo do funil) é maior do que
                quem o Master marcou, e é isso que ele precisa ler ao lado do botão. */}
            {deEntrega
              ? faltaPrevisao
                ? "Informe a previsão de entrega nova para reabrir."
                : "A vaga volta para Aberta e quem está com o cliente volta para o começo do funil."
              : marcados.length === 0
                ? "A vaga volta ao trabalho sem ninguém restaurado."
                : marcados.length === 1
                  ? "1 pessoa volta para o processo desta vaga."
                  : `${marcados.length} pessoas voltam para o processo desta vaga.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="px-4 py-2.5"
              onClick={onFechar}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="px-4 py-2.5"
              onClick={() => void confirmar()}
              /* O BOTÃO NÃO MENTE SOBRE O QUE FALTA: sem a previsão nova ele fica desligado, e a
                 frase à esquerda diz o que preencher. O servidor continua sendo a trava. */
              disabled={salvando || carregando || previa === null || faltaPrevisao}
            >
              {salvando ? "Reabrindo…" : "Reabrir vaga"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
