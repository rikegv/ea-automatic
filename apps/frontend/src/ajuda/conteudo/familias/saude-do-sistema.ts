import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o Diagnóstico Do Sistema.
 *
 * Tela de LEITURA com ação por alvo: ela mostra o que está fora do lugar e leva você até o caso, mas
 * não conserta configuração. Card verde é o estado correto, e significa nenhuma ocorrência aberta
 * naquele indicador, nunca "não mediu".
 */
export const familia: FamiliaDeArtigos = {
  codigo: "saude-do-sistema",
  rotulo: "Saúde Do Sistema",
  preRequisitos: [
    "Ter o menu de Diagnóstico Do Sistema liberado para o seu usuário, e ser Master ou Super Admin.",
    "Entender que a tela mostra e leva até o caso, mas não religa serviço nem corrige configuração.",
  ],
  seDerErrado: [
    {
      sintoma:
        "Um indicador diz que uma rotina automática está desligada.",
      acao: "Nenhum botão desta tela religa rotina. Anote o horário e escale para a administração: é ação de servidor, não de tela.",
    },
    {
      sintoma:
        "O indicador acusa cliente sem pasta cadastrada no Drive.",
      acao: "Cadastre a pasta daquele cliente na tela de Pastas Do Drive, com o código dele na chave. O alerta some no ciclo seguinte.",
    },
    {
      sintoma:
        "Todos os indicadores estão verdes e você esperava ver alguma coisa.",
      acao: "Verde é o estado correto e quer dizer nenhuma ocorrência aberta naquele indicador.",
    },
    {
      sintoma:
        "Você clicou no indicador e a lista abriu vazia.",
      acao: "A ocorrência foi resolvida entre a leitura do indicador e a abertura da janela. Recarregue a página.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
