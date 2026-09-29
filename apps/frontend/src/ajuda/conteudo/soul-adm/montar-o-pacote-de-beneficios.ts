import type { Artigo } from "../../tipos";

/**
 * N1 DE BENEFÍCIOS 1 de 2: MONTAR O PACOTE.
 *
 * ┌─ O CAMINHO PRINCIPAL DESTA TELA É EDITAR O PACOTE, E NÃO LER A FILA ─────────────────────────┐
 * │ A tela responde a uma pergunta ("de quem já fechou o Cadastro, quem tem VT, VR, VA e AM") e     │
 * │ oferece UMA ação que muda dado de verdade: o lápis, que abre a janela do pacote e grava no       │
 * │ CADASTRO DO CANDIDATO. Todo o resto da tela (cards, abas, filtros, coluna Status) é recorte ou   │
 * │ é o outro artigo, o de marcar como calculado. Por isso este passo a passo vai da busca até o     │
 * │ Salvar no cadastro, e só depois mostra as duas leituras que valem a pena (o resumo do VT e as    │
 * │ regras do cliente).                                                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FRASE QUE O ARTIGO PRECISA DEIXAR COLADA: NÃO EXISTE PACOTE PARALELO ─────────────────────┐
 * │ A janela grava em `admissao_beneficio`, que é a MESMA fonte que a ficha da admissão lê, e o      │
 * │ sinalizador de pendências é regravado na mesma transação. Editar aqui é editar lá. Sem essa      │
 * │ frase, o time trata a tela como uma planilha à parte e passa a conferir duas vezes.             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS RÓTULOS SÃO OS DO CÓDIGO, letra por letra, inclusive a mistura de caixa que EXISTE na tela e
 * que o manual não conserta (§A.14): o botão da janela diz "Salvar no cadastro" e o título dela diz
 * "Editar Benefícios". Declarar o que está lá é o que faz a busca por rótulo funcionar.
 *
 * §A.6: nenhum nome, CPF ou valor de pessoa real aparece aqui. O que o artigo nomeia são os RÓTULOS.
 */
export const artigo: Artigo = {
  slug: "montar-o-pacote-de-beneficios",
  titulo: "Montar O Pacote De Benefícios",
  modulo: "SOUL_ADM",
  rotas: ["/beneficios"],
  menus: ["beneficios-fila"],
  publico: "OPERACAO",
  nivel: "N1",
  familia: "beneficios",
  resumo:
    "Como achar a pessoa na fila de Benefícios, ler a faixa de VT, VR, VA e AM da linha e montar ou corrigir o pacote dela, que grava direto no cadastro do candidato.",
  termos: [
    "beneficio",
    "beneficios",
    "pacote",
    "vt",
    "vale transporte",
    "vr",
    "vale refeicao",
    "va",
    "vale alimentacao",
    "am",
    "assistencia medica",
    "plano de saude",
    "cesta",
    "montar pacote",
    "cadastrar beneficio",
    "valor do beneficio",
    "quanto a pessoa recebe",
    "formulario de vt",
  ],
  preRequisitos: [
    "Saber quais benefícios o cliente concede para aquele cargo. O botão da lâmpada, na linha, abre as regras de benefício do cliente sem sair da tela.",
  ],
  passos: [
    {
      gesto: "Abra o menu Benefícios e escolha a aba onde a pessoa está.",
      detalhe:
        "Fila De Trabalho é quem ainda aguarda cálculo, e Finalizados é quem já foi marcado como calculado. O pacote é editável nas duas: corrigir um benefício depois do cálculo é caso normal.",
      controles: ["Benefícios", "Fila De Trabalho", "Finalizados"],
      print: {
        arquivo: "01-fila-de-beneficios.png",
        legenda: "Passo 1: a fila de Benefícios, com as abas e os três indicadores do topo.",
      },
    },
    {
      gesto: "Ache a pessoa pela busca ou pelos filtros.",
      detalhe:
        "A busca aceita o nome do funcionário e o cliente. No ícone de filtro ao lado dela estão Cliente, Com o benefício, Sem o benefício e Pacote. Com o benefício e Sem o benefício são separados de propósito: é assim que se pergunta quem tem VT e não tem VR, que é como se acha quem ficou pela metade.",
      controles: [
        "Buscar por nome do candidato ou cliente",
        "Cliente",
        "Com o benefício",
        "Sem o benefício",
        "Pacote",
        "Com Pacote Estruturado",
        "Só Texto Importado",
      ],
    },
    {
      gesto: "Leia a faixa de benefícios da linha antes de mexer.",
      detalhe:
        "As quatro colunas de sigla dizem Sim ou Não, e o Sim é clicável: ele abre o valor cadastrado daquele benefício. Outros mostra um mais com a contagem dos demais. Quem veio de planilha antiga não tem as quatro colunas: o texto importado ocupa a faixa inteira, porque aquele pacote nunca foi apurado item a item.",
      controles: ["VT", "VR", "VA", "AM", "Outros", "Sim", "Não", "Demais Benefícios"],
      print: {
        arquivo: "02-faixa-de-beneficios.png",
        legenda: "Passo 3: a faixa de siglas da linha e o lápis que abre o pacote.",
      },
    },
    {
      gesto: "Clique no lápis, na coluna Ações, para abrir o pacote.",
      detalhe:
        "A janela lista todos os benefícios ativos do catálogo, marcados os que a pessoa já tem. O rodapé conta quantos estão no pacote.",
      controles: ["Ações", "Editar os benefícios", "Editar Benefícios"],
    },
    {
      gesto: "Marque os benefícios da pessoa e informe o valor de cada um, quando houver.",
      detalhe:
        "O campo de valor só aceita digitação com o benefício marcado. Deixá-lo em branco é estado real, e não erro: benefício sem valor cadastrado existe, e o VT é assim até o formulário de vale-transporte chegar. Desmarcar é tão válido quanto marcar: o que for salvo substitui o pacote inteiro.",
      controles: ["valor", "benefício(s) no pacote"],
      print: {
        arquivo: "03-janela-do-pacote.png",
        legenda: "Passo 5: a janela Editar Benefícios, com a lista do catálogo e os valores.",
      },
    },
    {
      gesto: "Clique em Salvar no cadastro.",
      detalhe:
        "O aviso de confirmação diz o nome da pessoa e que os benefícios foram atualizados no cadastro. A lista se refaz sozinha depois de salvar. Cancelar fecha sem gravar nada.",
      controles: ["Salvar no cadastro", "Cancelar"],
    },
    {
      gesto: "Confira o vale-transporte pela célula VT, quando precisar do detalhe.",
      detalhe:
        "O Sim da coluna VT não abre um valor: abre o resumo do que a pessoa declarou no formulário, com ida, volta, total do dia e o cartão. Ver Formulário abre o arquivo no Google Drive. Solicitar Novo VT gera um link para a pessoa preencher de novo, e o envio é seu: o sistema não manda o link, ele fica registrado em seu nome. Envios Anteriores só aparece quando há mais de uma declaração.",
      controles: [
        "Vale-Transporte",
        "Ver Formulário",
        "Solicitar Novo VT",
        "Envios Anteriores",
        "Copiar",
        "Fechar",
      ],
    },
    {
      gesto: "Na dúvida sobre o que o cliente concede, abra a lâmpada da linha.",
      detalhe:
        "Ela mostra as regras de benefício daquele cliente, então todas as pessoas do mesmo cliente abrem exatamente o mesmo conteúdo. Linha sem cliente não tem lâmpada.",
      controles: ["Principais informações: as regras de benefício deste cliente"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela mostra Falha ao salvar os benefícios.",
      acao: "Nada foi gravado. Confira se algum campo de valor ficou com texto no lugar de número e tente salvar de novo. Persistindo, feche pelo Cancelar, recarregue a página e repita.",
    },
    {
      sintoma: "O sistema respondeu Benefício inexistente no catálogo.",
      acao: "Um dos benefícios marcados saiu do catálogo enquanto a janela estava aberta. Cancele, recarregue a página e monte o pacote de novo com a lista atual.",
    },
    {
      sintoma: "O sistema respondeu Admissão não encontrada.",
      acao: "Aquela admissão não existe mais, ou a lista está velha na sua tela. Feche a janela, recarregue a página e procure a pessoa outra vez.",
    },
    {
      sintoma: "A linha mostra um texto corrido no lugar das colunas VT, VR, VA e AM.",
      acao: "É uma admissão que veio de planilha, e o pacote dela nunca foi apurado item a item. Abra o lápis e monte o pacote estruturado: a partir do salvamento a linha passa a mostrar as colunas.",
    },
    {
      sintoma: "Cliquei no Sim do VT e apareceu que a pessoa ainda não enviou o formulário.",
      acao: "O resumo só existe depois que o candidato preenche o formulário de vale-transporte. Use Solicitar Novo VT para gerar o link e mande para a pessoa pelo canal que você já usa.",
    },
    {
      sintoma: "Abri o valor de um benefício e ele diz que não tem valor cadastrado.",
      acao: "É estado real, não falha. O benefício está no pacote da pessoa e o valor ainda não foi informado. No VT, o valor passa a vir do formulário de vale-transporte.",
    },
  ],
  regras: [
    "O que for salvo na janela grava no cadastro do candidato, que é a fonte única. Não existe pacote paralelo desta tela.",
    "O pacote é salvo inteiro, e não por diferença: desmarcar um benefício e salvar tira aquele benefício da pessoa.",
    "Benefício sem valor é estado válido. Campo em branco vira sem valor cadastrado, nunca zero, porque zero seria um valor informado.",
    "A fila é formada por quem concluiu o Cadastro. A tela não cria admissão e não muda nenhuma frente da esteira.",
    "As regras de benefício da lâmpada são do CLIENTE, não da pessoa: todas as linhas do mesmo cliente mostram o mesmo conteúdo.",
    "O sistema não envia o link do vale-transporte ao candidato. Ele gera o link e registra o pedido em seu nome, e o envio é do time.",
  ],
  relacionados: [
    "marcar-o-beneficio-como-cadastrado",
    "ler-a-ficha-da-admissao",
    "filtrar-uma-lista",
    "buscar-dentro-da-tela",
    "ordenar-a-lista-pelo-cabecalho",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/beneficios/page.tsx",
    "apps/frontend/src/components/beneficios/RegrasClienteModal.tsx",
    "apps/backend/src/beneficios/beneficios-fila.service.ts",
    "apps/backend/src/beneficios/beneficios-fila.controller.ts",
  ],
  revisadoEm: "2026-09-28",
};
