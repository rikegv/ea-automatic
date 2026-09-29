import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 4 de 14: O CARD DE INDICADOR É UM FILTRO.
 *
 * ┌─ O QUE ESTE ARTIGO CONSERTA, E NÃO É UM GESTO NOVO: É UMA AFORDÂNCIA INVISÍVEL ──────────────┐
 * │ Os cards de número no alto das telas PARECEM painel de leitura, e são botões: clicar recorta a │
 * │ lista, clicar de novo desfaz. Quem não sabe disso lê o número "com pendências obrigatórias" e  │
 * │ vai caçar as linhas na mão, uma a uma, quando o número era o próprio caminho até elas.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ÂNCORA: o Gerenciador, que tem os cinco cards do padrão e é onde eles mais valem. A imagem precisa
 * do arnês, porque a tabela embaixo dos cards mostra gente.
 */
export const artigo: Artigo = {
  slug: "filtrar-pelo-card-de-indicador",
  titulo: "Filtrar Pelo Card De Indicador",
  modulo: "COMECAR_AQUI",
  rotas: ["/gerenciador", "/esteira", "/beneficios", "/as/candidatos", "/liberacao"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Os cards de número no alto da tela são botões: clicar em um deles deixa na lista só as linhas que ele conta, e clicar de novo devolve a lista inteira.",
  termos: [
    "card",
    "cards",
    "indicador",
    "indicadores",
    "numero do topo",
    "quadradinho",
    "caixinha",
    "total",
    "clicar no numero",
    "ver quem esta pendente",
    "quem tem pendencia",
    "contagem",
  ],
  preRequisitos: [
    "Estar em uma tela que tenha cards de número no alto, como o Gerenciador ou as filas da esteira.",
    "Nada mais. O card recorta a lista, não altera dado nenhum.",
  ],
  passos: [
    {
      gesto: "Olhe a faixa de cards logo abaixo do título da tela.",
      detalhe:
        "Cada card é um recorte da mesma lista: o total, o que está em andamento, o que concluiu, o que tem pendência obrigatória e o que foi encerrado.",
      controles: [
        "Total Geral",
        "Admissões Em Andamento",
        "Admissões Concluídas",
        "Com Pendências Obrigatórias",
        "Declínios",
      ],
      print: {
        arquivo: "01-faixa-de-cards.png",
        legenda: "Passo 1: a faixa de cards de indicador, no alto da tela.",
      },
    },
    {
      gesto: "Clique no card que você quer abrir.",
      detalhe:
        "A lista abaixo passa a mostrar só as linhas daquele número. O card escolhido ganha borda destacada e um sinal de confirmação, para você saber que o recorte está ligado.",
      controles: ["Com Pendências Obrigatórias"],
      print: {
        arquivo: "02-card-ligado.png",
        legenda: "Passo 2: o card escolhido destacado, com a lista já recortada por ele.",
      },
    },
    {
      gesto: "Clique no mesmo card de novo para desligar.",
      detalhe:
        "O card funciona como interruptor. Clicar em outro card troca o recorte: é um card por vez, nunca dois somados.",
      controles: ["Total Geral"],
    },
    {
      gesto: "Use o card junto com a busca e com os filtros quando precisar afinar mais.",
      detalhe:
        "Os três recortes convivem: o card escolhe o grupo, o filtro escolhe o campo, a busca acha a pessoa.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Cliquei no card e a lista ficou vazia.",
      acao: "Há filtro ligado por baixo do card. Limpe os filtros e clique no card de novo.",
    },
    {
      sintoma: "O número do card não bate com a quantidade de linhas da lista.",
      acao: "O card conta o conjunto inteiro e a lista mostra uma página por vez. Confira o rodapé, que diz o total e em qual página você está.",
    },
    {
      sintoma: "Cliquei em dois cards e só um ficou ligado.",
      acao: "É o comportamento certo: é um card por vez. Para cruzar mais de um critério, use os filtros.",
    },
    {
      sintoma: "Não consigo desligar o recorte do card.",
      acao: "Clique no card que está destacado, ou no card de total, que é o recorte mais amplo da tela.",
    },
  ],
  regras: [
    "O card de indicador é um filtro que liga e desliga no clique.",
    "É um card por vez: escolher outro troca o recorte.",
    "O card conta o conjunto todo, e a lista mostra uma página por vez.",
    "Quem foi encerrado por declínio ou rescisão não entra nos cards de trabalho, e tem card próprio.",
    "Card, filtro e busca se somam.",
  ],
  relacionados: ["filtrar-uma-lista", "buscar-dentro-da-tela", "virar-a-pagina-da-lista"],
  fontes: [
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/frontend/src/components/ui/KpiCard.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
