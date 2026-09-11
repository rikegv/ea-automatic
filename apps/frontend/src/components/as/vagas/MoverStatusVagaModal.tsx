"use client";

import { useState } from "react";
import type { VagaListItem } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { corDoTom } from "@/lib/as-etapas";
import { mensagemDoErro } from "@/lib/as-candidatos";
import { tomDoStatusVaga } from "@/lib/as-candidatos-visual";
import { destinosManuais, rotuloDoStatusVaga, type AsVagaStatus } from "@/lib/as-status-vaga";

/**
 * ─ MOVER O STATUS DA VAGA À MÃO (onda B2) ───────────────────────────────────────────────────────
 *
 * O CAMINHO PARA OS STATUS QUE O DIRETOR CRIOU. Enquanto a lista era fixa, o status da vaga só mudava
 * por três portas com régua própria (a trilha de abertura, o fechamento e o cancelamento), e não
 * havia como pôr uma vaga em "Stand By" porque "Stand By" não existia. Com o catálogo, existe, e
 * este é o gesto que leva a vaga até lá.
 *
 * ┌─ A TELA NÃO É A TRAVA, E ISSO TEM CONSEQUÊNCIA PRÁTICA AQUI ────────────────────────────────┐
 * │ Ela deixa de OFERECER o que o servidor vai recusar, e o servidor recusa de qualquer jeito,   │
 * │ sob a linha da vaga travada. As duas listas saem da MESMA régua compartilhada                │
 * │ (`podeSerDestinoManual`, `podeSairManualmente`), que é o ponto inteiro desta onda: não há uma│
 * │ lista aqui e outra lá para discordarem.                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE GESTO NÃO FAZ, E A AUSÊNCIA É A REGRA ──────────────────────────────────────────┐
 * │ ELE NÃO ENCERRA VAGA. Nenhum destino que `encerra` aparece na lista, porque encerrar tem     │
 * │ DUAS portas com régua (fechar e cancelar), com trava de candidato tratado, conferência de    │
 * │ posições, gate de Master, carimbo de contagem e data de fechamento. Um seletor de modal não  │
 * │ é a terceira.                                                                                │
 * │                                                                                              │
 * │ ELE NÃO PUBLICA RASCUNHO. Quem abre este modal a partir de um rascunho não existe: o botão   │
 * │ não aparece lá (`podeMoverStatusDaVaga`). O rascunho publica pela trilha de abertura, que é  │
 * │ onde a régua dos obrigatórios mora, e o backend recusa com todas as letras se alguém tentar. │
 * │                                                                                              │
 * │ ELE NÃO REABRE VAGA ENCERRADA, pelo lado da ORIGEM: só sai de status que não encerra.        │
 * │ Ressuscitar uma vaga cancelada faria o contador de dias voltar a correr e o carimbo de       │
 * │ contagem do fechamento ficar órfão.                                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.41: o modal não fecha ao clicar fora, e as saídas visíveis são "Cancelar" e o botão de salvar.
 * §A.35: `Select` do design system, nunca `<select>` cru. §A.11: sem travessão. §A.24: title case no
 * título; botão é AÇÃO, então escrita normal.
 * §A.6: nenhum dado pessoal atravessa este modal. A observação é texto de processo e vai inteira
 * para a trilha, junto de quem moveu (que o servidor lê da SESSÃO, nunca do corpo).
 */
export function MoverStatusVagaModal({
  vaga,
  catalogo,
  token,
  onClose,
  onMovido,
}: {
  vaga: VagaListItem;
  /** O catálogo COMPLETO (ativos e inativos). Quem filtra os destinos é `destinosManuais`. */
  catalogo: readonly AsVagaStatus[];
  token: string | null;
  onClose: () => void;
  onMovido: () => void;
}) {
  const destinos = destinosManuais(catalogo, vaga.status);
  const [destino, setDestino] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!destino) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch(`/as/vagas/${vaga.id}/status`, {
        method: "PATCH",
        token,
        // A OBSERVAÇÃO VAZIA NÃO VIAJA: o campo é opcional no servidor, e mandar string vazia
        // encheria a trilha de linhas com um comentário em branco.
        body: { status: destino, observacao: observacao.trim() || undefined },
      });
      onMovido();
    } catch (e) {
      /*
       * A FRASE É A DO BACKEND, SEM TRADUÇÃO. As recusas desta rota carregam a informação que
       * resolve o problema ("a vaga já está neste status", "o rascunho é publicado pela trilha de
       * abertura"), e trocá-las por "falha ao salvar" jogaria fora justamente isso. Elas aparecem
       * quando a tela está com a fotografia velha, que é o caso em que a pessoa mais precisa saber
       * o que aconteceu.
       */
      setErro(mensagemDoErro(e, "Não foi possível mover o status da vaga."));
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-[560px]" ariaLabel="Mover o status da vaga">
      <h2 className="mb-1 text-lg font-semibold text-text">Mover Status Da Vaga</h2>
      <p className="mb-4 text-[12.5px] text-dim">
        A vaga está em{" "}
        <span className="align-middle">
          <StatusPill
            tone={tomDoStatusVaga(vaga.status, catalogo)}
            label={rotuloDoStatusVaga(vaga.status, catalogo)}
          />
        </span>
        . Este caminho não encerra vaga: fechar e cancelar continuam sendo as únicas portas para
        isso, e são elas que conferem os candidatos e as posições.
      </p>

      {destinos.length === 0 ? (
        /* NENHUM DESTINO É UM ESTADO LEGÍTIMO, e não um erro: o catálogo pode não ter nenhum status
           marcado como movível além do de abertura, que é a origem. Dizer isso é melhor do que um
           seletor vazio, que parece defeito de carregamento. */
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px] text-dim">
          Não há para onde mover esta vaga. Nenhum outro status do catálogo aceita movimento manual.
          Quem cadastra essa lista é a administração, na tela de Status Da Vaga.
        </p>
      ) : (
        <>
          {/* SEM `htmlFor`: o `Select` do design system é um botão com popover, não um `<input>`
              com id, e apontar um rótulo para um id que não existe engana o leitor de tela. Quem
              nomeia o controle é o `ariaLabel` dele. */}
          <span className="mb-1 block text-[12px] font-semibold text-dim">Novo status *</span>
          <Select
            className="mb-4 w-full"
            ariaLabel="Novo status da vaga"
            value={destino}
            onChange={setDestino}
            placeholder="Escolher o novo status"
            options={destinos.map((st) => ({
              value: st.codigo,
              label: st.rotulo,
              color: corDoTom(st.tom),
            }))}
          />

          <label className="mb-1 block text-[12px] font-semibold text-dim" htmlFor="mover-obs">
            Por que a vaga está sendo movida
          </label>
          <textarea
            id="mover-obs"
            className="ds-input mb-1 min-h-[84px] w-full"
            maxLength={500}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Opcional. Vai inteiro para o histórico da vaga."
          />
          <p className="mb-4 text-[11.5px] text-faint">
            {observacao.length} de 500. Quem moveu e quando ficam registrados sozinhos.
          </p>
        </>
      )}

      {erro && (
        <p
          className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void salvar()} disabled={salvando || !destino}>
          {salvando ? "Movendo..." : "Mover status"}
        </Button>
      </div>
    </Modal>
  );
}
