import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o cadastro do cliente e o que se configura POR cliente.
 *
 * Reúne o cadastro em si, a classificação, o pagamento do benefício, os grupos, a inativação, o
 * desligamento de pendência obrigatória e a exigência de integração. O fio comum é o CÓDIGO DO
 * CLIENTE, que é a chave de todo o sistema: é por ele que o de/para de apelido para razão social
 * resolve, e código repetido quebra esse de/para em toda tela que o usa.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "cadastros-do-cliente",
  rotulo: "Cadastros Do Cliente",
  preRequisitos: [
    "Ter o menu de Clientes liberado para o seu usuário, e ser Master ou Super Admin.",
    "Ter em mãos o código do cliente: ele é a chave, e não se repete.",
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema diz que o código do cliente já está cadastrado.",
      acao: "Esse código já existe na base. Procure o cliente pelo código antes de criar outro: código repetido quebra a ligação entre apelido e razão social em todo o sistema.",
    },
    {
      sintoma:
        "O sistema diz que o cliente não foi encontrado.",
      acao: "O cliente foi inativado ou removido enquanto a sua tela estava aberta. Recarregue a página.",
    },
    {
      sintoma:
        "O sistema recusa a opção de vínculo.",
      acao: "A opção escolhida não existe mais na lista de entidades do grupo. Recarregue a página e escolha de novo.",
    },
    {
      sintoma:
        "O sistema diz que o cliente já tem uma loja com esse nome.",
      acao: "Nome de loja é único dentro do cliente. Confira a lista de lojas daquele cliente antes de cadastrar.",
    },
    {
      sintoma:
        "Você desligou uma pendência e o cliente continua marcado como parcial.",
      acao: "A exigência é lida quando a outra tela abre. Recarregue o Gerenciador ou a Esteira para ver o sinalizador recalculado.",
    },
    {
      sintoma:
        "A aplicação em massa não pegou ninguém.",
      acao: "A seleção ficou vazia depois do filtro. Limpe a busca, refaça a seleção e confirme de novo.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
