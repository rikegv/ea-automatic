"use client";

/**
 * ─ A VAGA QUE NÃO CANCELA COM GENTE EM PROCESSO, E OS DOIS CAMINHOS DAÍ ───────────────────────
 *
 * A RÉGUA É DO DIRETOR: cancelar por cima de candidatura viva apaga um processo em andamento, então
 * a rota recusa e devolve a LISTA de quem ainda segura. Daí saem dois caminhos, e a diferença entre
 * eles é o papel de quem está na tela:
 *
 *  - MASTER: cancela assim mesmo, e o que ele forçar ENCERRA as candidaturas vivas (ver abaixo).
 *  - CONSULTOR: trata cada pessoa antes, e para isso ele precisa CHEGAR na lista.
 *
 * ┌─ O MODAL LEVA, E NÃO SÓ LISTA ────────────────────────────────────────────────────────────────┐
 * │ Esta é a entrega que o modal de candidatos pendentes ainda não tem: lá a lista é mostrada e o  │
 * │ consultor que não pode forçar fica olhando os nomes sem porta nenhuma. Aqui o botão FECHA esta │
 * │ caixa e ABRE o painel da vaga já na aba dos candidatos, que é onde desvincular e encerrar já   │
 * │ existem, com seleção múltipla e motivo obrigatório.                                           │
 * │                                                                                                │
 * │ NENHUM "DESVINCULAR EM MASSA" NOVO É ESCRITO AQUI, e isso é regra e não economia: o mecanismo  │
 * │ inteiro mora em `AcoesEmMassaDaVaga`, com a régua do motivo obrigatório dentro. Uma segunda    │
 * │ porta significaria essa régua escrita duas vezes, e duas cópias divergem no primeiro ajuste.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O FORÇAR FAZ, DITO ANTES DO CLIQUE ────────────────────────────────────────────────────┐
 * │ Forçar não é "cancelar e deixar a lista quieta": ele ENCERRA as candidaturas que ainda estão   │
 * │ em processo, marcando cada uma como descartada com o motivo do cancelamento. Isso não é        │
 * │ detalhe de implementação, é o efeito que a pessoa está AUTORIZANDO, e ela precisa lê-lo antes. │
 * │ Existe por exigência de LGPD (§A.6): candidatura viva em vaga cancelada nunca seria expurgada  │
 * │ pela retenção, ou seja, dado pessoal ficaria parado para sempre num processo morto.            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TOM É AMARELO, E NÃO VERMELHO, pelo mesmo motivo da recusa irmã (`RecusaFechamentoModal`): o
 * vermelho desta casa é PERIGO/RECUSA, e o que está na frente da pessoa é uma decisão que o diretor
 * MANDOU permitir ao Master. Amarelo é atenção, que é exatamente o que se quer dizer.
 *
 * `podeForcar` DECIDE O QUE DESENHAR, E NADA ALÉM DISSO. O guard é a autoridade: o servidor recalcula
 * o papel quando o `forcar` chega e devolve 403 ao COMUM. Este campo existe para o consultor comum
 * não ver um botão que só sabe falhar.
 *
 * A FRASE DA RECUSA É A DO BACKEND, INTEIRA E SEM RETOQUE, como nos modais irmãos: ela já vem medida
 * dentro da transação, e uma segunda redação aqui envelheceria primeiro.
 *
 * §A.6: nome, etapa e situação, o mesmo conjunto que a recusa do fechamento já trafega. Sem CPF, sem
 * contato. §A.11 (sem travessão), §A.24 (title case no título e nas tags; botão é ação).
 * §A.41: não fecha ao clicar fora, e a saída visível ("Voltar") está sempre no rodapé.
 */

import type { AsVagaCancelamentoBloqueado } from "@ea/shared-types";
import { CANDIDATURA_SITUACAO_LABEL } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { fraseDoCancelamentoForcado } from "@/lib/as-vaga-cancelamento";

export function RecusaCancelamentoModal({
  recusa,
  vagaRotulo,
  forcando,
  onVoltar,
  onForcar,
  onTratarCandidatos,
}: {
  recusa: AsVagaCancelamentoBloqueado;
  vagaRotulo: string;
  forcando: boolean;
  onVoltar: () => void;
  /** Reenvia o MESMO cancelamento com `forcar: true`. Só é chamado quando o botão existe. */
  onForcar: () => void;
  /** Fecha esta caixa e abre o painel da vaga na aba dos candidatos, onde se trata cada um. */
  onTratarCandidatos: () => void;
}) {
  const { etapas } = useEtapas();
  const quantos = recusa.naoEncerrados.length;

  return (
    <Modal
      onClose={forcando ? () => undefined : onVoltar}
      className="max-w-[640px] p-0"
      ariaLabel="Cancelar vaga com candidato em processo"
    >
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--sico-warn)] text-warn">
              <Icon name="alert" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text">
                Cancelar Vaga Com Candidato Em Processo
              </h2>
              <p className="mt-1 text-[12.5px] text-dim">
                <span className="font-semibold text-text">{vagaRotulo}</span> ainda tem{" "}
                <span className="font-semibold text-text">
                  {quantos === 1 ? "1 pessoa" : `${quantos} pessoas`}
                </span>{" "}
                com o processo em aberto.
              </p>
            </div>
          </div>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {/* A FRASE DO BACKEND, INTEIRA E SEM RETOQUE. */}
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[13px] text-dim">
            {recusa.message}
          </p>

          {/* QUEM SEGURA, COM ETAPA E SITUAÇÃO. A situação é o que distingue os dois casos que
              parecem o mesmo na etapa: quem está em seleção e quem já foi alocado na vaga. */}
          <ul className="mt-4 flex flex-col gap-2">
            {recusa.naoEncerrados.map((c) => (
              <li
                key={c.candidaturaId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <span className="text-[13px] font-semibold text-text">{c.candidatoNome}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusPill
                    tone={tomDaEtapa(c.etapa, etapas)}
                    label={rotuloDaEtapa(c.etapa, etapas)}
                  />
                  <StatusPill
                    tone={tomDaSituacao(c.situacao)}
                    label={CANDIDATURA_SITUACAO_LABEL[c.situacao]}
                  />
                </span>
              </li>
            ))}
          </ul>

          {recusa.podeForcar ? (
            /* O EFEITO DO FORÇAMENTO, ANTES DO BOTÃO. Fundo amarelo porque é a informação que muda
               a decisão, e não uma nota de rodapé. */
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3.5 py-3 text-[12.5px] text-warn"
              role="alert"
            >
              {fraseDoCancelamentoForcado(quantos)}
            </p>
          ) : (
            <p className="mt-4 text-[12.5px] text-faint">
              Cancelar a vaga com gente em processo é ação de Master. Encerre ou desvincule quem
              ainda está no funil e cancele em seguida, ou peça a um Master para cancelar assim
              mesmo.
            </p>
          )}
        </div>

        <div className="flex flex-none flex-wrap justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onVoltar} disabled={forcando}>
            Voltar
          </Button>
          {/* O CAMINHO EXISTE NOS DOIS CASOS, e não só para quem não pode forçar: tratar cada pessoa
              é o caminho CERTO, e o Master que preferir fazer isso não deveria precisar sair da
              tela e reabrir a vaga pelo botão de gestão para encontrá-lo. */}
          <Button
            variant="secondary"
            className="px-4 py-2.5"
            onClick={onTratarCandidatos}
            disabled={forcando}
          >
            Abrir os candidatos da vaga
          </Button>
          {recusa.podeForcar && (
            <Button className="px-4 py-2.5" onClick={onForcar} disabled={forcando}>
              {forcando ? "Cancelando…" : "Cancelar assim mesmo"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
