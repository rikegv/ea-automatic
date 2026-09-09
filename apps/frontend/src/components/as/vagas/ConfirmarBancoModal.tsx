"use client";

/**
 * ─ A CIÊNCIA DE ALOCAR NO BANCO COM POSIÇÃO OFICIAL AINDA ABERTA ──────────────────────────────
 *
 * AVISA, NÃO BLOQUEIA (decisão do diretor): quem decide é o consultor, com o número na frente. O
 * backend recusa a PRIMEIRA finalização no banco enquanto sobrar posição oficial, com um 409 que diz
 * QUANTAS; a tela mostra a pergunta e reenvia a MESMA finalização com a ciência. O aceite é gravado
 * lá, no histórico da candidatura, junto do número que estava valendo na hora.
 *
 * ─ POR QUE ELE NÃO É O `ConfirmDialog` DO DESIGN SYSTEM ─────────────────────────────────────────
 *
 * O `ConfirmDialog` tem dois tons: `default`, que desenha um CHECK, e `danger`, que desenha o alerta
 * VERMELHO. Nenhum dos dois é este caso. O check diria "deu certo" numa pergunta que ainda não foi
 * respondida, e o vermelho diria "perigo" numa decisão legítima que o diretor mandou permitir. O tom
 * certo é o AMARELO de atenção, e ele já existe na casa, no `ConfirmarReentradaModal`: o OUTRO 409
 * com ciência deste mesmo módulo. Os dois são irmãos por desenho (é o que o backend diz, ao construir
 * o segundo à imagem do primeiro), e parecer irmãos na tela é o que faz o consultor reconhecer o
 * gesto que está sendo pedido.
 *
 * A FRASE É A DO BACKEND, INTEIRA E SEM RETOQUE, pela mesma razão do modal irmão: ela já traz o
 * número medido dentro da transação, e uma segunda redação aqui envelheceria primeiro.
 *
 * §A.6: um número de posições da vaga e mais nada. Nenhum dado de candidato entra neste arquivo.
 * §A.11 (sem travessão), §A.24 (title case no título; os botões são AÇÃO, escrita normal).
 */

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { AsBancoPrecisaCiencia } from "@/lib/as-candidatos";

export function ConfirmarBancoModal({
  aviso,
  candidatoNome,
  confirmando,
  onCancelar,
  onCiente,
}: {
  aviso: AsBancoPrecisaCiencia;
  candidatoNome: string;
  confirmando: boolean;
  onCancelar: () => void;
  onCiente: () => void;
}) {
  const abertas = aviso.oficiaisAbertas;
  return (
    <Modal
      onClose={confirmando ? () => undefined : onCancelar}
      className="max-w-[560px] p-0"
      ariaLabel="Alocar no banco com posição oficial aberta"
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
                Alocar No Banco Com Posição Oficial Aberta
              </h2>
              <p className="mt-1 text-[12.5px] text-dim">
                <span className="font-semibold text-text">{candidatoNome}</span> entraria na reserva
                desta vaga, e ela ainda tem{" "}
                <span className="font-semibold text-text">
                  {abertas} {abertas === 1 ? "posição oficial aberta" : "posições oficiais abertas"}
                </span>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {/* A FRASE DO BACKEND, INTEIRA E SEM RETOQUE. */}
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[13px] text-dim">
            {aviso.message}
          </p>
          <p className="mt-3 text-[12px] text-faint">
            A posição oficial continua aberta e a vaga segue recebendo candidato. Confirmando, o
            aceite fica registrado no histórico desta candidatura.
          </p>
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button
            variant="secondary"
            className="px-4 py-2.5"
            onClick={onCancelar}
            disabled={confirmando}
          >
            Cancelar
          </Button>
          <Button className="px-4 py-2.5" onClick={onCiente} disabled={confirmando}>
            {confirmando ? "Finalizando…" : "Alocar no banco mesmo assim"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
