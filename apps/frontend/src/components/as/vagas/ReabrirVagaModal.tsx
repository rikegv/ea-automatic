"use client";

/**
 * ─ REABRIR VAGA CANCELADA: A ÚNICA TELA QUE DESFAZ UM ENCERRAMENTO (peça 2 da onda B3) ─────────
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
import { dataHoraBr, mensagemDoErro } from "@/lib/as-candidatos";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { rotuloDoLado } from "@/lib/as-vaga-acoes";
import { fraseDaReabertura } from "@/lib/as-vaga-reabertura";

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

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPrevia(
        await apiFetch<AsVagaReabrirPrevia>(`/as/vagas/${vaga.id}/reabrir-previa`, { token }),
      );
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar quem este cancelamento encerrou."));
    } finally {
      setCarregando(false);
    }
  }, [vaga.id, token]);

  /* A LEITURA SÓ ACONTECE PARA QUEM PODE REABRIR. Para o comum, o `podeReabrir` falso corta o
     efeito antes do `fetch`, e a caixa desenha a explicação direto (ver o cabeçalho do arquivo). */
  useEffect(() => {
    if (podeReabrir) void carregar();
  }, [podeReabrir, carregar]);

  const rotulo = vaga.nomeDivulgacao ?? "Vaga Sem Nome De Divulgação";

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
              Cancelar uma vaga é do consultor, desfazer o cancelamento não é. Para trazer{" "}
              <span className="font-semibold text-text">{rotulo}</span> de volta ao trabalho, peça a
              reabertura a quem tem o papel de Master.
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
     cancelamento encerrou, e SE há alguém a oferecer. Sem prévia ainda, nada é afirmado. */
  const aviso = fraseDaReabertura(previa?.origem ?? "NINGUEM_DESCARTADO", lista.length);
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
    setSalvando(true);
    setErroSalvar(null);
    try {
      const atualizada = await apiFetch<VagaListItem>(`/as/vagas/${vaga.id}/reabrir`, {
        method: "POST",
        token,
        /* A LISTA SÓ VIAJA QUANDO ALGUÉM FOI MARCADO. Mandar um array vazio e não mandar nada são a
           mesma coisa para o servidor, e o corpo mínimo diz a verdade sobre a intenção: reabrir a
           vaga sem trazer ninguém de volta é um pedido legítimo, e é o único possível quando o
           cancelamento não encerrou ninguém. */
        body: marcados.length > 0 ? { candidaturaIds: marcados } : {},
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
                {vaga.codigo ?? "não informado"}. A vaga volta ao trabalho e deixa de estar
                encerrada.
              </p>
            </div>
          </div>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {carregando && (
            <p className="text-[13px] text-faint">Carregando quem este cancelamento encerrou.</p>
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
            {marcados.length === 0
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
              disabled={salvando || carregando || previa === null}
            >
              {salvando ? "Reabrindo…" : "Reabrir vaga"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
