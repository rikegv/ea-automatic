/**
 * ROTEIRO DE CAPTURA: "Virar A Página Da Lista".
 *
 * ┌─ AQUI A BUSCA **NÃO** PODE RECORTAR A LISTA, E ISSO MUDA A PROTEÇÃO ──────────────────────────┐
 * │ Nos outros roteiros do Gerenciador a busca por `999000` é o que deixa a fila sintética. Neste ela │
 * │ destruiria o artigo: com poucas linhas não há segunda página, o rodapé vira "página 1 de 1" e as   │
 * │ setas saem apagadas, que é o oposto do que os dois passos ensinam.                                │
 * │                                                                                                   │
 * │ Então a proteção troca de mecanismo: RECORTE no rodapé. Ele contém só a frase do total, a página   │
 * │ atual e as duas setas, e nenhuma linha da tabela. Recortado, este é o print mais limpo do          │
 * │ conjunto, e o gate audita exatamente a caixa que vira imagem.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RECORTE ANCORA NO PAI DAS SETAS: a barra do rodapé não tem papel acessível nem marca própria, e o
 * caminho estável até ela é o botão que ela contém. Se a estrutura mudar, o alvo deixa de resolver e o
 * motor falha, que é o comportamento desejado.
 */
import type { Roteiro } from "../tipos";

/**
 * A BARRA DO RODAPÉ, NOMEADA PELO QUE ELA CONTÉM. O `:has()` é CSS padrão e o navegador do motor o
 * entende; o caminho `> div > button` chega ao rodapé INTEIRO (a frase do total mais as duas setas), e
 * não só à dupla de botões, que é o que a imagem precisa mostrar. É o jeito de nomear o rodapé sem
 * inventar uma marca nova numa tela de produção, o que estaria fora do escopo desta entrega.
 */
const RODAPE = 'div:has(> div > button[aria-label="Próxima página"])';

export const roteiro: Roteiro = {
  slug: "virar-a-pagina-da-lista",
  url: "/gerenciador",
  capturas: [
    {
      arquivo: "01-rodape-da-lista.png",
      legenda: "Passo 1: o rodapé da lista, com o total e a página atual.",
      recorte: { seletor: RODAPE, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Próxima página",
          texto: "1. Total e página atual",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "02-setas-de-pagina.png",
      legenda: "Passo 2: as setas que voltam e avançam a página.",
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Próxima página", texto: "" } },
      ],
      recorte: { seletor: RODAPE, texto: "" },
      alvos: [
        { papel: "button", nome: "Próxima página", texto: "2. Avança", lado: "acima" },
        { papel: "button", nome: "Página anterior", texto: "Volta", lado: "acima" },
      ],
    },
  ],
};
