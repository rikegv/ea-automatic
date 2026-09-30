import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA CADASTRO: a janela de importação de matrículas, e só ela.
 *
 * ┌─ O QUE OS ARTIGOS IRMÃOS JÁ COBREM, E POR ISSO NÃO SE REPETE AQUI ──────────────────────────┐
 * │ O artigo de concluir o Cadastro já ensina ONDE o botão de planilha fica e que existe uma        │
 * │ prévia. O artigo de padrão de importação já ensina a MECÂNICA comum a todas as importações do   │
 * │ sistema. Este artigo é o miolo que faltava: a PRÉVIA desta janela, que compara a matrícula que  │
 * │ está no sistema hoje com a que vai ficar, e os motivos exatos de uma linha não casar.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A COMPARAÇÃO É O CENTRO DO ARTIGO ─────────────────────────────────────────────────┐
 * │ A janela tem duas etapas e a primeira NÃO GRAVA: `previaMatriculas` lê o arquivo e devolve o    │
 * │ que vai acontecer, sem escrever. A tabela mostra Matrícula atual e Vai ficar lado a lado, e é   │
 * │ essa comparação que impede trocar uma matrícula certa por uma errada em lote. Ensinar a clicar  │
 * │ em gravar sem ensinar a LER a prévia entregaria a janela pela metade.                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS MOTIVOS SÃO LITERAIS, LIDOS DO SERVIÇO ─────────────────────────────────────────────────┐
 * │ Os quatro textos do bloco de linhas que não casaram saem de `admissoes.service.previaMatriculas`│
 * │ e estão em `seDerErrado` palavra por palavra, porque é assim que a pessoa os encontra na busca. │
 * │ O casamento é por CPF e só entre admissões VIVAS: CPF com duas vivas não é adivinhado.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a prévia mostra nome, CPF e matrícula de gente de verdade, então nenhum valor foi copiado
 * para este texto. O que se descreve é a COLUNA, nunca o conteúdo dela.
 *
 * IMAGEM: pendência conhecida, não esquecimento. A janela mostra pessoa e a captura foi vetada
 * enquanto a homologação não tiver base sintética. O texto funciona sem imagem.
 */
export const artigo: Artigo = {
  slug: "importar-as-matriculas-por-planilha",
  titulo: "Importar As Matrículas Por Planilha",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como lançar muitas matrículas de uma vez a partir da planilha que a folha devolve, lendo a prévia que compara a matrícula atual com a que vai ficar antes de gravar qualquer coisa.",
  termos: [
    "importar matricula",
    "importar matriculas",
    "planilha de matricula",
    "matricula em lote",
    "subir planilha de matricula",
    "matricula da folha",
    "lancar matriculas",
    "matricula em massa",
    "planilha nao casou",
    "linha nao casou",
    "excel de matricula",
    "csv de matricula",
  ],
  preRequisitos: [
    "Ter a planilha que a folha devolve, com o CPF e a matrícula, uma pessoa por linha.",
    "O arquivo precisa ser xlsx ou csv, e caber em 10 megabytes.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e clique na aba Cadastro.",
      detalhe: "O botão de importar matrículas existe só nesta aba, porque é aqui que o trabalho acontece.",
      controles: ["Esteira Admissional", "CADASTRO"],
    },
    {
      gesto: "Clique no ícone de planilha, ao lado do filtro, para abrir a janela.",
      controles: [
        "Importar matrículas de uma planilha",
        "Importar matrículas de uma planilha (xlsx ou csv)",
        "Importar Matrículas",
      ],
    },
    {
      gesto: "Leia a instrução do alto da janela antes de escolher o arquivo.",
      detalhe:
        "A ordem das colunas não importa e o CPF pode vir com ou sem pontuação. A regra é uma só: em cada linha, a célula com onze dígitos é o CPF, e a primeira outra célula com conteúdo é a matrícula.",
      controles: ["formatos aceitos: xlsx e csv"],
    },
    {
      gesto: "Clique em Escolher planilha e selecione o arquivo.",
      detalhe:
        "Este passo não grava nada. O sistema lê o arquivo e monta a prévia; o nome do arquivo escolhido fica ao lado do botão.",
      controles: ["Escolher planilha"],
    },
    {
      gesto: "Leia as etiquetas do alto da prévia antes da tabela.",
      detalhe:
        "Uma etiqueta verde conta quantas linhas casaram, uma vermelha aparece só quando alguma não casou, e ao lado fica o total de linhas da planilha. Os três números precisam fazer sentido juntos.",
      /*
       * "casaram" é a parte FIXA da etiqueta: a tela desenha o número na frente. "Não Casaram" é o
       * título do bloco de baixo, e esse é literal.
       */
      controles: ["casaram", "Não Casaram"],
    },
    {
      gesto: "Confira a tabela da prévia coluna por coluna, principalmente as duas últimas.",
      detalhe:
        "Matrícula atual é o que está no sistema hoje, e mostra não informado quando está vazia. Vai ficar é o que a planilha vai gravar. É esta comparação que evita trocar em lote uma matrícula que já estava certa.",
      controles: ["Nome", "CPF", "Matrícula atual", "Vai ficar", "não informado"],
    },
    {
      gesto: "Leia o bloco Não Casaram e anote o número da linha de cada problema.",
      detalhe:
        "Cada item mostra a linha do arquivo, o que veio de CPF, o que veio de matrícula e o motivo à direita. Esse número é o da linha na sua planilha, para você achar o erro nela.",
      controles: ["Não Casaram"],
    },
    {
      gesto: "Clique no botão de gravar, que traz o número de matrículas a gravar.",
      detalhe:
        "Grava só as linhas que casaram. As que não casaram não travam o lote: elas ficam para você corrigir na planilha e importar de novo, ou lançar pelo lápis da linha.",
      controles: ["Cancelar", "Editar admissão"],
    },
    {
      gesto: "Leia o aviso que aparece na tela depois de gravar.",
      detalhe:
        "Ele diz quantas matrículas foram gravadas e, quando for o caso, quantas já estavam com o mesmo valor. Reimportar a mesma planilha é seguro por isso: a segunda vez não regrava o que já estava igual.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O motivo da linha é linha sem CPF válido de 11 dígitos.",
      acao: "O texto exato é \"Linha sem CPF válido (11 dígitos).\" Nenhuma célula daquela linha tem onze dígitos. Confira se o CPF não ficou cortado pelo Excel ou se a linha não é uma sobra de rodapé da planilha.",
    },
    {
      sintoma: "O motivo da linha é linha sem matrícula.",
      acao: "O texto exato é \"Linha sem matrícula.\" A linha tem o CPF e nenhuma outra célula com conteúdo. Preencha a matrícula na planilha e importe de novo.",
    },
    {
      sintoma: "O motivo da linha é CPF sem admissão ativa no sistema.",
      acao: "O texto exato é \"CPF sem admissão ativa no sistema.\" O casamento vale só para admissão viva: quem já concluiu, declinou ou tem rescisão não entra. Confira o CPF e, se a pessoa está mesmo em andamento, procure a admissão dela no Gerenciador.",
    },
    {
      sintoma: "O motivo da linha diz que o CPF tem mais de uma admissão ativa.",
      acao: "O texto exato é \"CPF com mais de uma admissão ativa. Lance a matrícula pela ficha.\" O sistema não escolhe qual das duas recebe a matrícula, de propósito. Abra o lápis da admissão certa e lance ali.",
    },
    {
      sintoma: "A janela avisa que nenhuma linha casou e que nada será gravado.",
      acao: "O aviso é \"Nenhuma linha casou, nada será gravado.\" e o botão de gravar fica apagado. Leia os motivos do bloco de baixo: quase sempre é planilha sem a coluna do CPF ou arquivo de outra base.",
    },
    {
      sintoma: "A janela diz que houve falha ao ler a planilha.",
      acao: "O arquivo não foi entendido como planilha. Abra no Excel e salve de novo como xlsx ou csv. Se o arquivo veio de outro sistema, confira se ele não é um relatório em pdf renomeado.",
    },
    {
      sintoma: "O sistema recusa dizendo que o arquivo é grande demais para importar.",
      acao: "A frase traz o limite: dez megabytes de arquivo e duas mil linhas por importação. Exporte só as colunas e as linhas que você vai importar, ou divida a planilha em partes.",
    },
    {
      sintoma: "A matrícula foi gravada sem o zero da frente.",
      acao: "Não é o sistema: ele guarda a matrícula como texto e preserva o zero à esquerda. O zero costuma se perder no Excel, que trata a coluna como número. Formate a coluna como texto antes de salvar e importe de novo, que a regravação corrige o valor.",
    },
  ],
  regras: [
    "A janela tem duas etapas e a primeira não grava nada: a prévia só diz o que vai acontecer.",
    "O casamento é pelo CPF, e só entre admissões vivas.",
    "CPF com mais de uma admissão viva nunca é adivinhado: a linha vai para o bloco das que não casaram.",
    "Linha com problema não trava o lote: as que casaram entram, as outras ficam listadas com o motivo.",
    "Reimportar a mesma planilha é seguro. O aviso do fim separa o que foi gravado do que já estava com o mesmo valor.",
    "A matrícula entra como texto, então o zero à esquerda é preservado.",
    "O que é gravado entra na trilha da admissão campo a campo, igual ao que alguém digita na ficha: quem olha a trilha depois não distingue a planilha da digitação.",
    "O arquivo não fica guardado no sistema: ele é lido e descartado no mesmo pedido.",
    "Para uma matrícula só, o caminho é o lápis da linha, não a planilha.",
  ],
  relacionados: [
    "importar-uma-planilha",
    "concluir-o-cadastro-e-o-contrato",
    "mudar-o-status-do-cadastro-e-voltar-atras",
    "editar-os-dados-de-uma-admissao",
    "achar-uma-admissao-no-gerenciador",
    "agir-em-varias-linhas-de-uma-vez",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/ImportarMatriculasModal.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/admissoes/matriculas-import.ts",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/planilha/upload.ts",
  ],
  revisadoEm: "2026-09-30",
};
