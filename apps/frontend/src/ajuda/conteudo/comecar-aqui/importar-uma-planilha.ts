import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 7 de 14: IMPORTAR DE PLANILHA.
 *
 * ┌─ O QUE É IGUAL NAS SEIS IMPORTAÇÕES, E É ISSO QUE O ARTIGO ENSINA ───────────────────────────┐
 * │ Todas seguem o mesmo ciclo: sobe o arquivo, o sistema ENTENDE as colunas sozinho, mostra uma    │
 * │ PRÉVIA, deixa você corrigir o entendimento, e só grava depois do seu aceite. O que muda é o que  │
 * │ está sendo importado (loja, matrícula, candidato) e o nome do botão final.                       │
 * │                                                                                                 │
 * │ A frase que o artigo precisa deixar colada na cabeça é "nada é gravado sem o seu aceite", porque │
 * │ é ela que faz a pessoa ousar subir a planilha em vez de digitar sessenta lojas à mão.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ÂNCORA: a importação de lojas, dentro da ficha do cliente. É a única das seis que não mostra pessoa
 * nenhuma, nem na tela nem na prévia.
 *
 * ┌─ POR QUE SÓ OS DOIS PRIMEIROS PASSOS TÊM IMAGEM, E ISSO É LIMITE DO MOTOR ───────────────────┐
 * │ Os passos 3, 4 e 5 só existem DEPOIS de um arquivo subir, e o vocabulário de preparo da captura │
 * │ hoje faz clicar, digitar, trocar de aba e rolar: não faz ESCOLHER ARQUIVO. Reservar a imagem    │
 * │ mesmo assim deixaria o leitor com um buraco tracejado para sempre, e a varredura acusaria print │
 * │ de artigo sem captura, corretamente. Os passos ficam sem imagem e com o detalhe escrito, e a    │
 * │ falta está reportada ao coordenador como pedido de um gesto novo de preparo.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "importar-uma-planilha",
  titulo: "Importar Uma Planilha",
  modulo: "COMECAR_AQUI",
  rotas: ["/admin/clientes", "/esteira", "/as/candidatos"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como subir uma planilha do jeito que ela veio, conferir o que o sistema entendeu de cada coluna e gravar só depois de aprovar a prévia.",
  termos: [
    "importar",
    "importacao",
    "planilha",
    "excel",
    "xlsx",
    "csv",
    "subir arquivo",
    "carga",
    "em massa",
    "de para",
    "mapear colunas",
    "previa",
    "modelo de planilha",
  ],
  preRequisitos: [
    "Ter a planilha em Excel ou CSV. Não é preciso formatá-la antes: o sistema lê o arquivo como ele veio.",
    "Estar na tela que recebe aquele tipo de importação.",
  ],
  passos: [
    {
      gesto: "Abra a tela que recebe a importação e clique em Importar Planilha.",
      detalhe:
        "No cadastro de clientes, a importação de lojas fica dentro da ficha do cliente: abra a ficha primeiro.",
      controles: ["Ver ficha", "Importar Planilha"],
      print: {
        arquivo: "01-abrir-a-importacao.png",
        legenda: "Passo 1: o atalho que abre a importação por planilha.",
      },
    },
    {
      gesto: "Escolha o arquivo.",
      detalhe:
        "Vale Excel e CSV. Se a planilha tiver mais de uma aba, o sistema diz qual ele leu e deixa você trocar, e a prévia é refeita na troca.",
      controles: ["Importar Planilha", "Escolha a aba", "Aba Da Planilha"],
      print: {
        arquivo: "02-escolher-o-arquivo.png",
        legenda: "Passo 2: a janela de importação, com o campo do arquivo.",
      },
    },
    {
      gesto: "Confira o que o sistema entendeu de cada coluna.",
      detalhe:
        "O entendimento é automático e vem com um aviso do grau de confiança. Cada campo tem um seletor: se ele apontou a coluna errada, escolha a certa ali mesmo, e a prévia se refaz.",
      controles: ["Colunas Da Planilha"],
      /*
       * AS TRÊS IMAGENS ABAIXO só passaram a existir com o gesto `subirArquivo` (o `devops`
       * implementou): o ciclo de prévia desta tela só aparece DEPOIS de um arquivo subir, e o motor
       * não sabia escolher arquivo. A planilha que o print mostra é SINTÉTICA e versionada em
       * `capturas/arquivos/` (§A.6): só nome de loja, endereço e código.
       */
      print: {
        arquivo: "03-o-que-a-leitura-entendeu.png",
        legenda: "Passo 3: as colunas que a leitura reconheceu, cada uma editável.",
      },
    },
    {
      gesto: "Leia a prévia linha por linha antes de gravar.",
      detalhe:
        "A prévia mostra o que vai entrar e o que o sistema vai ignorar, com o número da linha da planilha. É aqui que se pega a coluna trocada e a linha em branco.",
      print: {
        arquivo: "04-previa-do-que-vai-ser-criado.png",
        legenda: "Passo 4: a prévia, linha a linha, do que vai ser criado.",
      },
    },
    {
      gesto: "Clique no botão de gravar, que diz quantos registros vão entrar.",
      detalhe:
        "O rótulo do botão traz a contagem, então ele é a última conferência. Até esse clique, nada foi gravado.",
      print: {
        arquivo: "05-gravar-a-importacao.png",
        legenda: "Passo 5: o botão que grava exatamente as linhas da prévia.",
      },
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema não entendeu nenhuma coluna.",
      acao: "Escolha as colunas você mesmo, uma por campo, nos seletores da janela. A prévia se refaz a cada escolha.",
    },
    {
      sintoma: "A prévia está vazia.",
      acao: "Provavelmente o cabeçalho está em outra aba ou em outra linha. Troque a aba no seletor e confira a frase que diz em qual linha o cabeçalho foi encontrado.",
    },
    {
      sintoma: "A planilha tem linhas repetidas.",
      acao: "A prévia separa o que vai entrar do que será ignorado. Repetido não entra duas vezes.",
    },
    {
      sintoma: "Importei e o dado ficou errado.",
      acao: "Corrija no cadastro, pela própria tela. A importação é um atalho de digitação, então o conserto é o mesmo de um registro digitado à mão.",
    },
    {
      sintoma: "O arquivo não é aceito.",
      acao: "Salve a planilha como Excel ou CSV. Formato de outro programa não é lido.",
    },
  ],
  regras: [
    "Nada é gravado sem o seu aceite: até o clique final, a importação é só prévia.",
    "A planilha sobe como ela veio. Quem entende as colunas é o sistema, e você corrige o que ele errou.",
    "O que o sistema vai ignorar é mostrado antes, com o número da linha da planilha.",
    "Importar é um atalho de digitação: o que entrou pode ser corrigido depois pela tela normal.",
  ],
  relacionados: [
    "exportar-a-lista-para-excel",
    "abrir-e-fechar-uma-janela-do-sistema",
    "agir-em-varias-linhas-de-uma-vez",
  ],
  fontes: [
    "apps/frontend/src/components/admin/ImportarLojasModal.tsx",
    "apps/frontend/src/components/admin/LojasDoCliente.tsx",
    "apps/frontend/src/components/esteira/ImportarMatriculasModal.tsx",
    "apps/frontend/src/components/as/candidatos/ImportarCandidatosModal.tsx",
  ],
  revisadoEm: "2026-09-28",
};
