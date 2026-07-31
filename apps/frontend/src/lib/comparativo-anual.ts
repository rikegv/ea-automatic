/**
 * COMPARATIVO ANUAL DO CONTROLE GERENCIAL (ajuste 7 do diretor).
 *
 * A base tem 7 admissões de 2025 contra 2.389 de 2026: 2025 é resíduo da carga histórica, não um ano
 * de operação, e desenhar essa barra ao lado de 2026 sugere uma comparação que não existe.
 *
 * A LÓGICA DO COMPARATIVO CONTINUA INTEIRA, e é de propósito: o backend devolve os dois anos e o ano
 * de referência sai do relógio. O que esta regra decide é só se a barra do ano anterior RENDERIZA.
 * Quando 2027 rodar de verdade, 2026 passa o piso e o comparativo 2026 vs 2027 aparece sozinho, sem
 * ninguém tocar em código.
 *
 * O piso vale para o ANO ANTERIOR. O ano corrente só precisa ter começado: exigir volume dele também
 * seguraria o comparativo nas primeiras semanas de janeiro, que é justamente quando comparar com o
 * ano fechado mais informa.
 */
export const MINIMO_ANO_COMPARAVEL = 50;

/** Vale para o RECORTE na tela: filtrado um cliente, comparam-se os dois anos daquele cliente. */
export function deveCompararAnos(serie: { atual: number; anterior: number }[]): boolean {
  const totalAtual = serie.reduce((acc, s) => acc + s.atual, 0);
  const totalAnterior = serie.reduce((acc, s) => acc + s.anterior, 0);
  return totalAtual > 0 && totalAnterior >= MINIMO_ANO_COMPARAVEL;
}
