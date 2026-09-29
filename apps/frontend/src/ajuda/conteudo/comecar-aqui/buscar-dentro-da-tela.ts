import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 3 de 14: BUSCAR DENTRO DA TELA.
 *
 * ┌─ POR QUE BUSCA E FILTRO SÃO DOIS ARTIGOS, E NÃO UM ──────────────────────────────────────────┐
 * │ São dois recortes independentes, que se SOMAM, e confundi-los é a causa número um de "a pessoa │
 * │ desapareceu da lista": sobrou texto na busca com o filtro limpo, ou o contrário. Explicados    │
 * │ juntos, o artigo teria de dizer duas vezes qual dos dois limpar. Separados, cada um aponta     │
 * │ para o outro no "Se Der Errado", que é onde a dúvida aparece de verdade.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "buscar-dentro-da-tela",
  titulo: "Buscar Dentro Da Tela",
  modulo: "COMECAR_AQUI",
  rotas: [
    "/admin/integracao-clientes",
    "/gerenciador",
    "/esteira",
    "/beneficios",
    "/liberacao",
    "/assinaturas",
  ],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como achar uma pessoa, um cliente ou um código na lista da tela pelo campo de busca do topo, e por que não é preciso apertar nada.",
  termos: [
    "buscar",
    "busca",
    "pesquisar",
    "procurar",
    "achar",
    "localizar",
    "por nome",
    "por cpf",
    "por matricula",
    "lupa",
    "campo de pesquisa",
    "nao encontro a pessoa",
    "sumiu da lista",
  ],
  preRequisitos: [
    "Estar em qualquer tela com lista. Quase todas têm campo de busca no alto.",
    "Nada mais. Buscar não altera dado nenhum.",
  ],
  passos: [
    {
      gesto: "Clique no campo de busca, no alto da tela.",
      detalhe:
        "O próprio campo diz por quais dados ele procura. Aqui é nome, operação ou código do cliente; nas filas de admissão é nome, CPF ou cliente.",
      controles: [
        "Buscar por nome, operação ou código",
        "Buscar por nome, CPF ou cliente",
        "Buscar cliente",
      ],
      print: {
        arquivo: "01-campo-de-busca.png",
        legenda: "Passo 1: o campo de busca, no alto da lista.",
      },
    },
    {
      gesto: "Comece a digitar.",
      detalhe:
        "A lista se recorta enquanto você digita, sem apertar nada. Acento e maiúscula não importam, e um pedaço do nome já basta.",
      print: {
        arquivo: "02-lista-recortada.png",
        legenda: "Passo 2: a lista já recortada pelo que foi digitado.",
      },
    },
    {
      gesto: "Para buscar por CPF, digite só os números.",
      detalhe:
        "Ponto e traço são ignorados, e três dígitos já recortam a lista. Serve para achar a pessoa certa quando há homônimo.",
    },
    {
      gesto: "Apague o que você digitou para ver a lista inteira de novo.",
      detalhe:
        "Limpar a busca não limpa os filtros, e limpar os filtros não limpa a busca. Os dois recortes convivem, então confira os dois quando faltar alguém.",
      controles: ["Limpar filtro"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A pessoa não aparece mesmo com o nome certo.",
      acao: "Apague a busca e confira o ícone de funil: pode haver filtro ligado recortando a lista por baixo. Lembre também que cada fila mostra só quem está naquela etapa.",
    },
    {
      sintoma: "Busquei por CPF e não veio nada.",
      acao: "Digite apenas os números, sem ponto e sem traço, e pelo menos três dígitos.",
    },
    {
      sintoma: "A lista fica parada enquanto eu digito.",
      acao: "A busca das telas paginadas consulta o servidor a cada pausa na digitação. Espere um instante depois de parar de digitar.",
    },
    {
      sintoma: "Achei a pessoa, mas preciso ver o histórico dela, que não está nesta fila.",
      acao: "Use o Gerenciador: ele é a lista de todas as admissões, inclusive as encerradas e as concluídas.",
    },
  ],
  regras: [
    "A busca recorta enquanto você digita: não existe botão de pesquisar.",
    "Acento e maiúscula são ignorados, e um pedaço do texto já basta.",
    "Busca e filtro são recortes independentes e se somam. Limpar um não limpa o outro.",
    "Cada fila de trabalho mostra só quem está naquela etapa. A lista completa é o Gerenciador.",
  ],
  relacionados: ["filtrar-uma-lista", "ordenar-a-lista-pelo-cabecalho", "ler-a-linha-da-tabela"],
  fontes: [
    "apps/frontend/src/app/(app)/admin/integracao-clientes/page.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
