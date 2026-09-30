import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: as duas filas que mostram o que a entrada automática não conseguiu resolver sozinha.
 *
 * As duas são fila de TRABALHO, não relatório: resolveu, a linha sai sozinha. E as duas existem
 * porque o sistema PREFERIU NÃO SOBRESCREVER: o dado que já estava aqui venceu, e a diferença ficou
 * guardada para uma pessoa decidir. Ler isso ao contrário gera medo desnecessário, e é por isso que
 * a frase mora na família.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "saude-da-ingestao",
  rotulo: "Saúde Da Ingestão",
  preRequisitos: [
    "Ter o menu daquela fila liberado para o seu usuário.",
    "Entender que as duas são fila de trabalho: quando zera, a linha sai sozinha.",
  ],
  seDerErrado: [
    {
      sintoma:
        "A linha aparece sem o nome do candidato.",
      acao: "É o esperado e não é erro: o nome nem sempre está disponível na hora em que a linha entra na fila. Use o identificador que aparece na mesma linha.",
    },
    {
      sintoma:
        "Você reprocessou e a entrada falhou com o mesmo motivo.",
      acao: "O dado ainda não chegou completo da origem, o que é comum quando o evento dispara antes de a pessoa terminar de preencher. Confira o motivo na coluna e reprocesse mais tarde.",
    },
    {
      sintoma:
        "O sistema diz que o identificador é inválido para reprocessar.",
      acao: "A linha chegou sem o identificador e não tem como ser reprocessada por esta tela. Escale para a administração.",
    },
    {
      sintoma:
        "O sistema diz que a divergência já foi resolvida e manda recarregar.",
      acao: "Outra pessoa resolveu a mesma linha enquanto a sua tela estava aberta. Recarregue a página.",
    },
    {
      sintoma:
        "Você ficou com medo de a entrada automática ter sobrescrito o dado que estava certo.",
      acao: "Não sobrescreveu, e é justamente por isso que a fila existe: o dado daqui venceu, nada foi alterado, e a tela só mostra a diferença para alguém decidir.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
