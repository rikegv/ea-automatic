import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 5 de 14: SELEÇÃO E AÇÃO EM LOTE.
 *
 * Sete telas oferecem seleção em massa, e o desenho é sempre o mesmo: caixa de marcar na primeira
 * coluna, barra de ações que NASCE quando existe seleção, contador dentro do rótulo do botão e um
 * atalho para soltar tudo. O que muda de tela para tela é só QUAL ação o lote dispara.
 *
 * ÂNCORA: Integração Por Cliente, que faz lote sobre CLIENTE e não sobre pessoa. É o mesmo gesto do
 * lote de liberação e do lote de agendamento, com a vantagem de a imagem não depender do arnês.
 */
export const artigo: Artigo = {
  slug: "agir-em-varias-linhas-de-uma-vez",
  titulo: "Agir Em Várias Linhas De Uma Vez",
  modulo: "COMECAR_AQUI",
  rotas: [
    "/admin/integracao-clientes",
    "/admin/pendencias-cliente",
    "/liberacao",
    "/esteira",
    "/as/vagas",
  ],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como marcar várias linhas da lista e aplicar a mesma ação em todas de uma vez, sem repetir o gesto linha por linha.",
  termos: [
    "lote",
    "em lote",
    "massa",
    "em massa",
    "varios",
    "varias",
    "selecionar",
    "marcar",
    "caixinha",
    "checkbox",
    "de uma vez",
    "tudo junto",
    "limpar selecao",
    "desmarcar",
  ],
  preRequisitos: [
    "Estar em uma tela que tenha caixa de marcar na primeira coluna. Onde ela não existe, a ação é uma por linha.",
    "Ter permissão para a ação que você vai aplicar. Sem ela, o botão do lote não aparece.",
  ],
  passos: [
    {
      gesto: "Recorte a lista antes de marcar.",
      detalhe:
        "Busque ou filtre primeiro, para as linhas que você quer ficarem juntas na tela. Marcar em lista longa é onde entra linha errada no meio.",
      controles: ["Buscar por nome, operação ou código"],
    },
    {
      gesto: "Marque a caixa da primeira coluna em cada linha que você quer incluir.",
      detalhe:
        "A marcação vale por linha e você pode marcar quantas quiser. Nada acontece no momento da marcação: ela só monta o grupo.",
      controles: ["Selecionar"],
      print: {
        arquivo: "01-marcar-as-linhas.png",
        legenda: "Passo 2: a caixa de marcar na primeira coluna da linha.",
      },
    },
    {
      gesto: "Veja a barra de ações que aparece no alto, com a contagem dentro do botão.",
      detalhe:
        "O número entre parênteses é quantas linhas estão marcadas. Confira esse número antes de clicar: ele é a sua última chance de perceber uma linha a mais.",
      controles: ["Não exigir", "Exigir", "Limpar seleção"],
      print: {
        arquivo: "02-barra-do-lote.png",
        legenda: "Passo 3: a barra de ações do lote, com a contagem das linhas marcadas.",
      },
    },
    {
      gesto: "Clique na ação que você quer aplicar e confirme na janela.",
      detalhe:
        "A confirmação repete quantas linhas serão alteradas e o que vai acontecer com elas. Ação em lote não se desfaz em lote: desfazer é linha por linha.",
      controles: ["Confirmar", "Cancelar"],
      print: {
        arquivo: "03-confirmar-o-lote.png",
        legenda: "Passo 4: a janela de confirmação, com a quantidade de linhas do lote.",
      },
    },
    {
      gesto: "Para soltar a seleção sem aplicar nada, clique em Limpar seleção.",
      detalhe:
        "Trocar o filtro ou a busca também pode soltar a seleção. Se você já marcou, termine o lote antes de mexer no recorte da lista.",
      controles: ["Limpar seleção"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A barra de ações não aparece.",
      acao: "Nenhuma linha está marcada, ou a ação exige um nível de acesso que o seu usuário não tem. Marque uma linha e confira com a administração.",
    },
    {
      sintoma: "A contagem do botão está maior do que eu marquei.",
      acao: "Sobrou marcação de um recorte anterior da lista. Clique em Limpar seleção e comece de novo, já com a lista recortada.",
    },
    {
      sintoma: "Apliquei em uma linha errada.",
      acao: "Desfaça naquela linha, uma a uma. O lote é só a forma de aplicar, e o desfazer continua sendo individual.",
    },
    {
      sintoma: "Marquei as linhas, troquei o filtro e perdi a seleção.",
      acao: "É esperado. Recorte a lista primeiro e marque depois.",
    },
    {
      sintoma: "Parte do lote deu certo e parte não.",
      acao: "A tela informa quantas passaram e quais recusaram, com o motivo. Resolva as recusadas linha por linha e refaça o lote só com elas.",
    },
  ],
  regras: [
    "A marcação não aplica nada por si: ela só monta o grupo.",
    "A contagem dentro do botão é a quantidade de linhas do lote, e é ela que você confere antes de confirmar.",
    "Ação em lote não se desfaz em lote.",
    "Trocar filtro ou busca pode soltar a seleção. Recorte primeiro, marque depois.",
    "Onde não há caixa de marcar, a ação é uma por linha, de propósito.",
  ],
  relacionados: [
    "filtrar-uma-lista",
    "buscar-dentro-da-tela",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/integracao-clientes/page.tsx",
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/frontend/src/components/ui/ConfirmDialog.tsx",
  ],
  revisadoEm: "2026-09-28",
};
