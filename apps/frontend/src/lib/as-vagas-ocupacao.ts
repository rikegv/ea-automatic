/**
 * ─ QUANTAS POSIÇÕES DA VAGA JÁ ESTÃO PREENCHIDAS (Central de Vagas, coluna Posições) ──────────
 *
 * A RÉGUA MORA AQUI, e não dentro da tela, por dois motivos. Primeiro, ela é a peça ÚNICA que a
 * coluna inteira lê: número, barra e `title` saem daqui, e nada mais na tabela recalcula
 * preenchimento (a ordenação da coluna ordena pela META, `posicoesOficiais`, não por isto).
 * Segundo, ela é o coração da etapa e precisa de teste de unidade, o que exigiria montar a página
 * inteira se ela continuasse dentro do `page.tsx`.
 *
 * A RÉGUA, DECISÃO DO DIRETOR (07/09/2026), VALE IGUAL PARA OS DOIS CILINDROS:
 *
 *  - VAGA VIVA (RASCUNHO, ABERTA): o cilindro lê a DERIVADA, que é a realidade das alocações de
 *    agora. O OFICIAL lê `ocupacao.finalizadasOficial` e o BANCO lê `ocupacao.finalizadasBanco`.
 *    Vaga viva SEMPRE tem contagem, mesmo que ela seja zero.
 *  - VAGA ENCERRADA (ENTREGUE, FECHADA, CANCELADA): o cilindro mantém o número CONGELADO no
 *    fechamento, que é o número autoritativo dela. O OFICIAL lê `vagasFechadas` e o BANCO lê
 *    `vagasFechadasBanco`.
 *
 * POR QUE A ENCERRADA NÃO LÊ A DERIVADA, e isto não é esquecimento: nas vagas antigas ninguém nunca
 * foi marcado como alocado, então a derivada delas é ZERO. Lida pela derivada, a PS-2026-001
 * (encerrada, contada com 1 de 3 no fechamento) passaria a mostrar "0 de 3", e o histórico viraria
 * mentira.
 *
 * O NÚMERO DA DERIVADA É O `finalizadas*`, NUNCA `ocupadas`. As `finalizadas` são as posições
 * ENTREGUES; `ocupadas` inclui quem só foi aprovado e ainda não entrou, e responde a outra pergunta,
 * a da trava de fechamento. Trocar um pelo outro encheria o cilindro com gente que ainda pode não
 * vir.
 *
 * ─ POR QUE CADA CILINDRO LÊ O SEU LADO, e por que ANTES ELE NÃO LIA (08/09/2026) ───────────────
 *
 * Até 08/09 o contrato tinha UM número de entregues, `ocupacao.finalizadas`, que é o TOTAL dos dois
 * lados somados. Com um total só, o cilindro OFICIAL contava quem tinha sido entregue à RESERVA: na
 * vaga real de homologação (5 oficiais e 20 de banco), a primeira pessoa entregue ao banco acendia o
 * cilindro oficial, que tem zero posição oficial preenchida. E o cilindro de BANCO não tinha número
 * derivado nenhum para ler, então ficava no valor digitado no fechamento mesmo na vaga viva, que é
 * como um contador de vaga aberta acabava sempre vazio.
 *
 * O contrato passou a servir `finalizadasOficial` e `finalizadasBanco`, com
 * `finalizadas === finalizadasOficial + finalizadasBanco` por construção (os dois saem da mesma
 * leitura das candidaturas, separados pelo lado da posição). Cada cilindro lê o seu, e o TOTAL não é
 * lido por ninguém aqui: desenhar o total em qualquer um dos dois enche o cilindro errado.
 */

import type { VagaListItem, VagaStatus } from "@ea/shared-types";

/**
 * OS ESTADOS EM QUE A VAGA JÁ TERMINOU. A vaga encerrada tem `dataFechamento` escrita pela ação de
 * fechar, e é ela que CONGELA o contador de dias (decisão do diretor, 27/08) e, desde 07/09, também
 * o contador de posições preenchidas.
 *
 * CANCELADA entra na lista porque ela É um encerramento, mesmo que hoje nenhuma rota escreva esse
 * status: quando a ação de cancelar existir, os dois contadores já vão congelar sozinhos, sem
 * ninguém ter de lembrar de voltar aqui.
 */
export const VAGA_STATUS_ENCERRADOS: VagaStatus[] = ["ENTREGUE", "FECHADA", "CANCELADA"];

export function vagaEncerrada(status: VagaStatus): boolean {
  return VAGA_STATUS_ENCERRADOS.includes(status);
}

/** Os dois contadores da vaga (decisão do diretor, 25/08): a contratação de verdade e o excedente. */
export type LadoPosicoes = "oficial" | "banco";

/**
 * DE ONDE VEIO O NÚMERO que o cilindro desenha. O `title` diz coisas diferentes conforme a origem,
 * porque a barra vazia de "ninguém contou ainda" não é a mesma barra vazia de "contaram zero".
 *
 *  - `derivada`: a conta acompanha as alocações de agora. É a vaga VIVA, nos DOIS lados, desde que
 *    o contrato passou a separar as entregues por lado (08/09).
 *  - `fechamento`: o número foi contado no fechamento da vaga e não muda mais.
 *  - `ausente`: ninguém contou nada. Sobrou só para a vaga ENCERRADA cujo fechamento não gravou
 *    aquele contador, que é o caso das vagas antigas sem banco digitado.
 */
export type OrigemContagem = "derivada" | "fechamento" | "ausente";

/**
 * O RECORTE DO ITEM que a régua precisa ler. Ela não usa o resto da vaga, e pedir o item inteiro só
 * obrigaria cada teste a montar 38 campos para conferir uma conta de dois.
 */
export type VagaContagem = Pick<
  VagaListItem,
  "status" | "vagasFechadas" | "vagasFechadasBanco" | "ocupacao"
>;

/** Quantas posições daquele lado já estão preenchidas, pela régua do topo do arquivo. */
export function preenchidas(v: VagaContagem, lado: LadoPosicoes): number {
  if (vagaEncerrada(v.status)) {
    return (lado === "oficial" ? v.vagasFechadas : v.vagasFechadasBanco) ?? 0;
  }
  /*
   * O `?.` É DELIBERADO e não é desconfiança do tipo: `ocupacao` é obrigatório em `VagaListItem` e o
   * backend sempre o serve, inclusive zerado. Ele protege a JANELA DE PUBLICAÇÃO, em que a tela nova
   * pode alcançar um backend ainda antigo: sem ele, a Central de Vagas inteira quebraria na primeira
   * linha, em vez de desenhar um cilindro vazio por alguns minutos. O mesmo vale para o `?? 0` dos
   * campos por lado, que o backend antigo não serve.
   */
  return (lado === "oficial" ? v.ocupacao?.finalizadasOficial : v.ocupacao?.finalizadasBanco) ?? 0;
}

/** De onde saiu o número daquele lado, para o `title` do cilindro dizer a verdade. */
export function origemContagem(v: VagaContagem, lado: LadoPosicoes): OrigemContagem {
  if (!vagaEncerrada(v.status)) return "derivada";
  const doFechamento = lado === "oficial" ? v.vagasFechadas : v.vagasFechadasBanco;
  return typeof doFechamento === "number" ? "fechamento" : "ausente";
}
