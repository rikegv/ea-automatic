import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 11 de 14: PAGINAÇÃO.
 *
 * ┌─ O ARTIGO MAIS CURTO DOS QUATORZE, E O QUE MAIS DESFAZ CONTA ERRADA ─────────────────────────┐
 * │ O rodapé diz "N admissões, página X de Y", e é essa frase que resolve a dúvida recorrente "o     │
 * │ card conta 2.574 e eu só vejo 20 linhas". Não é divergência: é uma página. Quem não repara no     │
 * │ rodapé conclui que a tela está errada, e vai conferir número na mão.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "virar-a-pagina-da-lista",
  titulo: "Virar A Página Da Lista",
  modulo: "COMECAR_AQUI",
  rotas: ["/gerenciador", "/as/candidatos"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como andar entre as páginas de uma lista longa, e por que o total do rodapé é maior que a quantidade de linhas na tela.",
  termos: [
    "pagina",
    "paginas",
    "paginacao",
    "proxima",
    "anterior",
    "virar pagina",
    "so aparecem 20",
    "total nao bate",
    "quantidade de linhas",
    "ver o resto",
    "setinha",
  ],
  preRequisitos: ["Estar em uma tela com lista longa. Onde não há rodapé de página, a lista cabe inteira."],
  passos: [
    {
      gesto: "Leia o rodapé da lista.",
      detalhe:
        "Ele diz o total de registros e em qual página você está. O total é do conjunto inteiro, não da página.",
      print: {
        arquivo: "01-rodape-da-lista.png",
        legenda: "Passo 1: o rodapé da lista, com o total e a página atual.",
      },
    },
    {
      gesto: "Use as setas do rodapé para andar entre as páginas.",
      detalhe:
        "A seta da esquerda volta, a da direita avança. Elas ficam apagadas quando não há para onde ir, ou enquanto a página está carregando.",
      controles: ["Página anterior", "Próxima página"],
      print: {
        arquivo: "02-setas-de-pagina.png",
        legenda: "Passo 2: as setas que voltam e avançam a página.",
      },
    },
    {
      gesto: "Recorte a lista em vez de virar página atrás de alguém.",
      detalhe:
        "Busca, filtro e card recortam o conjunto todo, não só a página em que você está. Achar pela busca é sempre mais rápido do que folhear.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O total do rodapé não bate com as linhas que eu vejo.",
      acao: "É o esperado: o total é do conjunto inteiro e a tela mostra uma página por vez.",
    },
    {
      sintoma: "Virei a página e voltei para a primeira.",
      acao: "Mexer no filtro, na busca ou na ordem recomeça da primeira página, porque o conjunto é outro.",
    },
    {
      sintoma: "As setas estão apagadas.",
      acao: "Você está na primeira ou na última página, ou a lista ainda está carregando.",
    },
    {
      sintoma: "Ordenei e a ordem parece valer só nesta página.",
      acao: "A ordem é aplicada no conjunto todo antes de montar a página. Se parecer diferente, recarregue a tela.",
    },
  ],
  regras: [
    "O total do rodapé é do conjunto inteiro, e a tela mostra uma página por vez.",
    "Busca, filtro, card e ordenação valem para o conjunto todo, não para a página.",
    "Mexer em qualquer recorte volta para a primeira página.",
    "Onde não há rodapé de página, a lista cabe inteira na tela.",
  ],
  relacionados: [
    "buscar-dentro-da-tela",
    "filtrar-uma-lista",
    "ordenar-a-lista-pelo-cabecalho",
    "filtrar-pelo-card-de-indicador",
  ],
  fontes: ["apps/frontend/src/app/(app)/gerenciador/page.tsx"],
  revisadoEm: "2026-09-28",
};
