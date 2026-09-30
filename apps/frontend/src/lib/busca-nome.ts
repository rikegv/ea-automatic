/**
 * A RÉGUA ÚNICA DA BUSCA POR NOME, na tela.
 *
 * Sem acento e sem caixa, para "jose" achar "JOSÉ". Mesmo recorte que o `Select` e o `Combobox` do
 * design system já usam, então nenhuma tela inventa a sua.
 *
 * Mora aqui, e não dentro de uma tela, porque passou a ter DOIS consumidores: a busca dos sinais da
 * tela de Diagnóstico e a busca por nome do modal da fila degradada. Duplicar a função nos dois
 * arquivos é como as duas buscas começariam a divergir no primeiro ajuste.
 */
export function normBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
