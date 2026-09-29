/**
 * ROTEIRO DE CAPTURA: "Ordenar A Lista Pelo Cabeçalho".
 *
 * ÂNCORA SEM PESSOA: a tabela de Integração Por Cliente lista CLIENTE (código, razão social,
 * operação). Razão social é entrada de catálogo, e o gate a dispensa pelo valor inteiro, então esta é
 * uma das poucas tabelas do sistema que pode ser fotografada por completo.
 *
 * O ALVO É O TÍTULO DA COLUNA, e ele é um botão de verdade dentro do cabeçalho (o clique é acessível
 * por teclado), então o localizador é papel mais nome, que é o que sobrevive a mudança de layout.
 *
 * AS TRÊS IMAGENS SÃO O MESMO CONTROLE EM TRÊS ESTADOS: parado, ordenado e invertido. É o único jeito
 * de um print parado ensinar um gesto que muda de estado a cada clique.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "ordenar-a-lista-pelo-cabecalho",
  url: "/admin/integracao-clientes",
  capturas: [
    {
      arquivo: "01-cabecalho-ordenavel.png",
      legenda: "Passo 1: o cabeçalho da tabela, com o par de setas em cada coluna que ordena.",
      alvos: [
        {
          papel: "button",
          nome: "Razão Social",
          texto: "1. As setas dizem que ordena",
          lado: "abaixo",
        },
        { papel: "button", nome: "Código", texto: "Vale em toda coluna", lado: "abaixo" },
      ],
    },
    {
      arquivo: "02-ordem-crescente.png",
      legenda: "Passo 2: a coluna ativa destacada, com a seta da direção apontando para cima.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Razão Social", texto: "" } }],
      alvos: [
        {
          papel: "button",
          nome: "Razão Social",
          texto: "2. Um clique, A a Z",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-ordem-invertida.png",
      legenda: "Passo 3: a mesma coluna, agora com a ordem invertida.",
      /*
       * DOIS CLIQUES, E O SEGUNDO NÃO É REDUNDANTE. Cada captura começa da TELA LIMPA: o motor
       * recarrega a rota e reaplica o preparo do roteiro antes de cada imagem que declara preparo
       * próprio. Um clique só entregaria a ordem CRESCENTE com a legenda dizendo "invertida", e o
       * `conferir` daria OK, porque o alvo existe: quem erraria é a IMAGEM, não o alvo, e print
       * errado ensina o errado com a autoridade da casa. *(Achado do agente `frontend` ao consertar
       * os preparos dos outros quatro roteiros, 28/09/2026.)*
       */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Razão Social", texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: "Razão Social", texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: "Razão Social",
          texto: "3. Outro clique, Z a A",
          lado: "abaixo",
        },
      ],
    },
  ],
};
