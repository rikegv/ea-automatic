"use client";

/**
 * ─ O RESULTADO DO LOTE: AS DUAS METADES, SEMPRE (grupo 1 da A&S) ──────────────────────────────
 *
 * ┌─ POR QUE ISTO É METADE DA ENTREGA, E NÃO UM TOAST ──────────────────────────────────────────┐
 * │ O lote é PARCIAL por decisão do diretor: ele aplica o que couber e devolve o resto em        │
 * │ `falhas`. Um aviso dizendo só "pronto" esconderia justamente o que o consultor precisa ver,  │
 * │ que é QUEM ficou de fora e POR QUÊ. Uma vaga de 5 com 8 selecionados entrega 5 e recusa 3, e │
 * │ as 3 recusadas continuam na tela, selecionáveis, esperando uma decisão que ninguém vai tomar │
 * │ se ninguém for avisado.                                                                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TRÊS TONS, E NÃO DOIS. Lote inteiro (check verde), lote parcial (atenção amarela) e lote em que
 * NADA foi aplicado (X vermelho). O terceiro é o que mais importa distinguir: desenhá-lo com o check
 * de sucesso é a forma mais direta de alguém achar que entregou trinta posições que não entregou. A
 * régua que decide o tom é `tomDoResultado`, com teste, e não um `if` dentro deste componente.
 *
 * §A.6: cada falha mostra o NOME que a tela já tinha em memória e o motivo de PROCESSO que o backend
 * devolveu. Nenhum CPF, nenhum id cru na tela, nenhuma busca nova para "enriquecer" a lista.
 * §A.11 (sem travessão; vazio é "não informado"), §A.24 (title case no título e na etiqueta; o botão
 * é ação e segue escrita normal).
 */

import type { AsResultadoEmMassa } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { nomeDoAlvo, resumoDoLote, tomDoResultado } from "@/lib/as-candidatos-lote";
import { cn } from "@/lib/cn";

/** A etiqueta do desfecho do lote. É TAG, então title case (§A.24). */
const ROTULO = {
  ok: "Lote Concluído",
  parcial: "Lote Parcial",
  nada: "Nada Foi Aplicado",
} as const;

export function ResultadoLoteModal({
  titulo,
  resultado,
  nomes,
  onClose,
}: {
  /** O que a ação era, dito no cabeçalho. Title case (§A.24). */
  titulo: string;
  resultado: AsResultadoEmMassa;
  /**
   * O NOME DE CADA ALVO, vindo da lista que a tela já carregou. §A.6: a resposta traz só o id, e é
   * daqui que sai a palavra que o consultor lê. Quem não estiver no mapa aparece como não informado.
   */
  nomes: Map<string, string>;
  onClose: () => void;
}) {
  const tom = tomDoResultado(resultado);

  return (
    <Modal onClose={onClose} className="max-w-[680px] p-0" ariaLabel="Resultado do lote">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-text">{titulo}</h2>
            <StatusPill
              tone={tom === "ok" ? "ok" : tom === "parcial" ? "wn" : "dg"}
              label={ROTULO[tom]}
            />
          </div>
          <p className="mt-1 text-[12.5px] text-dim">{resumoDoLote(resultado)}</p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {resultado.falhas.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 text-[13px] text-dim">
              Todas as linhas selecionadas foram aplicadas. A lista da vaga já está atualizada.
            </p>
          ) : (
            <>
              <h3 className="mb-2.5 text-[13px] font-semibold text-text">O Que Ficou De Fora</h3>
              {/* §A.12: máscara única de tabela, título de coluna centralizado e divisória entre
                  colunas. §A.20: o motivo é a coluna que carrega frase longa, então é ela que fica
                  com a sobra de largura, e a tabela rola dentro do contêiner em vez de esmagar.
                  SEM ORDENAÇÃO (§A.29 admite a exceção que a própria régua descreve): a lista tem o
                  tamanho da falha, é lida uma vez e some ao fechar; ordená-la seria oferecer um
                  gesto sobre um relatório que ninguém vai comparar. */}
              <div className="ea-scroll overflow-x-auto">
                <table className="ds-table min-w-[520px]">
                  <thead>
                    <tr>
                      <th className="w-[34%] text-center">Candidato</th>
                      <th className="w-[66%] text-center">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.falhas.map((f) => (
                      <tr key={f.alvoId}>
                        <td className="font-semibold">{nomeDoAlvo(f.alvoId, nomes)}</td>
                        <td className="text-dim">
                          <span className="flex items-start gap-2">
                            <Icon
                              name="alert"
                              className="mt-[3px] h-3.5 w-3.5 flex-none text-warn"
                            />
                            <span className="leading-snug">{f.motivo}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[12px] text-faint">
                Quem ficou de fora continua na vaga, do jeito que estava, e segue selecionável. As
                recusas que pedem uma confirmação sua (como a reentrada de quem já teve processo
                encerrado nesta vaga) são resolvidas na ação da própria linha, que faz a pergunta
                antes de gravar.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button
            className={cn("px-4 py-2.5")}
            onClick={onClose}
            /* O foco nasce aqui: o resultado é lido e fechado, e este é o único gesto que resta. */
            autoFocus
          >
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
