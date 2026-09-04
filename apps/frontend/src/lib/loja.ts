/**
 * A COLUNA E O FILTRO DE LOJA, num lugar só.
 *
 * As duas telas que mostram loja (Esteira, nas quatro abas, e Gerenciador) precisam da MESMA régua,
 * e duas cópias dela divergiriam no primeiro ajuste, que é o defeito que a §A.28 descreve para os
 * filtros e vale igual para o rótulo. Aqui moram o rótulo da célula e as opções do filtro; as telas
 * só desenham.
 *
 * O PONTO INTEIRO DESTE ARQUIVO É QUE "SEM LOJA" SÃO DOIS CASOS OPOSTOS:
 *  - o cliente NÃO tem loja cadastrada: a admissão fica no nome do cliente, como sempre foi. É a
 *    esmagadora maioria (2.598 de 2.801 na medição de 04/09/2026) e NÃO é pendência. Chama-se MATRIZ.
 *  - o cliente TEM lojas e ninguém escolheu uma: falta alocar. É pendência de preenchimento, e a
 *    célula diz ALOCAR LOJA para que ela apareça em vez de se esconder atrás de um vazio.
 * Fundir os dois num "não informado" apagaria justamente a diferença que a coluna existe para expor.
 */

/** Uma loja do catálogo global de ativas (`GET /admin/lojas`). */
export interface LojaCatalogo {
  id: string;
  nome: string;
  codCliente: string;
  clienteNome: string;
}

/** O que a coluna Loja mostra quando não há loja escolhida. Viajam como valor do filtro também. */
export const LOJA_MATRIZ = "MATRIZ";
export const LOJA_ALOCAR = "ALOCAR_LOJA";

/** O texto da célula ALOCAR LOJA, com espaço. O valor do filtro é `ALOCAR_LOJA`, com underline. */
const ROTULO_ALOCAR = "ALOCAR LOJA";

/**
 * O RÓTULO DA CÉLULA, a partir dos dois fatos que o backend responde: o nome da loja (ou nulo) e se o
 * cliente tem catálogo de lojas. A tela nunca decide isso sozinha nem repete a regra.
 */
export function rotuloDaLoja(
  lojaNome?: string | null,
  clienteTemLojas?: boolean | null,
): string {
  if (lojaNome) return lojaNome;
  return clienteTemLojas ? ROTULO_ALOCAR : LOJA_MATRIZ;
}

/**
 * AS OPÇÕES DO FILTRO: os dois casos especiais primeiro, depois as lojas do catálogo.
 *
 * MATRIZ e ALOCAR LOJA VÊM NO TOPO porque são as duas perguntas mais prováveis: "quem não usa loja" e
 * "de quem ainda falta escolher a loja". A segunda é uma fila de trabalho, e enterrá-la no fim de uma
 * lista de lojas seria escondê-la.
 *
 * O NOME DO CLIENTE ENTRA NO RÓTULO porque nome de loja só é único DENTRO do cliente (o índice do
 * banco é `(cod_cliente, nome normalizado)`): duas "Loja Centro" de clientes diferentes são legítimas,
 * e sem o cliente ao lado a escolha seria no escuro. O rótulo também é o que a busca do `MultiSelect`
 * casa, então dá para procurar tanto pelo nome da loja quanto pelo do cliente.
 */
export function opcoesDeLoja(lojas: LojaCatalogo[]): { value: string; label: string }[] {
  return [
    { value: LOJA_MATRIZ, label: LOJA_MATRIZ },
    { value: LOJA_ALOCAR, label: ROTULO_ALOCAR },
    ...lojas
      .map((l) => ({ value: l.id, label: `${l.nome} (${l.clienteNome})` }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
  ];
}
