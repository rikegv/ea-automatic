import type { Artigo } from "../../tipos";

/**
 * N2 DA LIBERAÇÃO: O QUE A TELA OFERECE PARA RECORTAR A FILA, E O QUE CADA COLUNA DIZ.
 *
 * ┌─ A CORREÇÃO DE PREMISSA MAIS IMPORTANTE DESTE ARTIGO, medida na tela ─────────────────────────┐
 * │ A Liberação NÃO TEM cards de indicador, e não tem barra de filtros. Quem chega da Esteira ou do │
 * │ Gerenciador procura os cards clicáveis e a fileira de seletores, e não acha nem um nem outro.   │
 * │ O recorte desta tela é feito por OUTRAS TRÊS COISAS, e o artigo as nomeia:                     │
 * │   1. as duas ABAS, cada uma com a sua contagem no próprio rótulo;                              │
 * │   2. a BUSCA, que é única e vale para as duas abas ao mesmo tempo;                             │
 * │   3. a ORDENAÇÃO pelo cabeçalho, que é o que resolve "quem espera há mais tempo".              │
 * │ Escrever "clique no card" aqui mandaria a pessoa clicar em algo que não existe.                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS COLUNAS DE TEMPO PARADO SÃO A MESMA GRANDEZA, E ORDENAM PELO TEMPO REAL ────────────┐
 * │ "Parado (dias)" e "Parado (horas)" saem as duas da data de chegada. A ordenação delas usa o    │
 * │ tempo em si, e não o texto: por isso o primeiro clique traz quem espera há MAIS tempo, que é o  │
 * │ contrário do A a Z que a pessoa espera de um cabeçalho.                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO REEXPLICA O GESTO de buscar, de ordenar ou de marcar várias linhas: os três têm artigo próprio
 * no módulo de padrões, e este referencia. Também não ensina liberar, recusar nem reativar.
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: a fila mostra CPF, telefone e data de nascimento de gente real, e a
 * captura dela está recusada enquanto a homologação não tiver dado sintético. O texto foi escrito
 * para funcionar sem imagem, descrevendo as colunas pelo nome.
 *
 * §A.6: só nome de coluna e de etiqueta. Nenhum valor de nenhuma linha.
 */
export const artigo: Artigo = {
  slug: "os-filtros-e-os-cards-da-fila-de-liberacao",
  titulo: "Os Filtros E Os Cards Da Liberação",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "liberacao",
  resumo:
    "Como recortar a fila da Liberação, que não tem cards de indicador nem barra de filtros: as duas abas com contagem, a busca que vale para as duas e a leitura de cada coluna das duas listas.",
  termos: [
    "filtrar liberacao",
    "cards da liberacao",
    "indicadores da liberacao",
    "quantos estao aguardando",
    "quem espera ha mais tempo",
    "parado dias",
    "parado horas",
    "colunas da liberacao",
    "chegada",
    "recusadas",
    "nao tem filtro",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Olhe as duas abas do topo: a contagem de cada uma fica no próprio rótulo.",
      detalhe:
        "Aguardando traz quem está na fila; Admissões Recusadas traz quem foi tirado dela. O número entre parênteses acompanha a busca, então ele diz quantos estão aparecendo agora, e não o total do sistema.",
      controles: ["Aguardando", "Admissões Recusadas"],
    },
    {
      gesto: "Use a busca do topo para recortar a lista.",
      detalhe:
        "Ela aceita nome parcial e CPF, com ou sem pontuação, e filtra as DUAS abas ao mesmo tempo: trocando de aba, o que você digitou continua valendo. É o único recorte por conteúdo desta tela, porque aqui não há seletores de filtro.",
      controles: ["Buscar por nome ou CPF"],
    },
    {
      gesto: "Ordene pelo cabeçalho para decidir quem sai primeiro.",
      detalhe:
        "Em Parado (dias) e Parado (horas) o primeiro clique traz quem espera há mais tempo, porque a ordenação usa o tempo real e não o texto da célula. As duas colunas são a mesma conta em unidades diferentes.",
      controles: ["Chegada", "Parado (dias)", "Parado (horas)"],
    },
    {
      gesto: "Leia as colunas da aba Aguardando.",
      detalhe:
        "Cliente vem em branco enquanto ninguém atribuiu, e é essa a razão de a pessoa estar aqui. Candidato, CPF, Telefone, Nascimento e Sexo são o cadastro que chegou, e Sexo aparece como não informado quando faltou na origem. Chegada é o dia em que a pré-admissão entrou. Ação é o botão que abre a liberação.",
      controles: [
        "Cliente",
        "Candidato",
        "CPF",
        "Telefone",
        "Nascimento",
        "Sexo",
        "Chegada",
        "Ação",
      ],
    },
    {
      gesto: "Repare nas etiquetas que aparecem dentro da coluna Candidato.",
      detalhe:
        "Possível duplicata é a única etiqueta desta lista, e ela fica ao lado do nome. Ela não é filtro: para trabalhar só esses casos, ordene a coluna Candidato e percorra a lista.",
      controles: ["Possível duplicata"],
    },
    {
      gesto: "Marque linhas pelo quadradinho da esquerda quando for trabalhar em massa.",
      detalhe:
        "O quadradinho do cabeçalho marca só as linhas VISÍVEIS pela busca, nunca a base inteira. Com algo marcado, aparece a barra com a contagem, o Limpar seleção e o botão de liberar as selecionadas.",
      controles: ["Selecionar todas as visíveis", "Limpar seleção", "Liberar selecionadas"],
    },
    {
      gesto: "Troque para Admissões Recusadas e leia as colunas próprias dela.",
      detalhe:
        "Aqui não há Cliente, Chegada nem tempo parado: entram Recusado por e Recusado em, que é a trilha da recusa, e a Ação passa a ser o Ver, que abre a janela com esse histórico.",
      controles: ["Recusado por", "Recusado em", "Ver"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Procuro os cards clicáveis e a barra de filtros e não encontro.",
      acao: "Esta tela não tem nem um nem outro, de propósito: ela é uma fila curta de trabalho, não um painel. O recorte é a aba, a busca e a ordenação pelo cabeçalho.",
    },
    {
      sintoma: "A lista diz Nenhuma pré-admissão aguardando liberação.",
      acao: "A fila está vazia de verdade, e isso é bom sinal: ninguém esperando cliente e cargo. Confira se a busca está limpa antes de concluir.",
    },
    {
      sintoma: "A lista diz Nenhum candidato encontrado para a busca.",
      acao: "É a busca, e não a fila. Apague o que está digitado. A mesma mensagem vale nas duas abas.",
    },
    {
      sintoma: "Ordenei por Parado (dias) e a lista veio do maior para o menor.",
      acao: "É o desenho: essa coluna ordena pelo tempo de espera, então o primeiro clique traz quem está há mais tempo parado, que é quem precisa sair primeiro. Um segundo clique inverte.",
    },
    {
      sintoma: "Marquei linhas, filtrei pela busca, e a contagem da barra não mudou.",
      acao: "A seleção não é apagada pela busca: ela guarda o que você marcou. O que o quadradinho do cabeçalho alcança é só o visível. Na dúvida, clique em Limpar seleção e recomece.",
    },
    {
      sintoma: "A coluna Cliente está em branco em quase todas as linhas.",
      acao: "É o estado normal desta fila: quem está aqui é exatamente quem ainda não tem cliente atribuído. A coluna preenchida acontece quando o cliente já veio resolvido da origem.",
    },
  ],
  regras: [
    "A Liberação não tem cards de indicador nem barra de filtros. O recorte é a aba, a busca e a ordenação.",
    "A contagem do rótulo de cada aba acompanha a busca: ela diz quantos estão aparecendo, não o total do sistema.",
    "A busca é única e vale para as duas abas ao mesmo tempo.",
    "Parado (dias) e Parado (horas) são a mesma grandeza, derivada da data de chegada, e ordenam pelo tempo real.",
    "O quadradinho do cabeçalho marca só as linhas visíveis pela busca.",
    "Possível duplicata é etiqueta de leitura, não filtro.",
    "As duas abas têm colunas diferentes: a de recusadas troca cliente e tempo parado pela trilha de quem recusou e quando.",
  ],
  relacionados: [
    "liberar-uma-admissao",
    "liberar-em-lote",
    "recusar-uma-admissao-na-liberacao",
    "ler-faltam-para-liberar",
    "tratar-possivel-duplicata-de-cpf",
    "buscar-dentro-da-tela",
    "ordenar-a-lista-pelo-cabecalho",
    "agir-em-varias-linhas-de-uma-vez",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/frontend/src/lib/ordenacao.ts",
    "apps/backend/src/admissoes/admissoes.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
