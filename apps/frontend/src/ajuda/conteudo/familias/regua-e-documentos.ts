import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: a régua documental, que é o coração da auditoria.
 *
 * A régua resolve pelo PAR cliente mais cargo: mudou o cargo, mudou o checklist. É a distinção que
 * todos os artigos desta tela precisam dizer igual, e por isso ela mora aqui.
 *
 * A EXIGÊNCIA NÃO É ATRIBUTO DO DOCUMENTO. O catálogo de documentos guarda só o NOME; se ele é
 * obrigatório, não obrigatório ou facultativo é decidido dentro do par. Confundir as duas coisas é o
 * erro mais caro desta tela, porque leva alguém a procurar no lugar errado.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "regua-e-documentos",
  rotulo: "Régua Documental",
  preRequisitos: [
    "Ter o menu de Régua Documental liberado para o seu usuário, e ser Master ou Super Admin.",
    "Saber o par de cliente e cargo que você vai configurar: é ele que a régua resolve.",
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema recusa o documento novo e diz que ele já existe.",
      acao: "O nome repetido conta mesmo entre os documentos inativos. Troque o filtro para os inativos e reative o que já existe.",
    },
    {
      sintoma:
        "O sistema diz que o tipo de documento não foi encontrado.",
      acao: "O documento foi inativado enquanto a sua tela estava aberta. Recarregue a página.",
    },
    {
      sintoma:
        "O cliente não aparece na lista para você cadastrar a régua.",
      acao: "O seletor lista só clientes ativos. Reative o cliente na tela de Clientes antes de voltar aqui.",
    },
    {
      sintoma:
        "Você aplicou o padrão e algumas réguas não mudaram.",
      acao: "É o comportamento certo: a aplicação em massa só entra onde NÃO há régua nenhuma. Régua já cadastrada nunca é sobrescrita.",
    },
    {
      sintoma:
        "Você salvou a régua e a admissão continua com o checklist antigo.",
      acao: "O checklist é montado no nascimento da admissão. A régua nova vale para as próximas, e a admissão que já existe segue com o que recebeu.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
