"use client";

/**
 * A CIÊNCIA DA REENTRADA EM VAGA JÁ ENCERRADA: a recusa que é uma PERGUNTA, e não um beco.
 *
 * ┌─ POR QUE ESTE MODAL EXISTE, e por que ele não é um "confirmar mesmo assim" genérico ────────┐
 * │ Alocar quem já foi DESCARTADO ou DESISTIU naquela MESMA vaga costuma ser engano: a pessoa    │
 * │ reaparece numa lista e ninguém lembra do processo anterior. Só que às vezes é decisão certa, │
 * │ e o que separa uma coisa da outra é o MOTIVO e a DATA do encerramento anterior. Por isso o   │
 * │ backend recusa a PRIMEIRA tentativa e devolve os dois: sem eles na frente do consultor, o    │
 * │ aviso vira clique automático, que é o mesmo que não existir.                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A FRASE É A DO BACKEND, EXIBIDA COMO VEIO. Ele já monta "foi descartada desta vaga em DD/MM/AAAA,
 * com o motivo registrado: X". A tela NÃO reescreve nem interpreta a frase: ela acrescenta, ao lado,
 * os MESMOS fatos em forma de ficha (situação, data, motivo), que é o formato que se lê de relance.
 * Duas versões da mesma regra dariam duas verdades, e a da tela envelheceria primeiro.
 *
 * O QUE ESTE MODAL NÃO TRATA. O outro 409 da mesma rota, "Esta pessoa já está nesta vaga.", é erro
 * SECO: a pessoa está VIVA na vaga agora e não há o que confirmar. Quem separa os dois é o
 * `reentradaPrecisaCiencia`, pelo campo `reason` do corpo e nunca pelo texto (ver o cliente HTTP).
 *
 * §A.6: situação, data e motivo do PROCESSO. Sem CPF, sem contato, sem ficha da pessoa.
 * §A.11 (sem travessão), §A.24 (title case no título e nas tags).
 */

import {
  CANDIDATURA_SITUACAO_LABEL,
  type AsReentradaPrecisaCiencia,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { dataHoraBr } from "@/lib/as-candidatos";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";

export function ConfirmarReentradaModal({
  aviso,
  candidatoNome,
  vagaRotulo,
  confirmando,
  onCancelar,
  onCiente,
}: {
  aviso: AsReentradaPrecisaCiencia;
  /** Quem está sendo realocado. Opcional: o modal funciona sem, e o cabeçalho se ajusta. */
  candidatoNome?: string | null;
  /** A vaga em questão, do jeito que a tela já a chama em toda parte. */
  vagaRotulo?: string | null;
  /** A segunda tentativa está em voo (o estado é de quem manda a alocação, não daqui). */
  confirmando: boolean;
  onCancelar: () => void;
  onCiente: () => void;
}) {
  const { situacao, encerradaEm, motivo } = aviso.anterior;

  return (
    <Modal
      onClose={confirmando ? () => undefined : onCancelar}
      className="max-w-[600px] p-0"
      ariaLabel="Reentrada em vaga já encerrada"
    >
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--sico-warn)] text-warn">
              <Icon name="alert" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text">Reentrada Em Vaga Encerrada</h2>
              <p className="mt-1 text-[12.5px] text-dim">
                {candidatoNome ? <span className="font-semibold text-text">{candidatoNome}</span> : "Esta pessoa"}
                {vagaRotulo ? (
                  <>
                    {" "}já teve um processo encerrado em{" "}
                    <span className="font-semibold text-text">{vagaRotulo}</span>.
                  </>
                ) : (
                  " já teve um processo encerrado nesta vaga."
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {/* A FICHA DO PROCESSO ANTERIOR: os mesmos fatos da frase, no formato que se lê de
              relance. É o que o consultor usa para decidir, então vem primeiro. */}
          <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-faint">
              O Processo Anterior
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[12px] text-faint">Como terminou</dt>
                <dd className="mt-1">
                  <StatusPill
                    tone={tomDaSituacao(situacao)}
                    label={CANDIDATURA_SITUACAO_LABEL[situacao]}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-faint">Encerrado em</dt>
                <dd className="mt-1 text-[13px] font-semibold text-text">
                  {dataHoraBr(encerradaEm)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[12px] text-faint">Motivo registrado</dt>
                {/* MOTIVO EM BRANCO É INFORMAÇÃO, e das que mais pesam: descarte sem motivo
                    escrito é justamente o que se decide olhando de novo. Some do lado nenhum. */}
                <dd className="mt-1 whitespace-pre-wrap text-[13px] text-text">
                  {motivo?.trim() ? motivo : "não informado"}
                </dd>
              </div>
            </dl>
          </div>

          {/* A FRASE DO BACKEND, INTEIRA E SEM RETOQUE. */}
          <p className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[13px] text-dim">
            {aviso.message}
          </p>

          <p className="mt-3 text-[12px] text-faint">
            O processo anterior não é apagado nem reaproveitado: nasce uma candidatura nova em
            Captação, e o histórico dos dois segue na ficha da pessoa.
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
            {confirmando ? "Alocando…" : "Estou Ciente"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
