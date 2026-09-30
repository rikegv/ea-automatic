import type { Artigo } from "../../tipos";

/**
 * N1 DAS REGRAS DO KIT, 2 de 3: O DICIONÁRIO DE TÍTULOS, e é a peça mais importante das três.
 *
 * ┌─ POR QUE ELA É A MAIS IMPORTANTE, MEDIDO NO CÓDIGO DO MOTOR ─────────────────────────────────┐
 * │ O título cadastrado aqui é o texto que o motor PROCURA no topo de cada página do arquivo que   │
 * │ vem da folha. O casamento é EXATO depois de ignorar acento e caixa: sem correspondência, a     │
 * │ página não vira documento de ninguém e cai na lista do que não foi reconhecido, com o motivo    │
 * │ "Título fora do dicionário do kit".                                                            │
 * │                                                                                                │
 * │ Ou seja: a causa mais comum de "o kit não pegou o documento" é uma letra a mais ou a menos      │
 * │ NESTA tela, e não um defeito na tela que gera o kit. O artigo diz isso com todas as letras,     │
 * │ porque quem procura o problema procura do lado errado.                                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELA NÃO COBRE: a marcação de padrão ou individual, que tem peça própria, e o kit em si
 * (criar, renomear, remover), que é a peça irmã. Gerar o kit é outra tela e já tem artigo.
 *
 * `termos` foi escrito pelo SINTOMA, não pelo nome da tela: quem cai aqui digita "o kit não pegou o
 * documento" e "faltou página no contrato", nunca "dicionário de títulos".
 *
 * SEM IMAGEM DECLARADA: os prints desta frente entram em entrega própria.
 */
export const artigo: Artigo = {
  slug: "montar-o-dicionario-de-titulos-do-kit",
  titulo: "Montar O Dicionário De Títulos Do Kit",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/kit-regras"],
  menus: ["kit-regras"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "motor-de-documentos",
  resumo:
    "Como cadastrar, corrigir, remover e reordenar os títulos que o sistema procura dentro do arquivo da folha, e por que um título errado aqui faz o documento não ser reconhecido lá.",
  termos: [
    "o kit nao pegou o documento",
    "faltou pagina no contrato",
    "documento nao reconhecido",
    "titulo fora do dicionario",
    "dicionario do kit",
    "titulo do documento",
    "ordem do kit",
    "ordem dos documentos",
    "reordenar kit",
    "acrescentar documento ao kit",
    "tirar documento do kit",
    "nao entrou no kit",
    "pagina sobrando no kit",
  ],
  preRequisitos: [
    "Ter o kit já criado e selecionado na coluna da esquerda.",
    "Ter em mãos o título exatamente como ele sai impresso no topo da página do arquivo da folha.",
  ],
  passos: [
    {
      gesto: "Abra Regras Do Kit e clique, na coluna da esquerda, no kit que você vai montar.",
      detalhe: "A coluna da direita passa a mostrar os documentos daquele kit, e só dele.",
      controles: ["Regras Do Kit", "Regras Do Gerador De Kit"],
    },
    {
      gesto:
        "Digite o título no campo do topo da coluna da direita, igual ao que está impresso na página.",
      detalhe:
        "Copie o texto do jeito que ele aparece no documento da folha. Acento e maiúscula não atrapalham, o sistema ignora os dois. Palavra trocada, abreviação e palavra faltando atrapalham, e muito.",
    },
    {
      gesto: "Clique em Adicionar.",
      detalhe:
        "O título entra no fim da lista, ativo. A contagem de documentos do kit, na coluna da esquerda, sobe na hora.",
      controles: ["Adicionar"],
    },
    {
      gesto: "Para corrigir um título, clique no lápis da linha, ajuste o texto e confirme no visto.",
      detalhe:
        "A tecla Enter confirma e a tecla Esc cancela. É por aqui que se conserta o título que estava escrito diferente do documento.",
      controles: ["Editar título", "Salvar", "Cancelar"],
    },
    {
      gesto:
        "Para tirar um título de uso sem apagar, clique na etiqueta de estado da linha, que alterna entre Ativo e Inativo.",
      detalhe:
        "Título inativo continua cadastrado e o sistema deixa de procurá-lo. É o caminho certo para o documento que saiu do kit por um tempo.",
      controles: ["Ativo", "Inativo", "Desativar (o motor ignora)", "Ativar"],
    },
    {
      gesto: "Para apagar de vez, clique na lixeira da linha e confirme em Remover.",
      detalhe:
        "A janela avisa que o sistema deixa de reconhecer aquele título. A partir dali, a página com esse título passa a cair na lista do que não foi reconhecido.",
      controles: ["Remover documento", "Remover Documento Do Kit", "Remover", "Cancelar"],
    },
    {
      gesto: "Arraste a linha pela alça, à esquerda do número, para mudar a posição do documento.",
      detalhe:
        "A ordem desta lista é a ordem das páginas dentro do kit montado de cada funcionário. A nova ordem é salva assim que você solta a linha.",
    },
    {
      gesto: "Confira a lista inteira antes de mandar gerar o próximo lote.",
      detalhe:
        "Vale a pena conferir contra um arquivo real da folha: título por título, do primeiro ao último.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O documento veio na lista do que não foi reconhecido, com o aviso de título fora do dicionário.",
      acao: "O aviso mostra o título que o sistema leu na página. Compare com o que está cadastrado aqui, letra por letra, e corrija o cadastro para ficar igual ao impresso. Depois é só processar o lote de novo.",
    },
    {
      sintoma: "Faltou uma página no meio de um documento do kit.",
      acao: "A página seguinte só entra no documento quando ela não traz título no topo. Se a folha passou a imprimir um título novo naquela página, cadastre esse título aqui.",
    },
    {
      sintoma: "Um documento parou de ser reconhecido do nada.",
      acao: "Confira se a etiqueta dele está em Ativo e se alguém não o removeu. Confira também se a folha mudou o texto impresso no topo da página: quando o documento muda de nome lá, o cadastro precisa mudar aqui.",
    },
    {
      sintoma: "Os documentos do kit estão saindo fora de ordem.",
      acao: "A ordem sai desta lista. Arraste as linhas até a sequência desejada e gere o lote de novo.",
    },
    {
      sintoma: "Você cadastrou o título no kit errado.",
      acao: "O dicionário é de um kit só. Remova o título do kit errado e cadastre no kit certo, selecionando antes o kit na coluna da esquerda.",
    },
  ],
  regras: [
    "O título cadastrado aqui é o texto que o sistema procura no topo da página do arquivo da folha.",
    "O sistema ignora acento e maiúscula, e só isso: qualquer outra diferença faz o documento não ser reconhecido.",
    "Cada título é único dentro do kit, e cada kit tem o seu dicionário.",
    "A ordem da lista é a ordem das páginas dentro do kit de cada funcionário.",
    "O sistema só procura os títulos que estão ativos.",
    "Título sem correspondência no dicionário não vira documento de ninguém: a página vai para a lista do que não foi reconhecido.",
  ],
  relacionados: [
    "criar-e-renomear-um-tipo-de-kit",
    "padrao-ou-individual-o-que-muda-no-kit",
    "processar-o-kit-a-partir-dos-pdfs-da-folha",
    "reimportar-os-documentos-que-faltam",
    "baixar-o-kit-de-um-funcionario",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/kit-regras/page.tsx",
    "apps/backend/src/admin/kit-regras/kit-regras.service.ts",
    "apps/ai-service/app/kit_motor.py",
    "apps/ai-service/app/kit_dict.py",
  ],
  revisadoEm: "2026-09-30",
};
