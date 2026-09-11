/**
 * ─ O QUE A TELA DO REABRIR PODE AFIRMAR, E O QUE ELA NÃO PODE (peça 2 da onda B3) ──────────────
 *
 * ESTE ARQUIVO NÃO DECIDE NADA SOBRE A REABERTURA. Ele decide a FRASE, que é onde esta peça se
 * ganha ou se perde: o backend já resolveu quem pode voltar, e a única forma de a tela errar é
 * PROMETER MAIS DO QUE O DADO SUSTENTA. "Cada pessoa volta para onde estava" é verdade num caso e
 * mentira no outro, e a diferença não aparece na revisão de um componente de trezentas linhas.
 *
 * ┌─ POR QUE É UMA FUNÇÃO COM TESTE, E NÃO UM MAPA DE TRÊS FRASES ─────────────────────────────┐
 * │ PORQUE SÃO QUATRO CASOS, NÃO TRÊS, e o quarto só apareceu com DADO REAL. Medido na          │
 * │ homologação em 11/09: a vaga cancelada `1234567` responde `SEM_ORIGEM` com a lista VAZIA.   │
 * │ Com um mapa por `origem`, ela mostraria "quem você marcar volta em seleção" embaixo de uma  │
 * │ lista que não tem ninguém para marcar, ou seja, a tela falaria de pessoas inexistentes.     │
 * │ A frase depende de DUAS coisas: como o sistema sabe, e se há alguém a oferecer.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O `SEM_ORIGEM` NÃO SE SUAVIZA, e é o ponto inteiro da peça: ali o sistema ADMITE que não sabe
 * onde cada pessoa estava nem se ela saiu por causa do cancelamento. É por não saber que a escolha
 * fica com o Master, um a um, e é por isso que a frase dele é a única que acende alerta.
 *
 * §A.11 (sem travessão), §A.24 (frase de apoio, escrita normal).
 */

import type { AsVagaReabrirOrigem } from "@ea/shared-types";

export interface FraseDaReabertura {
  /** O que a tela diz antes da lista. */
  frase: string;
  /**
   * ALERTA (amarelo) OU CONTEXTO (neutro)?
   *
   * Só o `SEM_ORIGEM` COM GENTE A OFERECER acende: é o único caso em que alguém vai tomar uma
   * decisão sobre uma pessoa com informação admitidamente incompleta. Pintar os quatro de amarelo
   * ensinaria o time a ignorar a cor justamente no caso em que ela importa.
   */
  alerta: boolean;
}

/**
 * A FRASE DA REABERTURA, pelos dois eixos que a determinam.
 *
 * `quantosOferecidos` é o TAMANHO DA LISTA que a prévia trouxe, e não a contagem do que o Master
 * marcou: a frase descreve o que o sistema tem a oferecer, e é lida antes de qualquer escolha.
 */
export function fraseDaReabertura(
  origem: AsVagaReabrirOrigem,
  quantosOferecidos: number,
): FraseDaReabertura {
  /* O EVENTO EXISTE E NÃO ENCERROU NINGUÉM. É o cancelamento normal, o da vaga que ninguém segurava,
     e ele é o caso COMUM. A tela não oferece nada porque não há nada a desfazer: mostrar aqui os
     outros descartados da vaga ofereceria para ressurreição quem a SELEÇÃO recusou por mérito, que
     é exatamente o furo que a auditoria vetou. */
  if (origem === "NINGUEM_DESCARTADO") {
    return {
      frase:
        "Este cancelamento não encerrou o processo de ninguém, então não há quem trazer de volta. Reabrir devolve a vaga ao trabalho, e ela volta sem ninguém restaurado.",
      alerta: false,
    };
  }

  if (origem === "COM_ORIGEM") {
    /* A LISTA VAZIA AQUI NÃO DEVERIA ACONTECER pela definição do backend (evento com gente é o que
       define o `COM_ORIGEM`), e é por isso mesmo que ela tem frase própria em vez de cair na de
       cima: se um dia acontecer, a tela diz o que vê, em vez de afirmar uma promessa sobre uma
       lista que não existe. */
    if (quantosOferecidos === 0) {
      return {
        frase:
          "O cancelamento registrou onde cada pessoa estava, e não há ninguém para trazer de volta nesta vaga. Reabrir devolve a vaga ao trabalho, sem ninguém restaurado.",
        alerta: false,
      };
    }
    return {
      frase:
        "O cancelamento registrou onde cada pessoa estava. Quem você marcar volta exatamente para a situação em que estava quando a vaga foi cancelada.",
      alerta: false,
    };
  }

  /* SEM_ORIGEM, E COM A LISTA VAZIA: o caso medido na vaga `1234567` da homologação. O sistema não
     sabe quem o cancelamento encerrou, E não encontrou saída nenhuma para oferecer. Dizer "quem
     você marcar volta em seleção" sobre uma lista vazia seria falar de gente que não está ali. */
  if (quantosOferecidos === 0) {
    return {
      frase:
        "Este cancelamento é anterior ao registro de origem, então o sistema não sabe quem ele encerrou, e não há saída registrada nesta vaga para oferecer. Reabrir devolve a vaga ao trabalho, sem ninguém restaurado.",
      alerta: false,
    };
  }

  return {
    frase:
      "Este cancelamento é anterior ao registro de origem, então o sistema NÃO SABE onde cada pessoa estava nem se ela saiu por causa do cancelamento. Quem você marcar volta em seleção, sem posição na vaga. Confira o motivo e a data da saída de cada linha antes de escolher.",
    alerta: true,
  };
}
