/**
 * ─ A RECUSA DO FECHAMENTO POR POSIÇÃO OFICIAL ABERTA, E A TRILHA DO QUE FOI FORÇADO ───────────
 *
 * A RÉGUA É DO DIRETOR: a vaga só fecha quando TODAS as posições OFICIAIS estão preenchidas, o banco
 * não participa da conta, e só o MASTER pode encerrar assim mesmo, deixando trilha.
 *
 * ESTE ARQUIVO NÃO DECIDE NADA, ele só LÊ a decisão que já veio do servidor. A autoridade é a trava
 * do backend, medida dentro da transação com a linha da vaga travada; aqui ficam as duas peças que a
 * tela precisa e que erram em silêncio se não forem testadas:
 *
 *  1. RECONHECER a recusa no meio de um erro HTTP genérico, e
 *  2. ESCREVER a trilha do forçamento sem mentir sobre o que o número significa.
 *
 * CASA-SE PELO CAMPO `motivo`, NUNCA PELO TEXTO DA MENSAGEM. É o padrão que os outros três parsers de
 * 409 deste módulo já usam (`candidatosPendentes`, `reentradaAposEncerramento`,
 * `bancoComOficiaisAbertas`): a frase muda no singular, no plural e em qualquer ajuste de texto, e um
 * parser casado por frase para de reconhecer a própria recusa sem nada falhar.
 *
 * §A.6: aqui entram números de posições da vaga e um nome de usuário INTERNO. Nenhum dado de
 * candidato, nenhum CPF.
 * §A.11 (sem travessão), §A.24 (as frases daqui são apoio, escrita normal).
 */

import type { FechamentoForcado, FecharVagaRecusa } from "@ea/shared-types";
import { ApiError } from "@/lib/api";

/**
 * A RECUSA POR POSIÇÃO OFICIAL ABERTA, reconhecida pelo CORPO.
 *
 * OS CAMPOS SÃO CONFERIDOS, e não presumidos do `motivo`: é `podeForcar` que decide se a tela desenha
 * o gesto de forçar, e `faltam` que ela escreve na frente do consultor. Um corpo pela metade,
 * aceito por causa do discriminador, viraria "faltam undefined posições" na tela.
 *
 * A TELA ESCONDER O BOTÃO É CONVENIÊNCIA, O GUARD É A AUTORIDADE: `podeForcar` serve para o COMUM não
 * ver um botão que vai receber 403, e para mais nada. Quem barra o forçamento é o servidor, que
 * recalcula o papel quando o `forcar` chega.
 */
export function fechamentoRecusadoPorPosicoes(err: unknown): FecharVagaRecusa | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const corpo = err.data as Partial<FecharVagaRecusa> | undefined;
  if (corpo?.motivo !== "POSICOES_OFICIAIS_ABERTAS") return null;
  if (typeof corpo.faltam !== "number" || typeof corpo.podeForcar !== "boolean") return null;
  return corpo as FecharVagaRecusa;
}

/**
 * A FRASE DA TRILHA DO FECHAMENTO FORÇADO.
 *
 * ELA DIZ "NAQUELE MOMENTO", E ISSO NÃO É ENFEITE DE REDAÇÃO. O `faltavam` é CONGELADO no instante do
 * forçamento e nunca recalculado: a vaga continua viva depois disso (alguém pode ser descartado, a
 * meta pode mudar), então uma frase no presente faria a trilha contar uma história diferente da que
 * aconteceu, e faria isso justamente no registro que existe para guardar a exceção.
 *
 * O AUTOR PODE SER NULO (usuário removido depois), e a frase diz "não informado" (§A.11) em vez de
 * esconder a linha: a exceção aconteceu, e perder o autor não apaga o fato.
 */
export function fraseDoFechamentoForcado(f: FechamentoForcado, quando: string): string {
  const quantas =
    f.faltavam === 1 ? "1 posição oficial estava aberta" : `${f.faltavam} posições oficiais estavam abertas`;
  return `Encerrada assim mesmo por ${f.porNome ?? "não informado"} em ${quando}. Naquele momento, ${quantas}.`;
}
