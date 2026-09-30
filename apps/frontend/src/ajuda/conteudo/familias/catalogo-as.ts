import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: os catálogos de Atração e Seleção.
 *
 * Reúne segmentos, linhas de serviço, comerciais, motivos de cancelamento, de descarte e de reenvio,
 * mais as etapas do funil e os status da vaga. Eles alimentam a vaga, o funil e a ficha do candidato.
 *
 * ┌─ O QUE ESTES CATÁLOGOS TÊM E OS DA ADMISSÃO NÃO TÊM ────────────────────────────────────────┐
 * │ EXCLUIR de verdade, e REORDENAR. O artigo modelo de catálogo afirma que o botão de excluir não │
 * │ existe, e ele está certo para o domínio dele e ERRADO para estas telas. É por isso que esta    │
 * │ família é separada, e é por isso que existe um artigo transversal só sobre reordenar e apagar. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const familia: FamiliaDeArtigos = {
  codigo: "catalogo-as",
  rotulo: "Catálogos De Atração E Seleção",
  preRequisitos: [
    "Ter o menu daquele catálogo liberado para o seu usuário.",
    "Estar na área de Atração e Seleção: estes catálogos são concedidos por área, não por papel.",
    "Saber onde o item é usado: eles alimentam a abertura da vaga, o funil e a ficha do candidato.",
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema recusa o nome e diz que ele já existe.",
      acao: "Procure o nome entre os inativos e reative, em vez de criar um repetido. O nome repetido conta mesmo entre os itens fora de circulação.",
    },
    {
      sintoma:
        "O sistema pede o nome do item.",
      acao: "O campo ficou em branco. A mensagem nomeia o catálogo em que você está, então ela muda de tela para tela.",
    },
    {
      sintoma:
        "O sistema pede um nome com ao menos uma letra ou número.",
      acao: "O texto digitado só tem pontuação ou símbolo.",
    },
    {
      sintoma:
        "O sistema não deixa desativar nem apagar a última linha de serviço ativa.",
      acao: "É trava de propósito: toda vaga precisa de uma linha de serviço para ser publicada. Crie ou reative outra antes de tirar esta de circulação.",
    },
    {
      sintoma:
        "Você mudou a ordem e o sistema recusou.",
      acao: "A sua aba está desatualizada, e a reordenação exige a lista completa. Recarregue a página e use as setas de novo. Se as setas estiverem desligadas, a tabela está ordenada por outra coluna: clique no cabeçalho da ordem para voltar a poder reordenar.",
    },
    {
      sintoma:
        "O sistema diz que o item não existe e manda recarregar.",
      acao: "Alguém apagou o item enquanto a sua tela estava aberta. Recarregue e refaça a escolha.",
    },
    {
      sintoma:
        "Você escolheu um comercial e o sistema recusou.",
      acao: "Aquele comercial foi desativado e não recebe cadastros novos. Escolha outro, ou reative-o no catálogo antes.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
