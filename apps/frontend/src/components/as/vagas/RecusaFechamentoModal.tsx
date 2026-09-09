"use client";

/**
 * ─ A VAGA QUE NÃO FECHA COM POSIÇÃO OFICIAL ABERTA, E O FORÇAMENTO DO MASTER ──────────────────
 *
 * A RÉGUA É DO DIRETOR: a vaga só fecha quando TODAS as posições OFICIAIS estão preenchidas. O banco
 * não participa da conta, porque reserva não é entrega. O MASTER pode encerrar assim mesmo, e o que
 * ele forçar deixa trilha.
 *
 * ─ POR QUE ESTA RECUSA PRECISA DE UM MODAL, E NÃO DE UMA LINHA VERMELHA NO FORMULÁRIO ─────────
 *
 * Porque ela não é só um "não": ela é um "não, e faltam DUAS, e existe um caminho". Escrita como
 * erro solto, ela mandava o consultor sair da tela para descobrir quantas faltavam e voltar, que é
 * exatamente o que o modal de candidatos pendentes já tinha resolvido para a OUTRA recusa do mesmo
 * botão. As duas recusas do fechamento passam a se parecer, e é isso que faz o time reconhecer o que
 * está sendo pedido.
 *
 * ─ O GESTO É EXPLÍCITO, E ELE É O PRÓPRIO MODAL ────────────────────────────────────────────────
 *
 * Forçar encerra uma vaga com posição em aberto, então não pode acontecer no mesmo clique que pediu o
 * fechamento normal. O desenho é o do irmão desta frente, o `ConfirmarBancoModal`: a tela recusa,
 * mostra o número, DIZ O QUE VAI FICAR REGISTRADO, e só então oferece o botão. Um segundo diálogo por
 * cima deste não acrescentaria decisão nenhuma, só mais um clique sobre a mesma pergunta já lida.
 *
 * ─ O TOM É AMARELO, PELO MESMO MOTIVO DO MODAL DO BANCO ───────────────────────────────────────
 *
 * O `ConfirmDialog` do design system tem `default` (check) e `danger` (alerta vermelho). O check
 * diria "deu certo" numa pergunta ainda não respondida; o vermelho diria "perigo" numa decisão que o
 * diretor mandou permitir ao Master. O amarelo de atenção é o tom certo, e já existe na casa.
 *
 * ─ `podeForcar` DECIDE O QUE DESENHAR, E NADA ALÉM DISSO ───────────────────────────────────────
 *
 * A TELA ESCONDER O BOTÃO É CONVENIÊNCIA, O GUARD É A AUTORIDADE. O servidor recalcula o papel
 * quando o `forcar` chega e devolve 403 ao COMUM. Este campo existe para o consultor comum não ver um
 * botão que só sabe falhar; ele NÃO é a trava, e tratá-lo como trava seria mover para a tela uma
 * decisão que é do backend.
 *
 * A FRASE DA RECUSA É A DO BACKEND, INTEIRA E SEM RETOQUE, pelo mesmo motivo dos modais irmãos: ela
 * já traz o número medido dentro da transação, e uma segunda redação aqui envelheceria primeiro.
 *
 * §A.6: números de posições da vaga e mais nada. Nenhum dado de candidato entra neste arquivo.
 * §A.11 (sem travessão), §A.24 (title case no título; os botões são AÇÃO, escrita normal).
 */

import type { FecharVagaRecusa } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export function RecusaFechamentoModal({
  recusa,
  vagaRotulo,
  forcando,
  onCancelar,
  onForcar,
}: {
  recusa: FecharVagaRecusa;
  vagaRotulo: string;
  forcando: boolean;
  onCancelar: () => void;
  /** Reenvia o MESMO fechamento com `forcar: true`. Só é chamado quando o botão existe. */
  onForcar: () => void;
}) {
  const faltam = recusa.faltam;
  return (
    <Modal
      onClose={forcando ? () => undefined : onCancelar}
      className="max-w-[560px] p-0"
      ariaLabel="Fechar vaga com posição oficial aberta"
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
                Fechar Vaga Com Posição Oficial Aberta
              </h2>
              {/* O NÚMERO REAL, E OS DOIS LADOS DELE. "Faltam 2" sozinho não diz se a vaga entregou
                  quase tudo ou quase nada, e é essa diferença que decide se vale esperar. */}
              <p className="mt-1 text-[12.5px] text-dim">
                <span className="font-semibold text-text">{vagaRotulo}</span> tem{" "}
                <span className="font-semibold text-text">
                  {recusa.finalizadasOficial} de {recusa.posicoesOficiais}
                </span>{" "}
                posições oficiais preenchidas, então{" "}
                <span className="font-semibold text-text">
                  {faltam === 1 ? "falta 1" : `faltam ${faltam}`}
                </span>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {/* A FRASE DO BACKEND, INTEIRA E SEM RETOQUE. */}
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[13px] text-dim">
            {recusa.message}
          </p>
          {recusa.podeForcar ? (
            /* O QUE VAI FICAR REGISTRADO, DITO ANTES DO CLIQUE. Quem força precisa saber que a
               exceção fica com o nome dele, e o número que fica é o DESTE momento. */
            <p className="mt-3 text-[12px] text-faint">
              Encerrando assim mesmo, a vaga fica fechada com {faltam === 1 ? "a posição" : "as posições"}{" "}
              em aberto, e fica registrado no painel desta vaga o seu nome, a data e quantas posições
              oficiais estavam abertas agora.
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-faint">
              Encerrar a vaga com posição oficial em aberto é ação de Master. Finalize{" "}
              {faltam === 1 ? "a posição que falta" : "as posições que faltam"} no painel da vaga, ou
              peça a um Master para encerrar assim mesmo.
            </p>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button
            variant="secondary"
            className="px-4 py-2.5"
            onClick={onCancelar}
            disabled={forcando}
          >
            {recusa.podeForcar ? "Cancelar" : "Entendi"}
          </Button>
          {recusa.podeForcar && (
            <Button className="px-4 py-2.5" onClick={onForcar} disabled={forcando}>
              {forcando ? "Fechando…" : "Encerrar a vaga assim mesmo"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
