import type { Artigo } from "../../tipos";

/**
 * N1 DO GERENCIADOR 1 de 4: ACHAR A PESSOA.
 *
 * ┌─ O QUE ESTE ARTIGO ENSINA, E O QUE ELE DE PROPÓSITO NÃO ENSINA ──────────────────────────────┐
 * │ Aqui está o caminho principal: entrar, procurar, recortar e ler a linha até bater o olho na    │
 * │ pessoa. O GESTO de filtrar, de ordenar, de virar página e de exportar já é artigo do módulo     │
 * │ Começar Aqui, e é o mesmo em dez telas: repetir o gesto aqui criaria a segunda explicação que   │
 * │ diverge no primeiro ajuste do componente. Este artigo diz QUAIS campos esta tela oferece e o    │
 * │ que cada coluna dela significa, que é a parte que só existe aqui.                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ARMADILHA DE NOME QUE O ARTIGO PRECISA DESARMAR NO PRIMEIRO PASSO ────────────────────────┐
 * │ O menu da lateral diz "Gerenciador" e o TÍTULO da página diz "Esteira Admissional"             │
 * │ (`app/(app)/gerenciador/page.tsx`, PageHead). São dois textos diferentes para a mesma tela, e   │
 * │ existe OUTRA tela chamada Esteira Admissional, com abas e filas. Quem clica no menu certo e lê  │
 * │ o título acha que errou o caminho. O artigo avisa no passo 1, em vez de deixar a pessoa voltar. │
 * │ §A.14: o texto da tela não foi tocado, só documentado.                                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Todo `controles` abaixo foi lido do `page.tsx`, letra por letra, inclusive a abreviação
 * ("Data adm.", "Pendências Obrig.") e o acento. Os rótulos dos campos do painel de filtro são os do
 * `FiltroCampo`; os nomes acessíveis dos seletores ("Loja ou unidade", "Status (farol)") são outros,
 * e quem os usa é o roteiro de captura, não o texto.
 */
export const artigo: Artigo = {
  slug: "achar-uma-admissao-no-gerenciador",
  titulo: "Achar Uma Admissão No Gerenciador",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "Como encontrar qualquer admissão do sistema pelo Gerenciador: a busca por nome ou CPF, os cards do topo, os nove campos de filtro da tela e o que cada coluna da linha quer dizer.",
  termos: [
    "achar",
    "procurar",
    "localizar",
    "encontrar candidato",
    "buscar pessoa",
    "buscar cpf",
    "onde esta a admissao",
    "lista de admissoes",
    "todas as admissoes",
    "gerenciador",
    "admissao concluida",
    "quem declinou",
    "matriz",
    "alocar loja",
  ],
  preRequisitos: [
    "Saber pelo menos um dado da pessoa: parte do nome, o CPF ou o cliente dela.",
  ],
  passos: [
    {
      gesto: "Clique em Gerenciador, no menu da lateral esquerda.",
      detalhe:
        "O título no alto da página lê Esteira Admissional. É a tela certa, o nome do menu e o do título são diferentes. A tela de filas por etapa é outra, com abas no topo.",
      controles: ["Gerenciador", "Esteira Admissional"],
      print: {
        arquivo: "01-lista-do-gerenciador.png",
        legenda: "Passo 1: o Gerenciador aberto, com a busca, os cinco cards e a lista.",
      },
    },
    {
      gesto: "Digite o nome, o CPF ou o cliente na busca do topo à direita.",
      detalhe:
        "A busca procura nos três ao mesmo tempo e recorta a lista pouco depois de você parar de digitar, sem apertar nada. O CPF pode ser digitado só com números, sem ponto e sem traço.",
      controles: ["Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Use os cards do topo para ver um grupo inteiro de uma vez.",
      detalhe:
        "Cada card é um filtro, e vale um por vez: escolher outro desliga o anterior, e clicar no card aceso volta a mostrar tudo. Total Geral é o estado sem recorte nenhum.",
      controles: [
        "Total Geral",
        "Admissões Em Andamento",
        "Admissões Concluídas",
        "Com Pendências Obrigatórias",
        "Declínios",
      ],
    },
    {
      gesto: "Clique no funil, ao lado da busca, para recortar por campo.",
      detalhe:
        "São nove campos, e todos aceitam mais de um valor ao mesmo tempo. Período filtra pela data de admissão, com De e Até.",
      controles: [
        "Cliente",
        "Cargo",
        "Loja",
        "Projeto",
        "Grupo",
        "Contrato",
        "Status",
        "Pendências",
        "Período",
        "De",
        "Até",
      ],
      print: {
        arquivo: "02-filtros-do-gerenciador.png",
        legenda: "Passo 4: a janela Filtros do Gerenciador, com os nove campos da tela.",
      },
    },
    {
      gesto: "Leia a linha da esquerda para a direita até reconhecer a pessoa.",
      detalhe:
        "Candidato é o nome, Cliente é o nome da operação, e o código do cliente aparece só na ficha. Loja é a unidade onde a pessoa trabalha, Projeto é o projeto de Alto Volume, e as três colunas de etapa mostram a situação de Auditoria, Exame e Cadastro.",
      controles: [
        "Candidato",
        "Cliente",
        "Loja",
        "Projeto",
        "Cargo",
        "Contrato",
        "Data adm.",
        "Status",
        "Auditoria",
        "Exame",
        "Cadastro",
        "Pendências Obrig.",
        "Ações",
      ],
      print: {
        arquivo: "03-linha-da-lista.png",
        legenda: "Passo 5: uma linha da lista, com as colunas de etapa e o botão de abrir a ficha.",
      },
    },
    {
      /*
       * SEM `controles` DE PROPÓSITO: os títulos de coluna que este passo manda clicar são os MESMOS
       * do passo anterior, já declarados letra por letra. Repeti-los aqui inflaria a medição de
       * cobertura sem indexar nada de novo, e o índice "Nesta Tela" passaria a listar a mesma coluna
       * duas vezes. O gesto genérico de ordenar é artigo próprio, referenciado em relacionados.
       */
      gesto: "Clique no título de uma coluna para ordenar a lista por ela.",
      detalhe:
        "A ordenação vale para a lista inteira, e não só para a página aberta: a primeira linha da tela é a primeira de todas. Clicar de novo inverte.",
    },
    {
      gesto: "Achou a pessoa? Clique no olho, na coluna Ações, para abrir a ficha dela.",
      detalhe:
        "O lápis ao lado abre a mesma admissão em modo de edição. O ícone de lixeira só aparece para quem é Master ou Super Admin.",
      controles: ["Ver ficha", "Editar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A lista diz Nenhuma admissão com os filtros atuais.",
      acao: "Você cruzou recortes que não convivem, por exemplo o card Declínios com um período de admissão futuro. Clique em Limpar filtro e recomece por um campo só.",
    },
    {
      sintoma: "Digitei o CPF e não veio nada.",
      acao: "Tente só os números, sem ponto e sem traço, e confira se sobrou algum filtro ligado. Se ainda não vier, a pessoa pode estar aguardando liberação, e nesse caso ela está na Liberação Admissional, não aqui.",
    },
    {
      sintoma: "A pessoa aparece na busca mas o nome está diferente do que eu digitei.",
      acao: "A lista mostra o nome em caixa alta, e a busca ignora isso. Confira o CPF na ficha antes de tratar como outra pessoa: o CPF é o que identifica.",
    },
    {
      sintoma: "A coluna Loja mostra ALOCAR LOJA.",
      acao: "Esse cliente trabalha com lojas e ninguém escolheu a desta admissão. É preenchimento que falta, e ele é feito pelo lápis, no campo Loja / Unidade.",
    },
    {
      sintoma: "A coluna Loja ou a coluna Projeto mostra MATRIZ.",
      acao: "Não falta nada. MATRIZ é o nome do que existe fora de loja e fora de projeto, e é o caso da maioria.",
    },
  ],
  regras: [
    "O Gerenciador lista todas as admissões, inclusive as concluídas e as encerradas por declínio. As filas por etapa mostram só quem está em andamento, então quem já terminou é encontrado aqui.",
    "A busca e os filtros se somam: a busca procura pelo texto, o filtro recorta por campo.",
    "Todo campo de filtro aceita vários valores ao mesmo tempo.",
    "Os cards do topo são exclusivos entre si, e o card Total Geral é o estado sem recorte.",
    "A coluna Cliente mostra o nome da operação, e o código do cliente fica na ficha. Há clientes com a mesma razão social e códigos diferentes, e é o código que distingue os dois.",
    "Loja escrita ALOCAR LOJA é preenchimento faltando. Loja ou Projeto escritos MATRIZ não são pendência: é o nome do que está fora de loja e fora de projeto.",
    "A coluna Cadastro mostra Aguardando enquanto a etapa não chegou, porque o Cadastro só abre depois que Auditoria e Exame fecham.",
  ],
  relacionados: [
    "ler-a-ficha-da-admissao",
    "editar-os-dados-de-uma-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "filtrar-uma-lista",
    "buscar-dentro-da-tela",
    "ordenar-a-lista-pelo-cabecalho",
    "virar-a-pagina-da-lista",
    "ler-a-linha-da-tabela",
    "exportar-a-lista-para-excel",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/frontend/src/lib/loja.ts",
    "apps/frontend/src/lib/farol.ts",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/admissoes/admissoes-filtros.ts",
  ],
  revisadoEm: "2026-09-28",
};
