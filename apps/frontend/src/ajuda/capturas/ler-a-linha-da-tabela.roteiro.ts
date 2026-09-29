/**
 * ROTEIRO DE CAPTURA: "Ler A Linha Da Tabela".
 *
 * ┌─ A IMAGEM AQUI **TEM** DE SER A LINHA, E É POR ISSO QUE O ARNÊS É OBRIGATÓRIO ────────────────┐
 * │ Todos os outros padrões podem ser ilustrados num controle isolado. Este não: o que se ensina é    │
 * │ a LEITURA DA LINHA, então cabeçalho sem dado não ensina nada e recorte numa etiqueta sozinha       │
 * │ perde justamente a comparação entre colunas, que é o conteúdo do artigo.                          │
 * │                                                                                                   │
 * │ A saída é a busca por `999000` no preparo: a família 999 é a dos CPFs sintéticos e a busca casa    │
 * │ CPF por pedaço, então a lista fica com as linhas do arnês. O gate segue sendo a garantia, e é      │
 * │ ele que recusa a imagem se uma linha real escapar do recorte da busca.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A LISTA DE PENDÊNCIAS **NÃO** VIRA IMAGEM, DE PROPÓSITO ────────────────────────────────────┐
 * │ O passo 5 abre a lista dos campos que faltam, e essa janela é escrita em torno do NOME da pessoa │
 * │ (ela existe para dizer o que falta para ELA). Fotografá-la seria pôr nome no centro da imagem     │
 * │ para ilustrar um gesto que o texto explica em uma linha. O passo fica sem print, com o rótulo do  │
 * │ controle declarado, que é o que a busca indexa.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS ETIQUETAS NÃO TÊM PAPEL ACESSÍVEL (são `span`), então o alvo delas é seletor de classe do design
 * system. É o localizador mais frágil do repertório, e está usado aqui por falta de outro: etiqueta
 * não é controle, e o que não é controle não tem papel.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "ler-a-linha-da-tabela",
  url: "/gerenciador",
  arnes: "arnes-seed-manual",
  preparo: [
    {
      acao: "digitar",
      alvo: { seletor: 'input[aria-label="Buscar por nome, CPF ou cliente"]', texto: "" },
      valor: "999000",
    },
  ],
  capturas: [
    {
      arquivo: "01-etiquetas-da-linha.png",
      legenda: "Passo 1: as etiquetas de status na linha, com o ícone acompanhando o estado.",
      alvos: [
        {
          seletor: ".row span.pill",
          texto: "1. A etiqueta de status",
          forma: "elipse",
          lado: "acima",
        },
        {
          papel: "button",
          nome: "Status",
          texto: "Cada frente tem a sua coluna",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-badge-de-pendencias.png",
      legenda: "Passo 4: a etiqueta de pendências obrigatórias, com a borda tracejada de botão.",
      /* A tabela rola na horizontal e a coluna de pendências fica à direita: sem rolar até ela, o
         alvo existe no documento e não aparece na imagem. */
      preparo: [
        {
          acao: "rolarAte",
          alvo: { seletor: 'button[title="Ver pendências obrigatórias"]', texto: "" },
        },
      ],
      alvos: [
        {
          seletor: 'button[title="Ver pendências obrigatórias"]',
          texto: "4. Tracejada quer dizer botão",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
