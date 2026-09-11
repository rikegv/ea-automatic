/**
 * ─ A RECUSA DO CANCELAMENTO DA VAGA, LIDA DO CORPO DO 409 ─────────────────────────────────────
 *
 * ESTE ARQUIVO NÃO DECIDE NADA, ele LÊ a decisão que já veio do servidor. É o gêmeo do
 * `as-vaga-fechamento`, e existe pela mesma razão: reconhecer uma recusa ESTRUTURADA no meio de um
 * erro HTTP genérico é a peça que erra em silêncio. Um parser que deixe de reconhecer o corpo devolve
 * a tela ao "leia a frase e vire-se", sem nada falhar e sem ninguém perceber.
 *
 * CASA-SE PELO CAMPO `reason`, NUNCA PELO TEXTO DA MENSAGEM, no padrão dos outros quatro parsers de
 * 409 deste módulo (`candidatosPendentes`, `reentradaAposEncerramento`, `bancoComOficiaisAbertas`,
 * `POSICOES_OFICIAIS_ABERTAS`): a frase muda no singular, no plural e em qualquer ajuste de texto, e
 * um parser casado por frase para de reconhecer a própria recusa que ele existe para reconhecer.
 *
 * OS CAMPOS SÃO CONFERIDOS, e não presumidos do discriminador. É `podeForcar` que decide se a tela
 * desenha o gesto de forçar, e é `naoEncerrados` que ela LISTA. Um corpo pela metade, aceito por
 * causa do `reason`, viraria uma caixa vazia dizendo que há gente em processo sem dizer quem.
 *
 * `podeForcar` É CONVENIÊNCIA DA TELA, NUNCA A TRAVA, e isto é o contrato, não interpretação: o
 * servidor recalcula o papel a cada requisição e responde 403 ao COMUM que mandar `forcar: true`.
 * Este campo serve para o consultor comum não ver um botão que só sabe falhar, e para mais nada.
 *
 * §A.6: nome, etapa, situação e os ids da candidatura, exatamente o que a recusa do fechamento já
 * trafega hoje em produção. Sem CPF, sem contato, sem identificador direto da pessoa.
 * §A.11 (sem travessão), §A.24 (as frases daqui são apoio, escrita normal).
 */

import {
  candidaturaEncerradaParaCancelamento,
  ehSaidaSemExito,
  type AsVagaCancelamentoBloqueado,
  type AsVagaCancelamentoPorSituacao,
  type AsVagaCancelamentoPrevia,
} from "@ea/shared-types";
import { ApiError } from "@/lib/api";

/**
 * A RECUSA POR CANDIDATO NÃO ENCERRADO, reconhecida pelo CORPO do 409.
 *
 * O OUTRO 409 DESTA MESMA ROTA NÃO CAI AQUI, e é de propósito: a vaga que já saiu de ABERTA responde
 * "Esta vaga já foi encerrada. Recarregue a página.", sem `reason` e sem lista, e segue pelo caminho
 * genérico de erro, que é onde a frase do backend aparece inteira. Duas recusas, dois tratamentos.
 */
export function cancelamentoBloqueadoPorCandidatos(
  err: unknown,
): AsVagaCancelamentoBloqueado | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const corpo = err.data as Partial<AsVagaCancelamentoBloqueado> | undefined;
  if (corpo?.reason !== "candidatosNaoEncerrados") return null;
  if (!Array.isArray(corpo.naoEncerrados)) return null;
  if (typeof corpo.podeForcar !== "boolean") return null;
  return corpo as AsVagaCancelamentoBloqueado;
}

/**
 * O QUE O CANCELAMENTO FORÇADO FAZ COM QUEM AINDA ESTÁ EM PROCESSO, dito ANTES do clique.
 *
 * ISTO NÃO É DETALHE DE IMPLEMENTAÇÃO, é o EFEITO QUE A PESSOA ESTÁ AUTORIZANDO: forçar encerra as
 * candidaturas que seguram o cancelamento, marcando cada uma como descartada com o motivo do
 * cancelamento. Quem clica precisa ler isso, com o número de pessoas na frente, porque não há como
 * desfazer descarte em lote pela tela.
 *
 * POR QUE O EFEITO EXISTE (e por que ele não pode ser "só cancelar a vaga e deixar a lista quieta"):
 * candidatura viva dentro de vaga cancelada nunca seria expurgada pela retenção, ou seja, dado
 * pessoal ficaria parado para sempre num processo que ninguém vai retomar. É exigência de LGPD
 * (§A.6), e é por isso que o cancelamento forçado encerra em vez de abandonar.
 *
 * §A.24: frase de apoio, escrita normal.
 */
export function fraseDoCancelamentoForcado(quantos: number): string {
  const pessoas =
    quantos === 1
      ? "a 1 pessoa que ainda está em processo"
      : `as ${quantos} pessoas que ainda estão em processo`;
  return `Cancelando assim mesmo, o sistema ENCERRA ${pessoas} nesta vaga: cada candidatura é marcada como descartada, com o motivo do cancelamento registrado. Isso não se desfaz pela tela, e fica no histórico com o seu nome e a data.`;
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
