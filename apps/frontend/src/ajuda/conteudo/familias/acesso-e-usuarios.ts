import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: usuários, papéis e liberação de menu.
 *
 * ┌─ A ARMADILHA DESTA TELA JÁ FOI CONSERTADA, E O TEXTO PRECISOU SER CORRIGIDO ────────────────┐
 * │ A primeira redação desta família dizia que a tela apaga os menus do usuário e regrava a lista   │
 * │ que a página tinha na mão, e que por isso ela REMOVIA menu novo em silêncio. Isso ACONTECEU de  │
 * │ verdade, e sumiu de quatro pessoas de uma vez, mas foi consertado: hoje a tela informa ao       │
 * │ servidor QUAL catálogo ela exibiu, e o servidor só mexe dentro desse escopo, preservando o menu │
 * │ que nasceu depois. Aba velha demais leva recusa VISÍVEL pedindo recarga, em vez de remoção      │
 * │ silenciosa.                                                                                     │
 * │                                                                                                 │
 * │ O CONSELHO CONTINUA O MESMO, e é por isso que ele ficou: RECARREGUE ANTES DE SALVAR. O que muda │
 * │ é a razão, e a razão importa: antes era para não destruir acesso, agora é para você marcar      │
 * │ sobre o catálogo de hoje e não levar uma recusa no meio do trabalho.                            │
 * │                                                                                                 │
 * │ Achado pelo agente que escreveu os artigos desta tela, conferindo o texto contra o código em    │
 * │ vez de contra o briefing. Manual que descreve defeito já consertado ensina medo de uma coisa    │
 * │ que não existe mais, e é tão errado quanto manual que esconde defeito que existe.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E a liberação de menu é decisão da diretoria, nunca da equipe: menu novo nasce visível só para o
 * Super Admin, e é liberado pessoa a pessoa.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "acesso-e-usuarios",
  rotulo: "Acesso E Usuários",
  preRequisitos: [
    "Ser Super Admin: o cadastro de usuários e a área de menu não abrem para os demais papéis.",
    "Saber que liberar menu é decisão da diretoria: menu novo nasce visível só para o Super Admin.",
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema diz que o e-mail já está cadastrado.",
      acao: "Já existe um usuário com esse e-mail, ativo ou desativado. Procure na lista e reative, em vez de criar outro.",
    },
    {
      sintoma:
        "Você não consegue mudar o próprio papel.",
      acao: "É proposital: ninguém se promove sozinho. Peça a outro Super Admin.",
    },
    {
      sintoma:
        "Você não consegue desativar a si mesmo.",
      acao: "É proposital: evita o sistema ficar sem nenhum administrador ativo.",
    },
    {
      sintoma:
        "Você salvou os menus e o sistema mandou recarregar.",
      acao: "Um menu novo entrou no catálogo enquanto a sua aba estava aberta, e a recusa é proposital: ela impede que você salve marcando sobre uma lista que não é mais a de hoje. Recarregue a página e refaça a marcação."
    },
    {
      sintoma:
        "Um usuário não enxerga um menu que você acha que liberou.",
      acao: "Confira duas coisas, nesta ordem. Primeiro, se a marcação foi mesmo salva: reabra o usuário e olhe. Segundo, se aquele menu é concedível para o papel dele, porque alguns são restritos por papel e marcar não dá acesso: a própria janela avisa isso na linha do menu.",
    },
    {
      sintoma:
        "O sistema diz que o usuário não foi encontrado.",
      acao: "O usuário foi removido enquanto a sua tela estava aberta. Recarregue a página.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
