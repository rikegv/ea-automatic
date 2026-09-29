import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 1 de 14: FILTRAR.
 *
 * ┌─ POR QUE ISTO É **UM** ARTIGO, E NÃO UM POR TELA ────────────────────────────────────────────┐
 * │ São 69 campos de filtro em 10 telas, e todos os 69 saem de DOIS componentes: o gatilho        │
 * │ (`FiltroTrigger`) e o seletor múltiplo (`MultiSelect`). Quem aprende aqui sabe filtrar em     │
 * │ qualquer tela do sistema, e cada artigo de tela passa a REFERENCIAR este em vez de reexplicar │
 * │ o mesmo gesto. Sem este artigo, o manual explicaria filtro 38 vezes e as 38 explicações       │
 * │ divergiriam no primeiro ajuste do componente.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A TELA DE ÂNCORA É AS DICAS POR DOCUMENTO, e a escolha é deliberada: ela tem os dois campos de
 * filtro do padrão (um curto e um longo, com busca interna) e NÃO mostra pessoa nenhuma, então o
 * print sai sem recorte e sem depender do arnês. O texto fala do gesto genérico e nomeia as outras
 * telas onde ele é o mesmo.
 */
export const artigo: Artigo = {
  slug: "filtrar-uma-lista",
  titulo: "Filtrar Uma Lista",
  modulo: "COMECAR_AQUI",
  /*
   * AS ROTAS SÃO AS TELAS EM QUE O GATILHO DE FILTRO EXISTE DE VERDADE, e é isso que faz o botão de
   * ajuda daquela tela oferecer este artigo. Não é a lista das 10: estão aqui a tela de âncora e as
   * telas em que o filtro é o gesto mais usado do dia.
   */
  rotas: [
    "/admin/dicas-documento",
    "/gerenciador",
    "/esteira",
    "/nao-conformidades",
    "/beneficios",
    "/as/vagas",
    "/as/candidatos",
  ],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como recortar qualquer lista do sistema pelo ícone de filtro: escolher vários valores ao mesmo tempo, saber quantos filtros estão ligados e limpar tudo de uma vez.",
  termos: [
    "filtrar",
    "filtro",
    "filtros",
    "colocar filtro",
    "como filtro",
    "peneirar",
    "achar",
    "refinar",
    "selecionar varios",
    "mais de um cliente",
    "limpar filtro",
    "tirar o filtro",
    "funil",
    "embudo",
  ],
  preRequisitos: [
    "Estar em qualquer tela que tenha lista, o gesto é o mesmo em todas.",
    "Nada mais. Filtrar não altera dado nenhum: é só a forma de olhar a lista.",
  ],
  passos: [
    {
      gesto: "Procure o ícone de funil no alto da lista, à direita, e clique nele.",
      detalhe:
        "O funil é o mesmo em toda tela. Quando já existe filtro ligado, ele fica destacado e mostra um número: é a quantidade de filtros ativos naquele momento.",
      controles: ["Abrir filtros", "Filtrar"],
      print: {
        arquivo: "01-gatilho-do-filtro.png",
        legenda: "Passo 1: o ícone de funil que abre os filtros da tela.",
      },
    },
    {
      gesto: "Na janela Filtros, escolha o campo pelo qual você quer recortar a lista.",
      detalhe:
        "Cada tela oferece os campos que fazem sentido nela. Aqui são a situação e o documento; no Gerenciador são cliente, cargo, loja, projeto, grupo, contrato, status, pendências e período.",
      /*
       * "Contrato" É O RÓTULO DO CAMPO DE FILTRO, e não o cabeçalho da coluna: a coluna é desenhada em
       * maiúscula pela tabela e o campo do painel de filtro, não. São o mesmo dado em dois controles, e
       * o que este passo ensina é o do painel. Ele repete em Gerenciador e Esteira, que é o que o faz
       * padrão do sistema em vez de próprio de uma tela.
       */
      controles: ["Filtros", "Situação", "Documento", "Contrato", "Todas", "Todos"],
      print: {
        arquivo: "02-janela-de-filtros.png",
        legenda: "Passo 2: a janela Filtros, com um campo por linha.",
      },
    },
    {
      gesto: "Clique no campo e marque quantos valores você quiser.",
      detalhe:
        "Todo filtro do sistema aceita mais de um valor ao mesmo tempo: dois clientes, três status, quatro documentos. O que você marcou aparece logo abaixo do campo, e cada escolha tem um x próprio para sair sozinha.",
      controles: ["Selecionar…", "Buscar…", "Nenhum resultado."],
      print: {
        arquivo: "03-varias-opcoes-marcadas.png",
        legenda: "Passo 3: o campo aberto, com mais de um valor marcado.",
      },
    },
    {
      gesto: "Digite no campo de busca de dentro do seletor quando a lista de opções for longa.",
      detalhe:
        "A busca aparece sozinha nas listas grandes, como o catálogo de clientes e o de documentos. Ela ignora acento e maiúscula, então escrever sem acento acha do mesmo jeito.",
      controles: ["Buscar…"],
    },
    {
      gesto: "Feche a janela e veja a lista já recortada.",
      detalhe:
        "O filtro vale no instante em que você marca: não existe botão de aplicar. Fechar a janela só devolve a tela cheia para você trabalhar.",
      controles: ["Fechar"],
    },
    {
      gesto: "Para voltar a ver tudo, abra a janela de novo e clique em Limpar filtros.",
      detalhe:
        "Isso zera todos os campos de uma vez. Algumas telas também têm um atalho Limpar filtro ao lado da busca, que faz a mesma coisa sem abrir a janela.",
      controles: ["Limpar filtros", "Limpar filtro"],
      print: {
        arquivo: "04-limpar-filtros.png",
        legenda: "Passo 6: o atalho que zera todos os filtros da tela.",
      },
    },
  ],
  seDerErrado: [
    {
      sintoma: "A lista ficou vazia.",
      acao: "Você cruzou filtros que não convivem. Abra a janela e clique em Limpar filtros, depois marque um campo de cada vez.",
    },
    {
      sintoma: "Marquei um valor e a opção que eu queria somar desapareceu da lista.",
      acao: "Isso não deveria acontecer: as opções vêm do catálogo do sistema, não da página carregada. Se acontecer, limpe os filtros, avise a administração e refaça a escolha.",
    },
    {
      sintoma: "Não acho a pessoa mesmo sem filtro nenhum.",
      acao: "Confira se sobrou texto na busca da tela, que é um recorte separado do filtro. E lembre que cada fila mostra só quem está naquela etapa: quem já concluiu é encontrado pelo Gerenciador.",
    },
    {
      sintoma: "O ícone de funil não aparece.",
      acao: "Aquela tela não tem filtro próprio. Use a busca do topo, que existe em quase todas.",
    },
  ],
  regras: [
    "Todo filtro do sistema aceita vários valores ao mesmo tempo.",
    "As opções vêm do catálogo do sistema, e não da página que está carregada: somar um segundo valor nunca exige limpar o primeiro.",
    "Filtro e busca são coisas diferentes e se somam: a busca procura pelo texto, o filtro recorta por campo.",
    "O filtro é só o seu jeito de olhar a lista. Ele não muda nada do que está guardado, e ninguém mais vê o seu recorte.",
    "O número no ícone de funil é a quantidade de filtros ligados, não a quantidade de linhas.",
  ],
  relacionados: [
    "buscar-dentro-da-tela",
    "filtrar-pelo-card-de-indicador",
    "ordenar-a-lista-pelo-cabecalho",
    "virar-a-pagina-da-lista",
  ],
  fontes: [
    "apps/frontend/src/components/ui/FiltroTrigger.tsx",
    "apps/frontend/src/components/ui/MultiSelect.tsx",
    "apps/frontend/src/components/ui/Select.tsx",
    "apps/frontend/src/app/(app)/admin/dicas-documento/page.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
