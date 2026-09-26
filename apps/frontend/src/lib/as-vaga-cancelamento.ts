/**
 * ─ O QUE O CANCELAMENTO DA VAGA FAZ, DITO ANTES DO CLIQUE ─────────────────────────────────────
 *
 * ┌─ A TRAVA DE CANDIDATOS MORREU, E COM ELA O PARSER QUE VIVIA AQUI (Frente B) ───────────────┐
 * │ ESTE ARQUIVO ERA, EM METADE, O LEITOR DA RECUSA 409 `candidatosNaoEncerrados`:              │
 * │ `cancelamentoBloqueadoPorCandidatos` reconhecia o corpo e `fraseDoCancelamentoForcado`      │
 * │ explicava que FORÇAR descartava todo mundo que segurava.                                    │
 * │                                                                                             │
 * │ OS DOIS FORAM REMOVIDOS PORQUE A RECUSA NÃO EXISTE MAIS. O backend revogou a trava 3        │
 * │ (`travaCandidatosQueSeguram`): cancelar com candidato dentro é permitido para qualquer      │
 * │ consultor, NINGUÉM É DESCARTADO, e quem estava vivo vai para o STAND BY, vivo. O campo      │
 * │ `forcar` continua aceito no corpo por compatibilidade e NÃO FAZ NADA.                        │
 * │                                                                                             │
 * │ PARSER DE UMA RECUSA QUE NINGUÉM MAIS LANÇA NÃO É INÓCUO: ele é código morto que PARECE     │
 * │ vivo, e a próxima pessoa a ler a tela conclui que a trava continua de pé. A frase do         │
 * │ forçamento era pior: ela afirmava um descarte em lote que o sistema deixou de fazer.         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE SOBROU AQUI SÃO AS DUAS FRASES QUE A TELA PRECISA DIZER, e nenhuma delas trava nada:
 *   1. `avisoDeProcessosEncerrados`: quantos processos daquela vaga JÁ acabaram (peça 1 da onda B3);
 *   2. `avisoDoDestinoDoCancelamento`: para onde vai quem ainda está em processo (Frente B).
 *
 * §A.6: só contagens e vocabulário de processo. Nenhum nome, nenhum CPF, nenhum id de pessoa.
 * §A.11 (sem travessão), §A.24 (as frases daqui são apoio, escrita normal).
 */

import {
  CANDIDATURA_SITUACOES,
  candidaturaEncerradaParaCancelamento,
  candidaturaViva,
  ehSaidaSemExito,
  type AsOcupacaoVaga,
  type AsVagaCancelamentoPorSituacao,
  type AsVagaCancelamentoPrevia,
} from "@ea/shared-types";

/**
 * ─ QUANTAS PESSOAS O CANCELAMENTO VAI MOVER PARA O STAND BY ────────────────────────────────────
 *
 * A RÉGUA É A DO BACKEND, LETRA POR LETRA: `moverVivosParaODestino` move quem `candidaturaViva`
 * diz que está vivo, e só isso. Nenhuma lista de situação é escrita aqui, pelo motivo de sempre: uma
 * segunda lista concorda com a primeira no dia em que é escrita e diverge na primeira situação nova.
 *
 * ┌─ A CONTA É `emSelecao` MAIS OS DESFECHOS VIVOS, E O `ATIVO` É EXCLUÍDO À MÃO ──────────────┐
 * │ `emSelecao` JÁ É a contagem de quem está `ATIVO` (contrato do `AsOcupacaoVaga`), e          │
 * │ `porDesfecho` é "quem JÁ RECEBEU DECISÃO", o que inclui APROVADO, ALOCADO e                 │
 * │ ENVIADO_PARA_ADMISSAO, os três vivos. Somar os dois é a conta certa.                        │
 * │                                                                                             │
 * │ A EXCLUSÃO EXPLÍCITA DO `ATIVO` É DEFENSIVA E NÃO DECORATIVA: pelo contrato ele nunca       │
 * │ aparece em `porDesfecho`, mas se um dia aparecer, somar os dois mapas contaria a mesma      │
 * │ pessoa DUAS VEZES, e um número inflado numa frase que explica um efeito é pior do que a     │
 * │ frase não existir.                                                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NULO QUER DIZER "NÃO SEI", e não zero: a vaga pode chegar à tela sem ocupação (a janela entre a
 * publicação do backend e a da tela), e afirmar "ninguém será movido" sem ter contado seria a tela
 * garantindo o que não apurou. Quem lê decide o que fazer com o nulo.
 *
 * O NÚMERO É TETO, NÃO EXATO, e a diferença é inofensiva: o backend não move quem JÁ está na etapa
 * de destino (mover alguém para onde ele já está seria um evento de trilha sem fato). A frase fala
 * de "quem está em processo", que é verdade para todos eles.
 */
export function quantosVaoParaODestino(
  ocupacao: AsOcupacaoVaga | null | undefined,
): number | null {
  if (!ocupacao) return null;
  const decididosVivos = CANDIDATURA_SITUACOES.filter(
    (s) => candidaturaViva(s) && s !== "ATIVO",
  ).reduce((total, s) => total + (ocupacao.porDesfecho?.[s] ?? 0), 0);
  return ocupacao.emSelecao + decididosVivos;
}

/** O que o modal desenha sobre o destino: a frase e a garantia que vem logo atrás dela. */
export interface AvisoDoDestinoDoCancelamento {
  frase: string;
  nota: string;
}

/**
 * ─ PARA ONDE VAI QUEM ESTÁ NA VAGA, DITO ANTES DO CLIQUE (Frente B) ────────────────────────────
 *
 * ELA SUBSTITUI A OPÇÃO DE FORÇAR, e a troca é de natureza: onde havia um GESTO que descartava
 * gente, há agora uma INFORMAÇÃO sobre o que o cancelamento faz sozinho. Nada aqui desabilita o
 * botão, pede confirmação ou muda a régua.
 *
 * A NOTA DIZ O QUE NÃO MUDA, e é ela que responde a pergunta seguinte de quem acabou de ler que um
 * monte de gente vai ser movida: ninguém é descartado e a SITUAÇÃO de cada um fica como está, então
 * quem entregou posição continua entregue e a ocupação da vaga não se mexe.
 *
 * "STAND BY" É O NOME QUE O PRÓPRIO BACKEND ESCREVE na trilha do cancelamento e no motivo de cada
 * movimento, então a tela e o histórico contam a mesma história. A etapa de destino é uma FLAG do
 * catálogo (`destino_do_cancelamento`) que a leitura pública de etapas não serve, então a tela não
 * tem como lê-la hoje; está reportado ao coordenador.
 *
 * §A.24: frase de apoio, escrita normal.
 */
export function avisoDoDestinoDoCancelamento(
  quantos: number | null,
): AvisoDoDestinoDoCancelamento {
  const nota =
    "Ninguém é descartado e a situação de cada pessoa não muda: quem já entregou posição continua entregue.";
  if (quantos === null) {
    return {
      frase:
        "Quem ainda está em processo nesta vaga vai para a etapa Stand By, vivo, e continua encontrável para ser transferido ou realocado depois.",
      nota,
    };
  }
  if (quantos === 0) {
    return {
      frase: "Não há ninguém em processo nesta vaga, então o cancelamento não move nenhuma pessoa.",
      nota,
    };
  }
  /* O PLURAL É CONCORDADO NA FRASE INTEIRA, e não só no substantivo: a lição está escrita em
     `as-vaga-trilha` ("1 posição oficial preenchidas" chegou à tela da PS-2026-001). Aqui são
     quatro palavras que concordam de uma vez (pessoa, está, vai, encontrável). */
  const frase =
    quantos === 1
      ? "1 pessoa ainda está em processo nesta vaga e vai para a etapa Stand By, viva, e continua encontrável para ser transferida ou realocada depois."
      : `${quantos} pessoas ainda estão em processo nesta vaga e vão para a etapa Stand By, vivas, e continuam encontráveis para serem transferidas ou realocadas depois.`;
  return { frase, nota };
}

/**
 * ─ O AVISO DO CANCELAMENTO: QUANTOS PROCESSOS DAQUELA VAGA JÁ ACABARAM (peça 1 da onda B3) ─────
 *
 * O QUE O DIRETOR PEDIU: o modal conta, ANTES do clique, quanta gente daquela vaga já está com o
 * processo encerrado. INFORMA, NÃO TRAVA: o botão de cancelar continua fazendo exatamente o que
 * fazia, e este bloco não tem poder nenhum sobre ele.
 *
 * ┌─ POR QUE ISTO É UMA FUNÇÃO COM TESTE, E NÃO TRÊS TERNÁRIOS DENTRO DO MODAL ────────────────┐
 * │ PORQUE A FRASE PODE MENTIR, e mentir aqui é pior do que não avisar. Medido na homologação    │
 * │ com dado real: na vaga ABERTA da 3120 o único "encerrado" é um ENVIADO_PARA_ADMISSAO, ou     │
 * │ seja, alguém que foi APROVADO e mandado para a admissão, que é o melhor desfecho que existe. │
 * │ Escrever ali "1 candidato com processo já encerrado" descreveria uma aprovação como se fosse │
 * │ uma perda, e o consultor decidiria o cancelamento lendo o contrário do que aconteceu.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA DO BACKEND ESTÁ CERTA E NÃO SE DISCUTE: para o CANCELAMENTO, aprovado e enviado para a
 * admissão não seguram nada, porque o processo daquelas pessoas ACABOU. O que faltava era a
 * PALAVRA. É por isso que a rota serve `porSituacao`, e é da quebra que a frase nasce.
 *
 * ─ AS DUAS FAMÍLIAS SAEM DO VOCABULÁRIO, E NENHUMA LISTA NOVA É ESCRITA AQUI ──────────────────
 * `ehSaidaSemExito` já diz quem saiu SEM contratação (descartado, desistiu), e
 * `candidaturaEncerradaParaCancelamento` já diz quem conta como encerrado para esta régua. O resto
 * é subtração: encerrado que não é saída sem êxito é desfecho de APROVAÇÃO. Uma terceira lista
 * escrita à mão aqui concordaria com as duas por coincidência e divergiria na primeira situação
 * nova, que é exatamente o defeito que o vocabulário compartilhado existe para matar.
 *
 * §A.11 (sem travessão), §A.24 (é frase de apoio, escrita normal; as etiquetas da quebra usam o
 * `CANDIDATURA_SITUACAO_LABEL`, que já é title case).
 */

/**
 * UMA LINHA DA QUEBRA POR SITUAÇÃO.
 *
 * ─ O ESPELHO MORREU: O TIPO AGORA VEM DO VOCABULÁRIO COMPARTILHADO ───────────────────────────
 * Esta forma esteve declarada aqui campo por campo, como cópia do que o backend tipava, porque
 * `@ea/shared-types` é de DONO ÚNICO (§A.39) e quem o move é o coordenador. Ele moveu. Duas
 * declarações da mesma forma concordam no dia em que são escritas e divergem na primeira vez que
 * alguém acrescenta um campo em uma só, que é o defeito que este arquivo inteiro combate em outros
 * pontos. O REEXPORT mantém a porta: quem importava daqui continua importando daqui.
 */
export type { AsVagaCancelamentoPorSituacao, AsVagaCancelamentoPrevia } from "@ea/shared-types";

/** O que o modal desenha: a frase, o que o cancelamento faz com aquilo, e a quebra que sustenta. */
export interface AvisoDeProcessosEncerrados {
  /** Quantos são, e de que natureza. É a frase que não pode mentir. */
  frase: string;
  /** O que o cancelamento faz com eles, que é a pergunta seguinte de quem acabou de ler a frase. */
  nota: string;
  /** A quebra por situação, para a tela etiquetar cada uma com o rótulo do vocabulário. */
  linhas: AsVagaCancelamentoPorSituacao[];
}

/**
 * A FRASE DO AVISO, OU NADA.
 *
 * NULO QUANDO NÃO HÁ O QUE DIZER, e esse é metade do desenho: vaga sem processo encerrado não
 * mostra bloco nenhum. Um aviso dizendo "nenhum processo encerrado" apareceria na imensa maioria
 * dos cancelamentos para informar sobre coisa nenhuma, e ensinaria o time a pular o bloco no dia em
 * que ele tivesse algo a dizer.
 *
 * A CONTA SAI DA QUEBRA, E NÃO DO CAMPO `encerrados`, e a escolha é de coerência: a frase fica
 * imediatamente acima da lista, e somar a lista garante que uma nunca contradiga a outra na tela.
 * Discordando as duas, quem manda é o que está à vista.
 */
export function avisoDeProcessosEncerrados(
  previa: AsVagaCancelamentoPrevia | null,
): AvisoDeProcessosEncerrados | null {
  if (!previa) return null;
  // A quebra é filtrada pela MESMA régua do backend: o que não encerra para o cancelamento não tem
  // o que fazer neste aviso, e aceitá-lo aqui faria a frase contar gente que ainda está em processo.
  const linhas = previa.porSituacao.filter(
    (l) => l.quantos > 0 && candidaturaEncerradaParaCancelamento(l.situacao),
  );
  const semExito = somar(linhas.filter((l) => ehSaidaSemExito(l.situacao)));
  const comExito = somar(linhas.filter((l) => !ehSaidaSemExito(l.situacao)));
  const total = semExito + comExito;
  if (total === 0) return null;

  return {
    frase: fraseDoAviso(comExito, semExito, total),
    /* O QUE O CANCELAMENTO FAZ COM ELES: nada, e dizer isso é o ponto. Quem lê "1 processo já
       terminou" logo antes de um botão de cancelar precisa saber que aquele desfecho não está
       sendo desfeito, senão o aviso vira dúvida em vez de informação. */
    nota: "Cancelar a vaga não muda nenhum deles: o cancelamento alcança só quem ainda está em processo.",
    linhas,
  };
}

function somar(linhas: AsVagaCancelamentoPorSituacao[]): number {
  return linhas.reduce((acc, l) => acc + l.quantos, 0);
}

/**
 * AS TRÊS FRASES, e a diferença entre elas é a única coisa que este arquivo existe para garantir.
 *
 * "COM A PESSOA APROVADA" cobre honestamente as duas situações desta família: quem está APROVADO e
 * quem já foi ENVIADO PARA A ADMISSÃO passou pela aprovação, e a etiqueta exata de cada um fica na
 * quebra logo abaixo. "SEM CONTRATAÇÃO" cobre descartado e desistiu sem dizer de quem foi a
 * iniciativa, que é informação que a contagem não tem.
 */
function fraseDoAviso(comExito: number, semExito: number, total: number): string {
  if (semExito === 0) {
    return total === 1
      ? "Esta vaga tem 1 processo que já terminou, com a pessoa aprovada."
      : `Esta vaga tem ${total} processos que já terminaram, com as pessoas aprovadas.`;
  }
  if (comExito === 0) {
    return total === 1
      ? "Esta vaga tem 1 processo que já terminou sem contratação."
      : `Esta vaga tem ${total} processos que já terminaram sem contratação.`;
  }
  const aprovados =
    comExito === 1 ? "1 com a pessoa aprovada" : `${comExito} com as pessoas aprovadas`;
  return `Esta vaga tem ${total} processos que já terminaram: ${aprovados} e ${semExito} sem contratação.`;
}
